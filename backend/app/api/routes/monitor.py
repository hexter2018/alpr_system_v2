import platform
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.db.session import get_db
from app.db import models

router = APIRouter()

_start_time = time.time()


@router.get("/monitor/health")
def monitor_health(db: Session = Depends(get_db)):
    """System health overview for the monitoring dashboard."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    one_hour_ago = now - timedelta(hours=1)
    uptime_seconds = time.time() - _start_time

    # ── Database stats ──
    total_captures = db.query(func.count(models.Capture.id)).scalar() or 0
    total_reads = db.query(func.count(models.PlateRead.id)).scalar() or 0
    pending_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.status == models.ReadStatus.PENDING)
        .scalar() or 0
    )
    verified_reads = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.status == models.ReadStatus.VERIFIED)
        .scalar() or 0
    )
    total_master = db.query(func.count(models.MasterPlate.id)).scalar() or 0

    # ── Throughput last hour ──
    reads_last_hour = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= one_hour_ago)
        .scalar() or 0
    )
    reads_today = (
        db.query(func.count(models.PlateRead.id))
        .filter(models.PlateRead.created_at >= today_start)
        .scalar() or 0
    )

    # ── Processing speed (avg ms) ──
    avg_processing_ms = None
    try:
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
            .limit(50)
            .all()
        )
        if subq:
            diffs = [row[0] for row in subq if row[0] is not None and row[0] >= 0]
            if diffs:
                avg_processing_ms = round((sum(diffs) / len(diffs)) * 1000, 1)
    except Exception:
        avg_processing_ms = None

    # ── Confidence distribution ──
    confidence_buckets = {"high": 0, "medium": 0, "low": 0}
    try:
        high = db.query(func.count(models.PlateRead.id)).filter(models.PlateRead.confidence >= 0.8).scalar() or 0
        medium = db.query(func.count(models.PlateRead.id)).filter(
            and_(models.PlateRead.confidence >= 0.5, models.PlateRead.confidence < 0.8)
        ).scalar() or 0
        low = db.query(func.count(models.PlateRead.id)).filter(models.PlateRead.confidence < 0.5).scalar() or 0
        confidence_buckets = {"high": high, "medium": medium, "low": low}
    except Exception:
        pass

    # ── Hourly throughput (last 24h) ──
    hourly = []
    try:
        for i in range(24):
            h_start = today_start - timedelta(hours=23 - i)
            h_end = h_start + timedelta(hours=1)
            count = (
                db.query(func.count(models.PlateRead.id))
                .filter(and_(
                    models.PlateRead.created_at >= h_start,
                    models.PlateRead.created_at < h_end,
                ))
                .scalar() or 0
            )
            hourly.append({
                "hour": h_start.strftime("%H:%M"),
                "count": count,
            })
    except Exception:
        hourly = []

    # ── Camera status ──
    cameras = []
    try:
        camera_rows = db.query(models.Camera).all()
        for cam in camera_rows:
            last_capture = (
                db.query(func.max(models.Capture.captured_at))
                .filter(models.Capture.camera_id == cam.camera_id)
                .scalar()
            )
            cameras.append({
                "camera_id": cam.camera_id,
                "name": cam.name,
                "enabled": cam.enabled,
                "last_capture": last_capture.isoformat() if last_capture else None,
            })
    except Exception:
        cameras = []

    return {
        "timestamp": now.isoformat(),
        "uptime_seconds": round(uptime_seconds, 1),
        "python_version": platform.python_version(),
        "database": {
            "total_captures": total_captures,
            "total_reads": total_reads,
            "pending_reads": pending_reads,
            "verified_reads": verified_reads,
            "total_master": total_master,
        },
        "throughput": {
            "reads_last_hour": reads_last_hour,
            "reads_today": reads_today,
            "avg_processing_ms": avg_processing_ms,
        },
        "confidence_distribution": confidence_buckets,
        "hourly_throughput": hourly,
        "cameras": cameras,
    }
