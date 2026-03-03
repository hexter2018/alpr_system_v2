from pydantic import BaseModel
from typing import Optional


class KPI(BaseModel):
    total_reads: int
    pending: int
    verified: int
    auto_master: int
    master_total: int
    mlpr_total: int
    alpr_total: int
    # Extended stats
    today_reads: int = 0
    yesterday_reads: int = 0
    last_7_days_reads: int = 0
    with_province_reads: int = 0
    without_province_reads: int = 0
    avg_processing_ms: Optional[float] = None  # avg ms per plate
