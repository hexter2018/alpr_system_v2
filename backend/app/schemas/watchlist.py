from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class WatchlistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    plate_text_norm: str
    list_type: str  # BLACKLIST or WHITELIST
    reason: Optional[str] = None
    alert_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    created_by: Optional[str] = None
    created_at: datetime
    expires_at: Optional[datetime] = None
    active: bool

class WatchlistCreateIn(BaseModel):
    plate_text_norm: str
    list_type: str  # BLACKLIST or WHITELIST
    reason: Optional[str] = None
    alert_level: str = "MEDIUM"
    created_by: Optional[str] = None
    expires_at: Optional[datetime] = None

class WatchlistUpdateIn(BaseModel):
    reason: Optional[str] = None
    alert_level: Optional[str] = None
    expires_at: Optional[datetime] = None
    active: Optional[bool] = None

class AlertOut(BaseModel):
    id: int
    read_id: int
    watchlist_id: int
    camera_id: Optional[str] = None
    alert_level: str
    acknowledged: bool
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    created_at: datetime
    # Enriched fields
    plate_text: str
    plate_text_norm: str
    confidence: float