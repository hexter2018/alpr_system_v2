"""
backend/app/api/routes/mlops.py
================================
REST endpoints สำหรับ manual trigger ของ MLOps pipeline

Endpoints:
  POST /api/mlops/trigger-ocr-finetune   → dispatch run_ocr_finetune ทันที
  POST /api/mlops/trigger-yolo-retrain   → dispatch export_yolo_dataset ทันที
  GET  /api/mlops/status                 → ดู lock file + pending sample count
"""
import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db

log = logging.getLogger(__name__)
router = APIRouter()

REDIS_URL     = os.getenv("REDIS_URL",     "redis://redis:6379/0")
LOCK_FILE     = "/tmp/mlops_training.lock"


# ── Shared Celery app (lazy import — mlops package may not always be present) ──
def _get_celery():
    try:
        from celery import Celery
        app = Celery(broker=REDIS_URL, backend=REDIS_URL)
        return app
    except ImportError:
        raise HTTPException(status_code=503, detail="Celery not available in this container")


# ── Request / Response schemas ──────────────────────────────────────────────

class TriggerOCRRequest(BaseModel):
    limit:  int = 7000
    epochs: int = 10

class TriggerYOLORequest(BaseModel):
    limit: int = 5000

class TriggerResponse(BaseModel):
    ok:       bool
    task_id:  str | None = None
    message:  str
    ts:       str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/mlops/trigger-ocr-finetune", response_model=TriggerResponse, tags=["mlops"])
def trigger_ocr_finetune(body: TriggerOCRRequest = TriggerOCRRequest()):
    """
    Dispatch `run_ocr_finetune` to the training queue immediately,
    bypassing the hourly beat schedule.

    Useful when you want to kick off OCR retraining right now without
    waiting for the threshold check or the next cron tick.
    """
    if os.path.exists(LOCK_FILE):
        raise HTTPException(
            status_code=409,
            detail="A training pipeline is already running (lock file present). "
                   "Wait for it to finish before triggering a new run.",
        )

    try:
        celery = _get_celery()
        result = celery.send_task(
            "mlops.tasks.ocr_pipeline.run_ocr_finetune",
            kwargs={"limit": body.limit, "epochs": body.epochs},
            queue="training",
        )
        # Write lock so the hourly beat check doesn't also trigger
        with open(LOCK_FILE, "w") as f:
            f.write(datetime.now(timezone.utc).isoformat())

        log.info("[MLOps API] OCR finetune dispatched manually. task_id=%s", result.id)
        return TriggerResponse(
            ok=True,
            task_id=result.id,
            message=f"run_ocr_finetune dispatched (limit={body.limit}, epochs={body.epochs})",
            ts=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("[MLOps API] Failed to dispatch OCR finetune: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/mlops/trigger-yolo-retrain", response_model=TriggerResponse, tags=["mlops"])
def trigger_yolo_retrain(body: TriggerYOLORequest = TriggerYOLORequest()):
    """
    Dispatch `export_yolo_dataset` (head of the YOLO retrain pipeline)
    to the training queue immediately.
    """
    if os.path.exists(LOCK_FILE):
        raise HTTPException(
            status_code=409,
            detail="A training pipeline is already running (lock file present). "
                   "Wait for it to finish before triggering a new run.",
        )

    try:
        celery = _get_celery()
        result = celery.send_task(
            "mlops.tasks.yolo_retrain.export_yolo_dataset",
            kwargs={"limit": body.limit},
            queue="training",
        )
        with open(LOCK_FILE, "w") as f:
            f.write(datetime.now(timezone.utc).isoformat())

        log.info("[MLOps API] YOLO retrain dispatched manually. task_id=%s", result.id)
        return TriggerResponse(
            ok=True,
            task_id=result.id,
            message=f"export_yolo_dataset dispatched (limit={body.limit})",
            ts=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("[MLOps API] Failed to dispatch YOLO retrain: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/mlops/status", tags=["mlops"])
def get_mlops_status(db: Session = Depends(get_db)):
    """
    Returns:
      - lock_active    : bool  — True if a training run is in progress
      - lock_since     : str   — ISO timestamp when lock was acquired (if active)
      - pending_samples: int   — feedback_samples not yet used in training
    """
    lock_active = os.path.exists(LOCK_FILE)
    lock_since: str | None = None
    if lock_active:
        try:
            lock_since = open(LOCK_FILE).read().strip()
        except Exception:
            lock_since = "unknown"

    try:
        pending = db.execute(
            text("SELECT COUNT(*) FROM feedback_samples WHERE used_in_train = FALSE")
        ).scalar() or 0
    except Exception:
        pending = -1  # DB unavailable

    return {
        "lock_active":     lock_active,
        "lock_since":      lock_since,
        "pending_samples": int(pending),
        "yolo_threshold":  int(os.getenv("RETRAIN_THRESHOLD",     "1000")),
        "ocr_threshold":   int(os.getenv("OCR_RETRAIN_THRESHOLD", "1000")),
        "ts":              datetime.now(timezone.utc).isoformat(),
    }
