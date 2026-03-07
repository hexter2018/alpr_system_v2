from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case

from app.db.session import get_db
from app.db import models
from app.schemas.dashboard import KPI
from app.utils.dt import now_bkk

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
    now = now_bkk()
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

    # ── Processing speed estimate (median over last 24 h, outliers capped) ──
    # Only consider captures from the last 24 hours to avoid stale rows
    # inflating the metric.  Deltas are capped at MAX_PROCESSING_DELTA_S so
    # timezone mismatches or backlogged jobs don't corrupt the number.
    # Median is used instead of mean for robustness against stragglers.
    MAX_PROCESSING_DELTA_S = 300  # 5 minutes cap
    avg_processing_ms = None
    try:
        recent_window = now - timedelta(hours=24)
        samples = (
            db.query(models.PlateRead.created_at, models.Capture.captured_at)
            .join(models.Detection, models.PlateRead.detection_id == models.Detection.id)
            .join(models.Capture, models.Detection.capture_id == models.Capture.id)
            .filter(models.Capture.captured_at >= recent_window)
            .order_by(models.PlateRead.id.desc())
            .limit(100)
            .all()
        )
        if samples:
            diffs = []
            for read_ts, cap_ts in samples:
                if read_ts is None or cap_ts is None:
                    continue
                # Strip tzinfo so aware and naive datetimes compare safely
                if getattr(read_ts, "tzinfo", None) is not None:
                    read_ts = read_ts.replace(tzinfo=None)
                if getattr(cap_ts, "tzinfo", None) is not None:
                    cap_ts = cap_ts.replace(tzinfo=None)
                delta = (read_ts - cap_ts).total_seconds()
                if 0 <= delta <= MAX_PROCESSING_DELTA_S:
                    diffs.append(delta)
            if diffs:
                diffs.sort()
                mid = len(diffs) // 2
                median_s = diffs[mid] if len(diffs) % 2 else (diffs[mid - 1] + diffs[mid]) / 2
                avg_processing_ms = round(median_s * 1000, 1)
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
