from pydantic import BaseModel
from typing import List, Tuple, Optional, Literal


class SetZoneMessage(BaseModel):
    """Message to configure trigger zone"""
    type: Literal["set_zone"] = "set_zone"
    points: List[Tuple[float, float]]
    zone_type: str = "polygon"


class FrameMessage(BaseModel):
    """Message containing a video frame"""
    type: Literal["frame"] = "frame"
    frame_data: str  # base64 encoded image
    frame_number: int
    timestamp: Optional[float] = None


class TrackingResponse(BaseModel):
    """Response with tracking results"""
    frame_number: int
    timestamp: str
    active_tracks: int
    detections: int
    processing_triggered: int
    tracks: List[dict]
    ocr_results: List[dict]
    stats: dict