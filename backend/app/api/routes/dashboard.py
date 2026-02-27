from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Response
from sqlalchemy import and_, case, func
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
def dashboard_kpi(response: Response, db: Session = Depends(get_db)):
    # Prevent stale responses for this frequently refreshed endpoint.
    response.headers["Cache-Control"] = "no-store"

    today_local = datetime.now(LOCAL_TZ).date()
    yesterday_local = today_local - timedelta(days=1)
    last_7_start_local = today_local - timedelta(days=6)

    today_start, today_end = _local_date_range_to_utc_naive(today_local)
    yesterday_start, yesterday_end = _local_date_range_to_utc_naive(yesterday_local)
    week_start, _ = _local_date_range_to_utc_naive(last_7_start_local)
    _, week_end = _local_date_range_to_utc_naive(today_local)

    plate_stats = db.query(
        func.count(models.PlateRead.id).label("total_reads"),
        func.sum(
            case((models.PlateRead.status == models.ReadStatus.PENDING, 1), else_=0)
        ).label("pending"),
        func.sum(
            case((models.PlateRead.status == models.ReadStatus.VERIFIED, 1), else_=0)
        ).label("verified"),
        func.sum(
            case((models.PlateRead.confidence >= 0.95, 1), else_=0)
        ).label("auto_master"),
        func.sum(
            case(
                (
                    and_(
                        models.PlateRead.created_at >= today_start,
                        models.PlateRead.created_at < today_end,
                    ),
                    1,
                ),
                else_=0,
            )
        ).label("today_reads"),
        func.sum(
            case(
                (
                    and_(
                        models.PlateRead.created_at >= yesterday_start,
                        models.PlateRead.created_at < yesterday_end,
                    ),
                    1,
                ),
                else_=0,
            )
        ).label("yesterday_reads"),
        func.sum(
            case(
                (
                    and_(
                        models.PlateRead.created_at >= week_start,
                        models.PlateRead.created_at < week_end,
                    ),
                    1,
                ),
                else_=0,
            )
        ).label("last_7_days_reads"),
        func.sum(
            case(
                (
                    and_(
                        models.PlateRead.province.isnot(None),
                        models.PlateRead.province != "",
                    ),
                    1,
                ),
                else_=0,
            )
        ).label("with_province_reads"),
    ).one()

    master_total = db.query(func.count(models.MasterPlate.id)).scalar() or 0

    verification_stats = db.query(
        func.sum(
            case((models.VerificationJob.result_type == models.VerifyResultType.ALPR, 1), else_=0)
        ).label("alpr_total"),
        func.sum(
            case((models.VerificationJob.result_type == models.VerifyResultType.MLPR, 1), else_=0)
        ).label("mlpr_total"),
    ).one()

    total_reads = plate_stats.total_reads or 0
    with_province_reads = plate_stats.with_province_reads or 0

    return KPI(
        total_reads=total_reads,
        pending=plate_stats.pending or 0,
        verified=plate_stats.verified or 0,
        auto_master=plate_stats.auto_master or 0,
        master_total=master_total,
        mlpr_total=verification_stats.mlpr_total or 0,
        alpr_total=verification_stats.alpr_total or 0,
        today_reads=plate_stats.today_reads or 0,
        yesterday_reads=plate_stats.yesterday_reads or 0,
        last_7_days_reads=plate_stats.last_7_days_reads or 0,
        with_province_reads=with_province_reads,
        without_province_reads=max(total_reads - with_province_reads, 0),
    )
