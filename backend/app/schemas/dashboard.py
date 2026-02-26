from pydantic import BaseModel


class KPI(BaseModel):
    total_reads: int
    pending: int
    verified: int
    auto_master: int
    master_total: int
    mlpr_total: int
    alpr_total: int
    today_reads: int
    yesterday_reads: int
    last_7_days_reads: int
    with_province_reads: int
    without_province_reads: int
