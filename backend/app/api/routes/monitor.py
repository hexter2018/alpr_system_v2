import platform
import time
from datetime import timedelta

from fastapi import APIRouter, Depends
import psutil
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.db.session import get_db
from app.db import models
from app.services.queue import celery
from app.utils.dt import now_bkk

router = APIRouter()

_start_time = time.time()


def _get_celery_cluster_status() -> dict:
    """Return Celery worker and queue metrics with safe fallbacks."""
    default_status = {
        "queue_status": "offline",
        "active_workers": 0,
        "queue_length": 0,
    }

    try:
        inspector = celery.control.inspect(timeout=1.0)
        ping_result = inspector.ping() or {}
        active_workers = len(ping_result)

        queue_length = 0
        try:
            redis_client = celery.connection_for_read().default_channel.client
            queue_name = celery.conf.task_default_queue or "celery"
            queue_length = int(redis_client.llen(queue_name) or 0)
        except Exception:
            queue_length = 0

        return {
            "queue_status": "online" if active_workers > 0 else "offline",
            "active_workers": active_workers,
            "queue_length": queue_length,
        }
    except Exception:
        return default_status


def _get_system_resource_metrics() -> dict:
    """Return CPU, memory, and disk usage with safe defaults."""
    try:
        cpu_percent = float(psutil.cpu_percent(interval=0.1))
        memory_info = psutil.virtual_memory()
        disk_info = psutil.disk_usage("/")

        return {
            "cpu_percent": cpu_percent,
            "memory_total": int(memory_info.total),
            "memory_available": int(memory_info.available),
            "memory_percent": float(memory_info.percent),
            "disk_percent": float(disk_info.percent),
        }
    except Exception:
        return {
            "cpu_percent": 0.0,
            "memory_total": 0,
            "memory_available": 0,
            "memory_percent": 0.0,
            "disk_percent": 0.0,
        }


@router.get("/monitor/system")
def monitor_system_status():
    """Celery queue and host resource status for dashboard cards."""
    queue_metrics = _get_celery_cluster_status()
    system_metrics = _get_system_resource_metrics()

    return {
        "queue_status": queue_metrics["queue_status"],
        "active_workers": queue_metrics["active_workers"],
        "queue_length": queue_metrics["queue_length"],
        "system_resources": {
            "cpu_percent": system_metrics["cpu_percent"],
            "memory_percent": system_metrics["memory_percent"],
            "disk_percent": system_metrics["disk_percent"],
            "memory_total": system_metrics["memory_total"],
            "memory_available": system_metrics["memory_available"],
        },
    }


@router.get("/monitor/health")
def monitor_health(db: Session = Depends(get_db)):
    """System health overview for the monitoring dashboard."""
    now = now_bkk()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    one_hour_ago = now - timedelta(hours=1)
    uptime_seconds = time.time() - _start_time

    queue_metrics = _get_celery_cluster_status()
    system_metrics = _get_system_resource_metrics()

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
    # Only consider captures from the last 24 hours so stale historical rows
    # (which can produce multi-hour deltas) never corrupt the metric.
    # Deltas are also capped at MAX_PROCESSING_DELTA_S to reject outliers that
    # slip through (e.g. timezone-aware vs naive mismatches, queued backlogs).
    # Median is used instead of mean so a handful of slow outliers cannot
    # dominate the reported average.
    MAX_PROCESSING_DELTA_S = 300  # 5 minutes — anything above is an outlier
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
                # Strip tzinfo so aware and naive datetimes can be compared safely
                if getattr(read_ts, "tzinfo", None) is not None:
                    read_ts = read_ts.replace(tzinfo=None)
                if getattr(cap_ts, "tzinfo", None) is not None:
                    cap_ts = cap_ts.replace(tzinfo=None)
                delta = (read_ts - cap_ts).total_seconds()
                # Keep only plausible processing-time deltas
                if 0 <= delta <= MAX_PROCESSING_DELTA_S:
                    diffs.append(delta)
            if diffs:
                # Use median to be robust against stragglers
                diffs.sort()
                mid = len(diffs) // 2
                median_s = diffs[mid] if len(diffs) % 2 else (diffs[mid - 1] + diffs[mid]) / 2
                avg_processing_ms = round(median_s * 1000, 1)
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
        "queue_status": queue_metrics["queue_status"],
        "active_workers": queue_metrics["active_workers"],
        "queue_length": queue_metrics["queue_length"],
        "system_resources": {
            "cpu_percent": system_metrics["cpu_percent"],
            "memory_percent": system_metrics["memory_percent"],
            "disk_percent": system_metrics["disk_percent"],
            "memory_total": system_metrics["memory_total"],
            "memory_available": system_metrics["memory_available"],
        },
    }
