import os, hashlib, uuid, logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.db import models
from app.services.queue import enqueue_process_capture

router = APIRouter()
logger = logging.getLogger(__name__)

def resolve_storage_dir() -> Path:
    preferred = Path(settings.storage_dir)
    try:
        preferred.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Configured STORAGE_DIR '{preferred}' is not usable: {exc}. "
                "Ensure backend and workers share the same writable STORAGE_DIR volume."
            ),
        ) from exc

    if not os.access(preferred, os.W_OK):
        raise HTTPException(
            status_code=500,
            detail=(
                f"Configured STORAGE_DIR '{preferred}' is not writable. "
                "Ensure backend and workers share the same writable STORAGE_DIR volume."
            ),
        )

    return preferred

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def build_output_path(storage: Path, filename: str | None) -> Path:
    # UploadFile.filename can be None when clients post raw blobs.
    safe_name = filename or ""
    ext = Path(safe_name).suffix.lower()
    if not ext:
        ext = ".jpg"

    fname = f"{uuid.uuid4().hex}{ext}"
    out_path = storage / "original" / fname
    out_path.parent.mkdir(parents=True, exist_ok=True)
    return out_path

def persist_capture(db: Session, out_path: Path) -> models.Capture:
    digest = sha256_file(out_path)
    cap = models.Capture(source="UPLOAD", original_path=str(out_path), sha256=digest)
    db.add(cap)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to persist capture record")
        raise HTTPException(status_code=500, detail="Failed to save upload metadata") from exc
    
    db.refresh(cap)
    return cap

@router.post("/upload")
async def upload_one(file: UploadFile = File(...), db: Session = Depends(get_db)):
    storage = resolve_storage_dir()
    out_path = build_output_path(storage, file.filename)

    try:
        content = await file.read()
        out_path.write_bytes(content)
    except OSError as exc:
        logger.exception("Failed to write uploaded file to disk")
        raise HTTPException(status_code=500, detail="Failed to store uploaded file") from exc

    cap = persist_capture(db, out_path)

    enqueue_error = None
    try:
        enqueue_process_capture(cap.id, str(out_path))
    except Exception as exc:
        enqueue_error = str(exc)

    return {
        "capture_id": cap.id,
        "original_path": str(out_path),
        "enqueued": enqueue_error is None,
        "enqueue_error": enqueue_error,
    }

@router.post("/upload/batch")
async def upload_batch(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    storage = resolve_storage_dir()

    ids = []
    failed_enqueues = []
    failed_files = []

    for file in files:
        try:
            out_path = build_output_path(storage, file.filename)
            out_path.write_bytes(await file.read())
            cap = persist_capture(db, out_path)

            try:
                enqueue_process_capture(cap.id, str(out_path))
            except Exception as exc:
                failed_enqueues.append({"capture_id": cap.id, "error": str(exc)})

            ids.append(cap.id)
        except Exception as exc:
            db.rollback()
            failed_files.append({"filename": file.filename or "(unknown)", "error": str(exc)})
            logger.exception("Failed to process uploaded file '%s'", file.filename)


    return {
        "capture_ids": ids,
        "count": len(ids),
        "enqueued_count": len(ids) - len(failed_enqueues),
        "failed_enqueues": failed_enqueues,
        "failed_files": failed_files,
    }
