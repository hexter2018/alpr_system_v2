from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class SearchResultOut(BaseModel):
    id: int
    plate_text: str
    plate_text_norm: str
    province: str
    confidence: float
    status: str
    created_at: datetime
    camera_id: Optional[str] = None
    camera_name: str = ""
    original_url: str
    crop_url: str
    bbox: str
    on_watchlist: bool
    watchlist_info: Optional[Dict[str, Any]] = None

class SearchFilters(BaseModel):
    """Advanced search filter parameters"""
    q: Optional[str] = None
    camera_id: Optional[str] = None
    province: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    min_confidence: Optional[float] = None
    status: Optional[str] = None
    watchlist_only: bool = False
    limit: int = 50
    offset: int = 0