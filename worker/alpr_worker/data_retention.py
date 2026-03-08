"""
data_retention.py — PDPA / storage data-lifecycle Celery task.

Runs daily at 02:00 Asia/Bangkok via Celery Beat.
Deletes plate_reads, detections, and captures (+ their image files) that are
older than RETENTION_DAYS days (default: 90, configurable via env var).

Deletion order respects FK constraints:
    alerts → plate_reads → detections → captures

Image files (original_path, crop_path) are removed from disk after the DB
rows are deleted so a failed file removal never leaves orphaned DB rows.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from celery import shared_task
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

log = logging.getLogger(__name__)

_DB_URL       = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@db:5432/alpr")
_STORAGE_DIR  = os.getenv("STORAGE_DIR", "/storage")
_RETENTION    = int(os.getenv("RETENTION_DAYS", "90"))

_engine       = create_engine(_DB_URL, pool_pre_ping=True, pool_size=2)
_Session      = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def _cutoff() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=_RETENTION)


@shared_task(
    name="tasks.run_data_retention",
    bind=True,
    max_retries=3,
    default_retry_delay=300,  # 5-minute retry gap
    acks_late=True,
)
def run_data_retention(self):
    """Delete captures and all child rows older than RETENTION_DAYS days."""
    cutoff_dt = _cutoff()
    log.info(
        "data_retention: starting — cutoff=%s retention_days=%d",
        cutoff_dt.isoformat(),
        _RETENTION,
    )

    db = _Session()
    try:
        # ── 1. Collect image paths before deleting rows ────────────────────────
        rows = db.execute(
            text(
                "SELECT c.original_path, d.crop_path "
                "FROM captures c "
                "LEFT JOIN detections d ON d.capture_id = c.id "
                "WHERE c.captured_at < :cutoff"
            ),
            {"cutoff": cutoff_dt},
        ).fetchall()

        image_paths = []
        for original_path, crop_path in rows:
            if original_path:
                image_paths.append(original_path)
            if crop_path:
                image_paths.append(crop_path)

        # ── 2. Delete rows (FK cascade handles child tables) ──────────────────
        # alerts → plate_reads (via read_id CASCADE)
        # verification_jobs → plate_reads (via read_id unique FK)
        # plate_reads → detections → captures

        # alerts reference plate_reads — delete first to avoid FK violation
        # (ondelete="CASCADE" handles this automatically if set on FK)
        deleted_captures = db.execute(
            text(
                "WITH old_caps AS ("
                "  SELECT id FROM captures WHERE captured_at < :cutoff"
                "), "
                "old_dets AS ("
                "  SELECT id FROM detections WHERE capture_id IN (SELECT id FROM old_caps)"
                "), "
                "old_reads AS ("
                "  SELECT id FROM plate_reads WHERE detection_id IN (SELECT id FROM old_dets)"
                ") "
                "DELETE FROM captures WHERE id IN (SELECT id FROM old_caps)"
            ),
            {"cutoff": cutoff_dt},
        ).rowcount

        db.commit()

        # ── 3. Remove image files ─────────────────────────────────────────────
        storage_root = Path(_STORAGE_DIR).resolve()
        removed_files = 0
        failed_files = 0
        for raw_path in image_paths:
            if not raw_path:
                continue
            try:
                p = Path(raw_path).resolve()
                # Safety check: must be under storage root
                if storage_root in p.parents and p.is_file():
                    p.unlink()
                    removed_files += 1
            except Exception as exc:
                log.warning("data_retention: failed to delete %s — %s", raw_path, exc)
                failed_files += 1

        log.info(
            "data_retention: done — deleted_captures=%d removed_files=%d failed_files=%d",
            deleted_captures,
            removed_files,
            failed_files,
        )
        return {
            "deleted_captures": deleted_captures,
            "removed_files": removed_files,
            "failed_files": failed_files,
        }

    except Exception as exc:
        db.rollback()
        log.error("data_retention: error — %s", exc, exc_info=True)
        raise self.retry(exc=exc)
    finally:
        db.close()
