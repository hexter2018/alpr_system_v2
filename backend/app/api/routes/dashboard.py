from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case

from app.db.session import get_db
from app.db import models
from app.schemas.dashboard import KPI

router = APIRouter()


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

    # auto_master heuristic
    auto_master = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.confidence >= 0.95)
        .scalar()
        or 0
    )

    # ── Time-based stats ──
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=7)

    today_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= today_start)
        .scalar()
        or 0
    )
    yesterday_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(
            and_(
                models.PlateRead.created_at >= yesterday_start,
                models.PlateRead.created_at < today_start,
            )
        )
        .scalar()
        or 0
    )
    last_7_days_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= seven_days_ago)
        .scalar()
        or 0
    )

    # Province coverage
    with_province_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(
            and_(
                models.PlateRead.province.isnot(None),
                models.PlateRead.province != "",
            )
        )
        .scalar()
        or 0
    )
    without_province_reads = total_reads - with_province_reads

    # ── Processing speed estimate ──
    # Compute average time between capture and read creation for recent records
    avg_processing_ms = None
    try:
        recent_limit = 100
        subq = (
            db.query(
                func.extract(
                    "epoch",
                    models.PlateRead.created_at - models.Capture.captured_at,
                )
            )
            .join(models.Detection, models.PlateRead.detection_id == models.Detection.id)
            .join(models.Capture, models.Detection.capture_id == models.Capture.id)
            .order_by(models.PlateRead.id.desc())
            .limit(recent_limit)
            .all()
        )
        if subq:
            diffs = [row[0] for row in subq if row[0] is not None and row[0] >= 0]
            if diffs:
                avg_processing_ms = round((sum(diffs) / len(diffs)) * 1000, 1)
    except Exception:
        avg_processing_ms = None

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
        avg_processing_ms=avg_processing_ms,
    )
