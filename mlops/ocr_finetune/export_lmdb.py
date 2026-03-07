"""
Export feedback_samples → LMDB format สำหรับ EasyOCR fine-tuning
(ใช้ deep-text-recognition-benchmark format)

Usage:
    python -m mlops.ocr_finetune.export_lmdb \
        --output /storage/ocr_training/lmdb \
        --limit 7000

Output:
    /storage/ocr_training/lmdb/train/  ← LMDB database
    /storage/ocr_training/lmdb/val/    ← LMDB database
    /storage/ocr_training/lmdb/data_list.txt

Province handling
-----------------
Since v2 of the schema, `corrected_province` in feedback_samples may be:
  - NULL      (special plates: police, military, test-car)
  - ''        (empty string – same semantics as NULL)
  - 'N/A'     (explicit "no province" sentinel set by the reviewer)
  - A valid Thai province name

The LMDB training format only needs the plate *text* label; province is not
part of the OCR target.  However province is written to the human-readable
data_list.txt manifest so it can be inspected.  All three NULL-like values are
normalised to the empty string '' before any write, ensuring no crash occurs.

Minimum sample requirements
----------------------------
DTRB's DataLoader requires at least 1 sample per split.  We enforce:
  - MIN_TRAIN_SAMPLES (default 10) in the train split
  - MIN_VAL_SAMPLES   (default 1)  in the val split
If either threshold is not met, export_to_lmdb() returns False with a clear
error log rather than letting PyTorch crash with a confusing num_samples=0
message deep inside the training script.
"""
import argparse, io, logging, os, sys
from collections import Counter
from pathlib import Path
from typing import Optional

import lmdb
from PIL import Image
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
_engine  = create_engine(DATABASE_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)

# Sentinel values that mean "this plate has no province"
_NO_PROVINCE_SENTINELS = frozenset({"", "N/A", "n/a", "NA", "na", "none", "None", "null", "NULL"})

# Minimum samples required in each split before we allow DTRB to start.
# These are intentionally conservative — DTRB will crash with a PyTorch
# DataLoader error if either split has 0 samples, and training is meaningless
# below a handful of examples.
MIN_TRAIN_SAMPLES = int(os.getenv("OCR_MIN_TRAIN_SAMPLES", "10"))
MIN_VAL_SAMPLES   = int(os.getenv("OCR_MIN_VAL_SAMPLES",   "1"))


def _safe_province(value: Optional[str]) -> str:
    """Normalise a province value that may be NULL, empty, or a sentinel string.

    Always returns a plain str (never None), so downstream code can safely
    call .encode() or write to a file without an AttributeError / TypeError.

    Rules
    -----
    - None / SQL NULL  → ''
    - ''               → ''
    - 'N/A' (any case) → ''
    - Any other string → stripped value as-is
    """
    if value is None:
        return ""
    stripped = value.strip()
    if stripped in _NO_PROVINCE_SENTINELS:
        return ""
    return stripped


