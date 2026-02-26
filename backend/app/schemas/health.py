from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime

class SystemHealthOut(BaseModel):
    status: str  # healthy, degraded, critical
    timestamp: datetime
    cameras_online: int
    cameras_offline: int
    queue_depth: int
    pending_verifications: int
    recent_reads_1h: int
    avg_confidence: float
    unacknowledged_alerts: int

class CameraHealthOut(BaseModel):
    camera_id: str
    name: str
    status: str
    last_seen: Optional[datetime] = None
    current_fps: float
    uptime_24h: float  # percentage
    recent_reads_24h: int

class WorkerHealthOut(BaseModel):
    worker_name: str
    status: str  # active, idle, offline
    avg_latency_ms: float
    tasks_processed_5m: int

class HealthMetricsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    metric_type: str
    metric_name: str
    value: float
    metric_metadata: Optional[Dict[str, Any]] = None
    timestamp: datetime