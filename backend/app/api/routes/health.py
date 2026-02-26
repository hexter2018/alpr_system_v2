from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import redis
import os

from app.db.session import get_db
from app.db import models
from app.core.config import settings
from app.schemas.health import (
    HealthMetricsOut, CameraHealthOut, WorkerHealthOut,
    SystemHealthOut
)

router = APIRouter()

# Redis connection for queue depth
REDIS_URL = os.getenv("REDIS_URL", settings.redis_url)

def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)

@router.get("/system", response_model=SystemHealthOut)
def get_system_health(db: Session = Depends(get_db)):
    """Get overall system health status"""
    r = get_redis()
    
    # Camera health
    cameras = db.query(models.Camera).filter(models.Camera.enabled == True).all()
    online_cameras = sum(1 for c in cameras if c.status == "ONLINE")
    offline_cameras = len(cameras) - online_cameras
    
    # Queue depth (Celery + Redis)
    try:
        celery_queue_len = r.llen("celery") or 0
    except:
        celery_queue_len = 0
    
    # Recent processing stats (last hour)
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent_reads = db.query(func.count(models.PlateRead.id)).filter(
        models.PlateRead.created_at >= one_hour_ago
    ).scalar() or 0
    
    # Average confidence (last 100 reads)
    avg_conf_result = db.query(func.avg(models.PlateRead.confidence)).filter(
        models.PlateRead.created_at >= one_hour_ago
    ).scalar()
    avg_confidence = float(avg_conf_result) if avg_conf_result else 0.0
    
    # Unacknowledged alerts
    unack_alerts = db.query(func.count(models.Alert.id)).filter(
        models.Alert.acknowledged == False
    ).scalar() or 0
    
    # Pending verification queue
    pending_queue = db.query(func.count(models.PlateRead.id)).filter(
        models.PlateRead.status == models.ReadStatus.PENDING
    ).scalar() or 0
    
    return SystemHealthOut(
        status="healthy" if offline_cameras == 0 and celery_queue_len < 100 else "degraded",
        timestamp=datetime.utcnow(),
        cameras_online=online_cameras,
        cameras_offline=offline_cameras,
        queue_depth=celery_queue_len,
        pending_verifications=pending_queue,
        recent_reads_1h=recent_reads,
        avg_confidence=avg_confidence,
        unacknowledged_alerts=unack_alerts
    )

@router.get("/cameras", response_model=List[CameraHealthOut])
def get_cameras_health(db: Session = Depends(get_db)):
    """Get health status for all cameras"""
    cameras = db.query(models.Camera).filter(models.Camera.enabled == True).all()
    results = []
    
    for camera in cameras:
        # Get latest FPS metric
        latest_fps = db.query(models.SystemMetric).filter(
            models.SystemMetric.metric_type == "camera_fps",
            models.SystemMetric.metric_name == camera.camera_id
        ).order_by(desc(models.SystemMetric.timestamp)).first()
        
        current_fps = latest_fps.value if latest_fps else 0.0
        
        # Calculate uptime percentage (last 24h)
        one_day_ago = datetime.utcnow() - timedelta(days=1)
        total_metrics = db.query(func.count(models.SystemMetric.id)).filter(
            models.SystemMetric.metric_type == "camera_fps",
            models.SystemMetric.metric_name == camera.camera_id,
            models.SystemMetric.timestamp >= one_day_ago
        ).scalar() or 0
        
        # Assume metrics are logged every 10 seconds, so 8640 expected in 24h
        expected_metrics = 8640
        uptime_pct = min(100.0, (total_metrics / max(expected_metrics, 1)) * 100)
        
        # Recent reads count
        recent_reads = db.query(func.count(models.PlateRead.id)).join(
            models.Detection
        ).join(
            models.Capture
        ).filter(
            models.Capture.camera_id == camera.camera_id,
            models.PlateRead.created_at >= one_day_ago
        ).scalar() or 0
        
        results.append(CameraHealthOut(
            camera_id=camera.camera_id,
            name=camera.name,
            status=camera.status,
            last_seen=camera.last_seen,
            current_fps=current_fps,
            uptime_24h=uptime_pct,
            recent_reads_24h=recent_reads
        ))
    
    return results

@router.get("/workers", response_model=List[WorkerHealthOut])
def get_workers_health(db: Session = Depends(get_db)):
    """Get health status for Celery workers"""
    r = get_redis()
    
    # Get active workers from Celery
    try:
        # This would normally use Celery inspect, but we'll use Redis metrics
        # In production, you'd use: celery_app.control.inspect().active()
        
        # Get recent worker latency metrics (last 5 minutes)
        five_min_ago = datetime.utcnow() - timedelta(minutes=5)
        worker_metrics = db.query(
            models.SystemMetric.metric_name,
            func.avg(models.SystemMetric.value).label("avg_latency"),
            func.count(models.SystemMetric.id).label("task_count")
        ).filter(
            models.SystemMetric.metric_type == "worker_latency",
            models.SystemMetric.timestamp >= five_min_ago
        ).group_by(models.SystemMetric.metric_name).all()
        
        results = []
        for metric in worker_metrics:
            results.append(WorkerHealthOut(
                worker_name=metric.metric_name,
                status="active",
                avg_latency_ms=float(metric.avg_latency),
                tasks_processed_5m=int(metric.task_count)
            ))
        
        return results
    except Exception as e:
        return []

@router.get("/metrics", response_model=List[HealthMetricsOut])
def get_health_metrics(
    metric_type: Optional[str] = Query(None),
    metric_name: Optional[str] = Query(None),
    hours: int = Query(1, ge=1, le=168),  # 1 hour to 1 week
    db: Session = Depends(get_db)
):
    """Get time-series health metrics"""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    query = db.query(models.SystemMetric).filter(
        models.SystemMetric.timestamp >= cutoff
    )
    
    if metric_type:
        query = query.filter(models.SystemMetric.metric_type == metric_type)
    if metric_name:
        query = query.filter(models.SystemMetric.metric_name == metric_name)
    
    metrics = query.order_by(desc(models.SystemMetric.timestamp)).limit(1000).all()
    
    return [HealthMetricsOut.model_validate(m) for m in metrics]

@router.post("/heartbeat/{camera_id}")
def record_camera_heartbeat(
    camera_id: str,
    fps: float = Query(...),
    db: Session = Depends(get_db)
):
    """Record camera heartbeat (called by stream processor)"""
    # Update camera last_seen
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if camera:
        camera.last_seen = datetime.utcnow()
        camera.status = "ONLINE"
        db.commit()
    
    # Record FPS metric
    metric = models.SystemMetric(
        metric_type="camera_fps",
        metric_name=camera_id,
        value=fps,
        timestamp=datetime.utcnow()
    )
    db.add(metric)
    db.commit()
    
    return {"ok": True, "camera_id": camera_id, "fps": fps}

@router.post("/metric")
def record_metric(
    metric_type: str = Query(...),
    metric_name: str = Query(...),
    value: float = Query(...),
    db: Session = Depends(get_db)
):
    """Record a system metric (generic endpoint)"""
    metric = models.SystemMetric(
        metric_type=metric_type,
        metric_name=metric_name,
        value=value,
        timestamp=datetime.utcnow()
    )
    db.add(metric)
    db.commit()
    
    return {"ok": True, "metric_type": metric_type, "metric_name": metric_name}