def export_to_lmdb(output_dir: Path, limit: int = 10000, val_split: float = 0.1):
    output_dir = Path(output_dir)
    train_dir  = output_dir / "train"
    val_dir    = output_dir / "val"
    train_dir.mkdir(parents=True, exist_ok=True)
    val_dir.mkdir(parents=True, exist_ok=True)

    db = _Session()
    try:
        log.info("Fetching up to %d feedback samples...", limit)

        # COALESCE ensures corrected_province is never NULL at the DB level;
        # _safe_province() then normalises sentinel strings like 'N/A'.
        rows = db.execute(text("""
            SELECT
                id,
                crop_path,
                corrected_text,
                COALESCE(corrected_province, '') AS corrected_province
            FROM feedback_samples
            WHERE corrected_text IS NOT NULL AND corrected_text != ''
            ORDER BY created_at ASC
            LIMIT :lim
        """), {"lim": int(limit)}).mappings().all()
        rows = [dict(r) for r in rows]
        log.info("DB returned: %d rows", len(rows))

        # Normalise province for every row so all downstream code is safe
        for r in rows:
            r["corrected_province"] = _safe_province(r.get("corrected_province"))

        # ── Filter: image file must actually exist on disk ───────────────────
        # Log every skip individually so path/mount issues are immediately
        # visible in the worker log rather than silently inflating the
        # "skipped" counter.
        valid = []
        skip_reasons: Counter = Counter()

        for r in rows:
            crop = r.get("crop_path")

            # 1. Missing crop_path column value
            if not crop:
                log.warning(
                    "Skip id=%s: crop_path is NULL or empty in DB",
                    r.get("id"),
                )
                skip_reasons["null_crop_path"] += 1
                continue

            p = Path(crop)

            # 2. Path does not exist inside this container
            if not p.exists():
                log.warning(
                    "Skip id=%s: file not found on disk — '%s'  "
                    "(check volume mount; DB stores path as seen by the API container)",
                    r.get("id"), crop,
                )
                skip_reasons["file_not_found"] += 1
                continue

            valid.append(r)

        log.info(
            "Valid (file exists): %d / %d  |  skipped breakdown: %s",
            len(valid), len(rows), dict(skip_reasons),
        )

        # ── Diagnose the most common skip reason ────────────────────────────
        if skip_reasons["file_not_found"] > 0:
            # Surface a concrete example path to help diagnose mount issues.
            example = next(
                r["crop_path"] for r in rows
                if r.get("crop_path") and not Path(r["crop_path"]).exists()
            )
            log.error(
                "⚠️  %d files were not found on disk.  Example missing path: '%s'\n"
                "   Common causes:\n"
                "     • The crops volume is not mounted into the trainer-worker container.\n"
                "     • The DB stores paths relative to the API container (e.g. /storage/crops/…)\n"
                "       but the trainer mounts the same volume at a different prefix.\n"
                "   Fix: ensure the crops volume is mounted at the same path in both containers,\n"
                "   or set STORAGE_DIR so that Path(crop_path) resolves correctly.",
                skip_reasons["file_not_found"], example,
            )

        if not valid:
            log.error("No valid samples after filtering. Aborting export.")
            return False

        # Log special (no-province) plate count for visibility
        no_province_count = sum(1 for r in valid if not r["corrected_province"])
        if no_province_count:
            log.info(
                "Special plates without province: %d / %d "
                "(police / military / test-car — province field will be blank in manifest)",
                no_province_count, len(valid),
            )

        # ── Train / val split ────────────────────────────────────────────────
        # Always keep at least MIN_VAL_SAMPLES in the val split so that
        # DTRB's DataLoader never receives num_samples=0.
        n_val      = max(MIN_VAL_SAMPLES, int(len(valid) * val_split))
        # Guard: we also need enough samples left over for training.
        n_train    = len(valid) - n_val

        if n_train < MIN_TRAIN_SAMPLES:
            log.error(
                "Insufficient training samples after split: train=%d (need >=%d), val=%d.  "
                "Total valid=%d.  Aborting — increase the feedback dataset before retraining.",
                n_train, MIN_TRAIN_SAMPLES, n_val, len(valid),
            )
            return False

        if n_val < MIN_VAL_SAMPLES:
            # Should not happen given the max() above, but be explicit.
            log.error(
                "Insufficient validation samples: val=%d (need >=%d).  Aborting.",
                n_val, MIN_VAL_SAMPLES,
            )
            return False

        train_rows = valid[:-n_val]
        val_rows   = valid[-n_val:]

        log.info(
            "Split: train=%d  val=%d  (val_split=%.0f%%)",
            len(train_rows), len(val_rows), val_split * 100,
        )

        # Manifest (human-readable) — tab-separated: crop_path, plate_text, province
        # Province column is '' for special plates; consumers must tolerate empty fields.
        with open(output_dir / "data_list.txt", "w", encoding="utf-8") as f:
            for r in valid:
                province_field = r["corrected_province"]  # already safe str
                f.write(f"{r['crop_path']}\t{r['corrected_text']}\t{province_field}\n")

        _write_lmdb(train_dir, train_rows, "train")
        _write_lmdb(val_dir,   val_rows,   "val")
        log.info("✅ Export done — train=%d  val=%d", len(train_rows), len(val_rows))
        return True

    finally:
        db.close()


def _write_lmdb(lmdb_dir: Path, rows: list, split: str):
    env = lmdb.open(str(lmdb_dir), map_size=10 * 1024**3)  # 10 GB
    cnt = 1
    cache = {}

    with env.begin(write=True) as txn:
        for row in rows:
            try:
                img = Image.open(row["crop_path"]).convert("RGB")
                # EasyOCR default input height = 32px
                w, h = img.size
                new_w = max(1, int(w * 32 / h))
                img   = img.resize((new_w, 32), Image.LANCZOS)
                buf   = io.BytesIO()
                img.save(buf, format="JPEG", quality=90)
                img_bytes = buf.getvalue()
            except Exception as e:
                log.warning("Skip %s: %s", row["crop_path"], e)
                continue

            # The LMDB label is only the plate text — province is not part of
            # the OCR recognition target and is intentionally excluded here.
            plate_label: str = row.get("corrected_text") or ""
            if not plate_label:
                log.warning("Skip row id=%s: empty plate label", row.get("id"))
                continue

            cache[f"image-{cnt:09d}".encode()] = img_bytes
            cache[f"label-{cnt:09d}".encode()] = plate_label.encode("utf-8")
            cnt += 1

            if len(cache) >= 1000:
                for k, v in cache.items():
                    txn.put(k, v)
                cache.clear()
                log.info("[%s] %d written...", split, cnt - 1)

        for k, v in cache.items():
            txn.put(k, v)
        txn.put(b"num-samples", str(cnt - 1).encode())

    log.info("[%s] LMDB complete: %d samples", split, cnt - 1)
    env.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output",    default="/storage/ocr_training/lmdb")
    p.add_argument("--limit",     type=int,   default=10000)
    p.add_argument("--val-split", type=float, default=0.1)
    args = p.parse_args()
    sys.exit(0 if export_to_lmdb(Path(args.output), args.limit, args.val_split) else 1)