import enum
from datetime import datetime
from sqlalchemy import (
    String, Integer, DateTime, Enum, Float, Boolean, ForeignKey, Text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base

class ReadStatus(str, enum.Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"

class VerifyResultType(str, enum.Enum):
    ALPR = "ALPR"   # confirmed correct after human verify
    MLPR = "MLPR"   # corrected by human

class WatchlistType(str, enum.Enum):
    BLACKLIST = "BLACKLIST"
    WHITELIST = "WHITELIST"

class Capture(Base):
    __tablename__ = "captures"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(50), default="UPLOAD")  # UPLOAD/RTSP/STREAM
    camera_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    original_path: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))

    detections: Mapped[list["Detection"]] = relationship(back_populates="capture")

class Detection(Base):
    __tablename__ = "detections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    capture_id: Mapped[int] = mapped_column(ForeignKey("captures.id"), index=True)
    crop_path: Mapped[str] = mapped_column(Text)
    det_conf: Mapped[float] = mapped_column(Float, default=0.0)
    bbox: Mapped[str] = mapped_column(Text, default="")  # JSON string

    capture: Mapped["Capture"] = relationship(back_populates="detections")
    reads: Mapped[list["PlateRead"]] = relationship(back_populates="detection")

class PlateRead(Base):
    __tablename__ = "plate_reads"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    detection_id: Mapped[int] = mapped_column(ForeignKey("detections.id"), index=True)

    plate_text: Mapped[str] = mapped_column(String(32), default="")
    plate_text_norm: Mapped[str] = mapped_column(String(32), default="", index=True)
    province: Mapped[str] = mapped_column(String(64), default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    status: Mapped[ReadStatus] = mapped_column(Enum(ReadStatus), default=ReadStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    detection: Mapped["Detection"] = relationship(back_populates="reads")
    verification: Mapped["VerificationJob"] = relationship(back_populates="read", uselist=False)
    alerts: Mapped[list["Alert"]] = relationship(back_populates="read")

class VerificationJob(Base):
    __tablename__ = "verification_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    read_id: Mapped[int] = mapped_column(ForeignKey("plate_reads.id"), unique=True)

    assigned_to: Mapped[str | None] = mapped_column(String(100), nullable=True)
    corrected_text: Mapped[str | None] = mapped_column(String(32), nullable=True)
    corrected_province: Mapped[str | None] = mapped_column(String(64), nullable=True)

    result_type: Mapped[VerifyResultType | None] = mapped_column(Enum(VerifyResultType), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    read: Mapped["PlateRead"] = relationship(back_populates="verification")

class MasterPlate(Base):
    __tablename__ = "master_plates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plate_text_norm: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_text: Mapped[str] = mapped_column(String(32), default="")
    province: Mapped[str] = mapped_column(String(64), default="")

    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    count_seen: Mapped[int] = mapped_column(Integer, default=1)
    editable: Mapped[bool] = mapped_column(Boolean, default=True)

class FeedbackSample(Base):
    __tablename__ = "feedback_samples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crop_path: Mapped[str] = mapped_column(Text)
    corrected_text: Mapped[str] = mapped_column(String(32))
    corrected_province: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(String(100), default="MLPR")
    used_in_train: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    camera_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    rtsp_url: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # New fields for management
    trigger_zone: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # {"points": [[x,y], ...], "type": "polygon"}
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fps: Mapped[float | None] = mapped_column(Float, default=2.0)
    status: Mapped[str] = mapped_column(String(20), default="OFFLINE")  # ONLINE, OFFLINE, ERROR

class Watchlist(Base):
    __tablename__ = "watchlist"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plate_text_norm: Mapped[str] = mapped_column(String(32), index=True)
    list_type: Mapped[WatchlistType] = mapped_column(Enum(WatchlistType))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    alert_level: Mapped[str] = mapped_column(String(20), default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    
    alerts: Mapped[list["Alert"]] = relationship(back_populates="watchlist")

class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    read_id: Mapped[int] = mapped_column(ForeignKey("plate_reads.id"), index=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlist.id"))
    camera_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    alert_level: Mapped[str] = mapped_column(String(20))
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    
    read: Mapped["PlateRead"] = relationship(back_populates="alerts")
    watchlist: Mapped["Watchlist"] = relationship(back_populates="alerts")

class SystemMetric(Base):
    __tablename__ = "system_metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    metric_type: Mapped[str] = mapped_column(String(50), index=True)  # camera_fps, queue_depth, worker_latency
    metric_name: Mapped[str] = mapped_column(String(100))  # camera_id or worker_name
    value: Mapped[float] = mapped_column(Float)
    metric_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)