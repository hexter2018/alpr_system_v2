"""Shared datetime helpers – always returns Asia/Bangkok-aware datetimes.

Usage:
    from app.utils.dt import now_bkk, BKK

    ts = now_bkk()          # timezone-aware Bangkok datetime
    mapped_column(DateTime, default=now_bkk)  # SQLAlchemy column default
"""
from datetime import datetime
from zoneinfo import ZoneInfo

BKK = ZoneInfo("Asia/Bangkok")


def now_bkk() -> datetime:
    """Return the current wall-clock time as a timezone-aware Asia/Bangkok datetime."""
    return datetime.now(BKK)
