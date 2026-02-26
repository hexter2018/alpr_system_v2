from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.schemas.dashboard import KPI

router = APIRouter()
LOCAL_TZ = ZoneInfo("Asia/Bangkok")
UTC_TZ = ZoneInfo("UTC")


def _local_date_range_to_utc_naive(date_value: datetime.date) -> tuple[datetime, datetime]:
    start_local = datetime.combine(date_value, datetime.min.time(), tzinfo=LOCAL_TZ)
    end_local = start_local + timedelta(days=1)
    return (
        start_local.astimezone(UTC_TZ).replace(tzinfo=None),
        end_local.astimezone(UTC_TZ).replace(tzinfo=None),
    )


@router.get("/dashboard/kpi", response_model=KPI)
def dashboard_kpi(db: Session = Depends(get_db)):
    total_reads = db.query(func.count(models.PlateRead.id)).scalar() or 0
    pending = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.status == models.ReadStatus.PENDING)
        .scalar()
        or 0
    )
    verified = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.status == models.ReadStatus.VERIFIED)
        .scalar()
        or 0
    )

    master_total = db.query(func.count(models.MasterPlate.id)).scalar() or 0

    alpr_total = (
        db.query(func.count(models.VerificationJob.id))
        .filter(models.VerificationJob.result_type == models.VerifyResultType.ALPR)
        .scalar()
        or 0
    )
    mlpr_total = (
        db.query(func.count(models.VerificationJob.id))
        .filter(models.VerificationJob.result_type == models.VerifyResultType.MLPR)
        .scalar()
        or 0
    )

    auto_master = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.confidence >= 0.95)
        .scalar()
        or 0
    )

    today_local = datetime.now(LOCAL_TZ).date()
    yesterday_local = today_local - timedelta(days=1)
    last_7_start_local = today_local - timedelta(days=6)

    today_start, today_end = _local_date_range_to_utc_naive(today_local)
    yesterday_start, yesterday_end = _local_date_range_to_utc_naive(yesterday_local)
    week_start, _ = _local_date_range_to_utc_naive(last_7_start_local)
    _, week_end = _local_date_range_to_utc_naive(today_local)

    today_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= today_start, models.PlateRead.created_at < today_end)
        .scalar()
        or 0
    )
    yesterday_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= yesterday_start, models.PlateRead.created_at < yesterday_end)
        .scalar()
        or 0
    )
    last_7_days_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= week_start, models.PlateRead.created_at < week_end)
        .scalar()
        or 0
    )

    with_province_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.province.isnot(None), models.PlateRead.province != "")
        .scalar()
        or 0
    )
    without_province_reads = max(total_reads - with_province_reads, 0)

    return KPI(
        total_reads=total_reads,
        pending=pending,
        verified=verified,
        auto_master=auto_master,
        master_total=master_total,
        mlpr_total=mlpr_total,
        alpr_total=alpr_total,
        today_reads=today_reads,
        yesterday_reads=yesterday_reads,
        last_7_days_reads=last_7_days_reads,
        with_province_reads=with_province_reads,
        without_province_reads=without_province_reads,
    )
