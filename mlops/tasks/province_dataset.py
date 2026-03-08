"""
mlops/tasks/province_dataset.py
================================
Export province-band images for YOLOv8-cls training.

Sources (in priority order):
  1. feedback_samples.corrected_province — human-verified labels (highest quality).
  2. plate_reads JOIN detections WHERE confidence >= PROVINCE_AUTO_CONF_MIN
     AND status = 'VERIFIED' — high-confidence auto-labels for data augmentation.
     (readstatus enum only has PENDING and VERIFIED — CONFIRMED does not exist.)

Crop strategy:
  Each plate crop is sliced: bottom PROVINCE_BAND_FRAC of the image height.
  Default: bottom 30%  (the horizontal band that shows the province name).

Output directory structure (YOLO classification format):
  {output_dir}/
    กรุงเทพมหานคร/
      1234.jpg
      5678.jpg
    เชียงใหม่/
      9012.jpg
    NA/                 ← plates without a province (military / TC / QC)
      3456.jpg

Environment variables:
  PROVINCE_BAND_FRAC          — bottom fraction to crop (default: 0.30)
  PROVINCE_AUTO_CONF_MIN      — minimum OCR confidence for auto-labels (default: 0.80)
  PROVINCE_MIN_SAMPLES_PER_CLASS — warn threshold (default: 5)
  PROVINCE_DATASET_DIR        — override default output path
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import cv2
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from mlops.celery_app import celery_app

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
STORAGE_DIR  = Path(os.getenv("STORAGE_DIR", "/storage"))

PROVINCE_BAND_FRAC       = float(os.getenv("PROVINCE_BAND_FRAC",          "0.30"))
AUTO_CONF_MIN            = float(os.getenv("PROVINCE_AUTO_CONF_MIN",       "0.80"))
MIN_SAMPLES_PER_CLASS    = int  (os.getenv("PROVINCE_MIN_SAMPLES_PER_CLASS", "5"))
DEFAULT_DATASET_DIR      = str  (os.getenv(
    "PROVINCE_DATASET_DIR",
    str(STORAGE_DIR / "province_classification" / "dataset"),
))
NO_PROVINCE_CLASS        = "NA"  # class name for plates with no province

_engine  = create_engine(DATABASE_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="mlops.tasks.province_pipeline.export_province_dataset",
    bind=True,
    max_retries=0,
    time_limit=3600,
)
def export_province_dataset(
    self,
    output_dir: str | None = None,
    limit: int = 10_000,
) -> dict[str, Any]:
    """
    Fetch verified plate crops, slice the province band, and save in YOLO
    classification directory structure.  Called by province_retrain before
    each training run.

    Returns a dict with keys:
      ok, dataset_dir, exported, skipped, total_classes, class_counts.
    """
    out_path = Path(output_dir or DEFAULT_DATASET_DIR)
    out_path.mkdir(parents=True, exist_ok=True)
    log.info("[Province-DS] Exporting dataset → %s  (limit=%d)", out_path, limit)

    db = _Session()
    try:
        # ── Source 1: human-verified feedback_samples ──────────────────────
        verified_rows = db.execute(
            text("""
                SELECT
                    id,
                    crop_path,
                    corrected_province AS province
                FROM feedback_samples
                WHERE corrected_province IS NOT NULL
                  AND corrected_province <> ''
                ORDER BY created_at DESC
                LIMIT :lim
            """),
            {"lim": limit},
        ).mappings().all()

        # ── Source 2: high-confidence auto-read plate_reads ────────────────
        # Only used when a human-verified label for the same crop doesn't
        # already exist (deduplication happens below by crop_path).
        auto_rows = db.execute(
            text("""
                SELECT
                    pr.id,
                    d.crop_path,
                    pr.province
                FROM plate_reads pr
                JOIN detections d ON d.id = pr.detection_id
                WHERE pr.province IS NOT NULL
                  AND pr.province <> ''
                  AND pr.confidence >= :conf_min
                  AND pr.status = 'VERIFIED'
                ORDER BY pr.created_at DESC
                LIMIT :lim
            """),
            {"conf_min": AUTO_CONF_MIN, "lim": limit},
        ).mappings().all()

    finally:
        db.close()

    # ── Deduplicate: prefer verified over auto (verified iterated first) ───
    seen_paths: set[str] = set()
    rows: list[dict] = []
    for row in list(verified_rows) + list(auto_rows):
        cp = row.get("crop_path", "")
        if cp and cp not in seen_paths:
            seen_paths.add(cp)
            rows.append(dict(row))

    log.info(
        "[Province-DS] %d verified + %d auto = %d unique crops",
        len(verified_rows), len(auto_rows), len(rows),
    )

    if not rows:
        log.warning("[Province-DS] No source data found — is feedback_samples populated?")
        return {
            "ok": False,
            "dataset_dir": str(out_path),
            "exported": 0,
            "skipped": 0,
            "total_classes": 0,
            "class_counts": {},
        }

    # ── Crop and save ──────────────────────────────────────────────────────
    exported   = 0
    skipped    = 0
    class_counts: dict[str, int] = {}

    for row in rows:
        crop_path = Path(row["crop_path"])
        province  = (row.get("province") or "").strip()

        if not crop_path.exists():
            skipped += 1
            log.debug("[Province-DS] Missing crop: %s", crop_path)
            continue

        img = cv2.imread(str(crop_path))
        if img is None:
            skipped += 1
            continue

        h, w = img.shape[:2]
        split_y = int(h * (1.0 - PROVINCE_BAND_FRAC))

        # Guard: if the image is too short to split meaningfully, use full img
        province_band = img[split_y:, :] if split_y < h else img
        if province_band.size == 0:
            skipped += 1
            continue

        # Normalize class label (use NO_PROVINCE_CLASS when province is empty)
        class_name = province if province else NO_PROVINCE_CLASS

        class_dir = out_path / class_name
        class_dir.mkdir(parents=True, exist_ok=True)

        dst = class_dir / f"{row['id']}.jpg"
        ok  = cv2.imwrite(str(dst), province_band)
        if not ok:
            log.warning("[Province-DS] Failed to write %s", dst)
            skipped += 1
            continue

        exported += 1
        class_counts[class_name] = class_counts.get(class_name, 0) + 1

    # ── Report ─────────────────────────────────────────────────────────────
    total_classes = len(class_counts)
    log.info(
        "[Province-DS] Done — %d exported, %d skipped, %d classes",
        exported, skipped, total_classes,
    )

    thin_classes = [c for c, n in class_counts.items() if n < MIN_SAMPLES_PER_CLASS]
    if thin_classes:
        log.warning(
            "[Province-DS] %d class(es) have fewer than %d samples and may hurt "
            "val-split accuracy.  Consider collecting more data for: %s%s",
            len(thin_classes),
            MIN_SAMPLES_PER_CLASS,
            ", ".join(thin_classes[:10]),
            " ..." if len(thin_classes) > 10 else "",
        )

    return {
        "ok": exported > 0,
        "dataset_dir": str(out_path),
        "exported": exported,
        "skipped": skipped,
        "total_classes": total_classes,
        "class_counts": class_counts,
    }
