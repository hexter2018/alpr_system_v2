from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Tuple
from datetime import datetime

class TriggerZone(BaseModel):
    """Trigger zone definition with points"""
    points: List[Tuple[float, float]]
    zone_type: str = "polygon"  # polygon or rectangle

class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    camera_id: str
    name: str
    rtsp_url: str
    enabled: bool
    created_at: datetime
    trigger_zone: Optional[dict] = None
    last_seen: Optional[datetime] = None
    fps: Optional[float] = None
    status: str  # ONLINE, OFFLINE, ERROR

class CameraCreateIn(BaseModel):
    camera_id: str
    name: str
    rtsp_url: Optional[str] = ""
    enabled: bool = True
    fps: float = 2.0
    trigger_zone: Optional[TriggerZone] = None

class CameraUpdateIn(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    enabled: Optional[bool] = None
    fps: Optional[float] = None
    trigger_zone: Optional[TriggerZone] = None

class TriggerZoneUpdate(BaseModel):
    trigger_zone: Optional[TriggerZone] = None

class CameraStatusUpdate(BaseModel):
    status: str  # ONLINE, OFFLINE, ERROR