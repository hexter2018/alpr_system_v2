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
"""
import argparse, io, logging, os, sys
from pathlib import Path

import lmdb
from PIL import Image
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
_engine  = create_engine(DATABASE_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


def export_to_lmdb(output_dir: Path, limit: int = 10000, val_split: float = 0.1):
    output_dir = Path(output_dir)
    train_dir  = output_dir / "train"
    val_dir    = output_dir / "val"
    train_dir.mkdir(parents=True, exist_ok=True)
    val_dir.mkdir(parents=True, exist_ok=True)

    db = _Session()
    try:
        log.info("Fetching up to %d feedback samples...", limit)
        rows = db.execute(text("""
            SELECT id, crop_path, corrected_text
            FROM feedback_samples
            WHERE corrected_text IS NOT NULL AND corrected_text != ''
            ORDER BY created_at ASC
            LIMIT :lim
        """), {"lim": int(limit)}).mappings().all()
        rows = [dict(r) for r in rows]
        log.info("DB returned: %d rows", len(rows))

        # Filter: รูปต้องมีอยู่จริง
        valid = [r for r in rows
                 if r.get("crop_path") and Path(r["crop_path"]).exists()]
        log.info("Valid (file exists): %d / %d", len(valid), len(rows))

        if not valid:
            log.error("No valid samples. Aborting.")
            return False

        n_val      = max(1, int(len(valid) * val_split))
        train_rows = valid[:-n_val]
        val_rows   = valid[-n_val:]

        # Manifest (human-readable)
        with open(output_dir / "data_list.txt", "w", encoding="utf-8") as f:
            for r in valid:
                f.write(f"{r['crop_path']}\t{r['corrected_text']}\n")

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

            cache[f"image-{cnt:09d}".encode()] = img_bytes
            cache[f"label-{cnt:09d}".encode()] = row["corrected_text"].encode("utf-8")
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