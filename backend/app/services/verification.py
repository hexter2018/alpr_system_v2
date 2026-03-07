from sqlalchemy.orm import Session

from app.db import models
from app.schemas.reads import VerifyIn
from app.services.master import upsert_master_from_read, store_feedback_if_mlpr
from app.services.textnorm import normalize_plate_text
from app.utils.dt import now_bkk


def _coerce_plate_type(value: str | None) -> models.PlateType | None:
    """Convert a raw string to a PlateType enum, returning None if invalid."""
    if not value:
        return None
    try:
        return models.PlateType(value.upper())
    except ValueError:
        return None


def verify_read(db: Session, read: models.PlateRead, payload: VerifyIn):
    # ensure verification job exists
    job = db.query(models.VerificationJob).filter(models.VerificationJob.read_id == read.id).first()
    if not job:
        job = models.VerificationJob(read_id=read.id)
        db.add(job)
        db.flush()

    if payload.action == "confirm":
        job.result_type = models.VerifyResultType.ALPR
        job.corrected_text = None
        job.corrected_province = None
        job.corrected_plate_type = None
        read.status = models.ReadStatus.VERIFIED
        # After human confirm, treat as true ALPR and update master
        upsert_master_from_read(db, read, force=True)
    else:
        # corrected
        corr_text = payload.corrected_text or ""
        corr_prov = payload.corrected_province or ""
        corr_plate_type = _coerce_plate_type(payload.corrected_plate_type)

        job.result_type = models.VerifyResultType.MLPR
        job.corrected_text = corr_text
        job.corrected_province = corr_prov
        job.corrected_plate_type = corr_plate_type

        read.plate_text = corr_text
        read.plate_text_norm = normalize_plate_text(corr_text)
        read.province = corr_prov
        # Only update plate_type if the reviewer explicitly set one
        if corr_plate_type is not None:
            read.plate_type = corr_plate_type
        read.status = models.ReadStatus.VERIFIED

        upsert_master_from_read(db, read, force=True)
        store_feedback_if_mlpr(db, read)

    job.note = payload.note
    job.assigned_to = payload.user
    job.verified_at = now_bkk()
    db.commit()
