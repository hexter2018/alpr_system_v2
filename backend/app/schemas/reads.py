from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Literal


class ReadOut(BaseModel):
    id: int
    plate_text: str
    plate_text_norm: str
    province: Optional[str] = ""
    plate_type: Optional[str] = "STANDARD"
    confidence: float
    status: str
    created_at: datetime
    crop_url: str
    original_url: str


class VerifyIn(BaseModel):
    action: Literal["confirm", "correct"]
    corrected_text: Optional[str] = None
    corrected_province: Optional[str] = None
    corrected_plate_type: Optional[str] = None  # PlateType enum value as string
    note: Optional[str] = None
    user: Optional[str] = "reviewer"
