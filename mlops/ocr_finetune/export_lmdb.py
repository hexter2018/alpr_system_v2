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
DTRB's DataLoader requires at least 1 sample per split.  We enforce a minimum
at two levels:

  1. After the Python-side train/val split (MIN_TRAIN_SAMPLES / MIN_VAL_SAMPLES).
  2. After _write_lmdb() completes, _verify_lmdb() reads the `num-samples` key
     back from disk — the exact value DTRB will use.  If this is 0 in either
     split, we abort here with a clear error rather than letting PyTorch crash
     deep inside train.py with a confusing num_samples=0 traceback.
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

# Minimum samples required in each LMDB split.
# Configurable via env vars so they can be lowered for small test datasets.
MIN_TRAIN_SAMPLES = int(os.getenv("OCR_MIN_TRAIN_SAMPLES", "10"))
MIN_VAL_SAMPLES   = int(os.getenv("OCR_MIN_VAL_SAMPLES",   "1"))


def _safe_province(value: Optional[str]) -> str:
    """Normalise a province value that may be NULL, empty, or a sentinel string."""
    if value is None:
        return ""
    stripped = value.strip()
    if stripped in _NO_PROVINCE_SENTINELS:
        return ""
    return stripped


def _verify_lmdb(lmdb_dir: Path, split: str) -> int:
    """Open the written LMDB and return the num-samples value stored on disk.

    This is the exact value DTRB reads via txn.get('num-samples'.encode()).
    Returns 0 on any error so callers treat it as a failure condition.
    """
    try:
        env = lmdb.open(str(lmdb_dir), readonly=True, lock=False)
        with env.begin(write=False) as txn:
            raw = txn.get(b"num-samples")
            count = int(raw) if raw else 0
        env.close()
        log.info("[%s] LMDB verify: num-samples on disk = %d", split, count)
        return count
    except Exception as e:
        log.error("[%s] LMDB verify failed: %s", split, e)
        return 0


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
            WHERE corrected_text IS NOT NULL
              AND corrected_text != ''
              AND COALESCE(used_in_train, FALSE) = FALSE
            ORDER BY created_at ASC
            LIMIT :lim
        """), {"lim": int(limit)}).mappings().all()
        rows = [dict(r) for r in rows]
        log.info("DB returned: %d rows", len(rows))

        for r in rows:
            r["corrected_province"] = _safe_province(r.get("corrected_province"))

        # ── Filter: image file must exist on disk ────────────────────────────
        # Log every skipped file individually so path/volume-mount issues are
        # immediately visible in worker logs (not just a silent summary count).
        valid = []
        skip_reasons: Counter = Counter()

        for r in rows:
            crop = r.get("crop_path")

            if not crop:
                log.warning("Skip id=%s: crop_path is NULL or empty in DB", r.get("id"))
                skip_reasons["null_crop_path"] += 1
                continue

            p = Path(crop)
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

        if skip_reasons["file_not_found"] > 0:
            example = next(
                r["crop_path"] for r in rows
                if r.get("crop_path") and not Path(r["crop_path"]).exists()
            )
            log.error(
                "⚠️  %d files not found on disk.  Example missing path: '%s'\n"
                "   Common causes:\n"
                "     • crops volume not mounted into the trainer-worker container\n"
                "     • path prefix differs between the API container and trainer container\n"
                "   Fix: mount the same crops volume at the same path in both containers.",
                skip_reasons["file_not_found"], example,
            )

        if not valid:
            log.error("No valid samples after filtering. Aborting export.")
            return False

        no_province_count = sum(1 for r in valid if not r["corrected_province"])
        if no_province_count:
            log.info(
                "Special plates without province: %d / %d "
                "(police / military / test-car — province field will be blank in manifest)",
                no_province_count, len(valid),
            )

        # ── Train / val split ────────────────────────────────────────────────
        n_val   = max(MIN_VAL_SAMPLES, int(len(valid) * val_split))
        n_train = len(valid) - n_val

        if n_train < MIN_TRAIN_SAMPLES:
            log.error(
                "Insufficient training samples after split: train=%d (need >=%d), val=%d, total=%d.  "
                "Collect more feedback data before retraining.",
                n_train, MIN_TRAIN_SAMPLES, n_val, len(valid),
            )
            return False

        train_rows = valid[:-n_val]
        val_rows   = valid[-n_val:]

        log.info(
            "Split: train=%d  val=%d  (val_split=%.0f%%)",
            len(train_rows), len(val_rows), val_split * 100,
        )

        # Manifest (human-readable)
        with open(output_dir / "data_list.txt", "w", encoding="utf-8") as f:
            for r in valid:
                f.write(f"{r['crop_path']}\t{r['corrected_text']}\t{r['corrected_province']}\n")

        train_exported_ids = _write_lmdb(train_dir, train_rows, "train")
        val_exported_ids = _write_lmdb(val_dir, val_rows, "val")
        exported_ids = train_exported_ids + val_exported_ids

        # ── Post-write integrity check ───────────────────────────────────────
        # Read back the num-samples key DTRB will actually use at training time.
        # If it is 0 in either split, abort here with a clear message rather
        # than letting DTRB crash deep inside PyTorch with num_samples=0.
        train_on_disk = _verify_lmdb(train_dir, "train")
        val_on_disk   = _verify_lmdb(val_dir,   "val")

        if train_on_disk < MIN_TRAIN_SAMPLES:
            log.error(
                "LMDB integrity check FAILED: train num-samples on disk = %d (need >=%d).  "
                "Images were likely skipped during write (PIL errors). Check warnings above.",
                train_on_disk, MIN_TRAIN_SAMPLES,
            )
            return False

        if val_on_disk < MIN_VAL_SAMPLES:
            log.error(
                "LMDB integrity check FAILED: val num-samples on disk = %d (need >=%d).  "
                "DTRB will crash with num_samples=0 if training proceeds.",
                val_on_disk, MIN_VAL_SAMPLES,
            )
            return False

        # ── Warn about any PIL-level skips, but do NOT abort ────────────────────
        # valid = images confirmed to exist on disk.
        # exported_ids = images successfully JPEG-encoded and written to LMDB.
        # The two counts can differ when a file is present but unreadable by PIL
        # (e.g. a corrupt crop saved at capture time).  Aborting here would mean
        # that well-formed images are NEVER marked as used_in_train because a
        # handful of corrupt files keep tripping the check on every training run.
        #
        # The LMDB disk verification above (train_on_disk / val_on_disk) is the
        # authoritative "export was successful" gate.  Once that passes, we
        # update only the IDs that actually made it into the LMDB — corrupt-file
        # rows are intentionally left with used_in_train=FALSE so they are
        # retried (and hopefully re-cropped / cleaned) on the next cycle.
        skipped = len(valid) - len(exported_ids)
        if skipped > 0:
            log.warning(
                "LMDB write skipped %d / %d samples (PIL decode errors or empty labels). "
                "Those rows remain used_in_train=FALSE for retry on the next cycle.",
                skipped, len(valid),
            )

        if not exported_ids:
            log.error("No samples were successfully written to LMDB. Aborting DB update.")
            return False

        # ── Atomic DB update — only IDs confirmed written to LMDB ────────────
        db.execute(
            text("UPDATE feedback_samples SET used_in_train = TRUE WHERE id = ANY(:ids)"),
            {"ids": exported_ids},
        )
        db.commit()
        log.info(
            "Marked %d feedback samples as used_in_train=TRUE (skipped %d with PIL errors)",
            len(exported_ids), skipped,
        )

        log.info(
            "✅ Export done — train=%d  val=%d  (disk-verified: train=%d  val=%d)",
            len(train_rows), len(val_rows), train_on_disk, val_on_disk,
        )
        return True

    finally:
        db.close()


def _write_lmdb(lmdb_dir: Path, rows: list, split: str) -> list[int]:
    env = lmdb.open(str(lmdb_dir), map_size=10 * 1024**3)  # 10 GB
    cnt = 1
    cache = {}
    exported_ids: list[int] = []

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
            exported_ids.append(row["id"])
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
    return exported_ids


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output",    default="/storage/ocr_training/lmdb")
    p.add_argument("--limit",     type=int,   default=10000)
    p.add_argument("--val-split", type=float, default=0.1)
    args = p.parse_args()
    sys.exit(0 if export_to_lmdb(Path(args.output), args.limit, args.val_split) else 1)
