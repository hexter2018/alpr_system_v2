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
"""
import argparse, io, logging, os, sys
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

        # Filter: รูปต้องมีอยู่จริง
        valid = [r for r in rows
                 if r.get("crop_path") and Path(r["crop_path"]).exists()]
        log.info("Valid (file exists): %d / %d", len(valid), len(rows))

        if not valid:
            log.error("No valid samples. Aborting.")
            return False

        # Log how many special (no-province) plates are in the export
        no_province_count = sum(1 for r in valid if not r["corrected_province"])
        if no_province_count:
            log.info(
                "Special plates without province: %d / %d "
                "(police / military / test-car — province field will be blank in manifest)",
                no_province_count, len(valid),
            )

        n_val      = max(1, int(len(valid) * val_split))
        train_rows = valid[:-n_val]
        val_rows   = valid[-n_val:]

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
