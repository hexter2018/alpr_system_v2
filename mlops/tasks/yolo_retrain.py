"""
mlops/tasks/yolo_retrain.py
===========================
Tasks:
  1. export_yolo_dataset  → export feedback_samples → YOLO dataset format
  2. run_yolo_train       → รัน yolo train เป็น subprocess (non-blocking)

กฎเหล็ก:
  - subprocess.Popen → ไม่ block Celery thread → production ไม่ค้าง
  - VRAM: trainer container แยก GPU allocation (config ใน docker-compose)
  - Handle ทั้ง 2 กรณี: มี bbox หรือไม่มี bbox
  - ถ้า train fail → lock ถูกลบ → production ใช้โมเดลเดิมต่อ
"""
import csv
import json
import logging
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from mlops.celery_app import celery_app

log = logging.getLogger(__name__)

DATABASE_URL   = os.getenv("DATABASE_URL",    "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
STORAGE_DIR    = Path(os.getenv("STORAGE_DIR",  "/storage"))
MODELS_DIR     = Path(os.getenv("MODELS_DIR",   "/models"))
TRAINING_BASE  = Path(os.getenv("TRAINING_DIR", str(STORAGE_DIR / "training")))
LOCK_FILE      = "/tmp/mlops_training.lock"

YOLO_BASE_MODEL = os.getenv("YOLO_BASE_MODEL",      str(MODELS_DIR / "best.pt"))
YOLO_EPOCHS     = int(os.getenv("YOLO_TRAIN_EPOCHS", "50"))
YOLO_IMGSZ      = int(os.getenv("YOLO_TRAIN_IMGSZ",  "640"))
YOLO_BATCH      = int(os.getenv("YOLO_TRAIN_BATCH",  "16"))
YOLO_DEVICE     = os.getenv("YOLO_TRAIN_DEVICE",     "0")

_engine  = create_engine(DATABASE_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


# ---------------------------------------------------------------------------
# STEP 1 — Export YOLO Dataset
# ---------------------------------------------------------------------------

@celery_app.task(
    name="mlops.tasks.yolo_retrain.export_yolo_dataset",
    bind=True,
    max_retries=1,
    time_limit=3600,
)
def export_yolo_dataset(self, limit: int = 5000):
    """
    สร้าง YOLO dataset จาก feedback_samples:
      run_{ts}/
        images/train/  labels/train/
        images/val/    labels/val/
        dataset.yaml
        exported_ids.json

    Handle bbox ทั้ง 2 กรณี:
      A) มี detections.bbox (xyxy) → ใช้รูปต้นฉบับ + bbox จริง
      B) ไม่มี bbox → ใช้ crop image ทั้งใบ (bbox = full frame 0.5 0.5 1.0 1.0)
    """
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    run_dir = TRAINING_BASE / f"run_{ts}"

    for split in ("train", "val"):
        (run_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (run_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    log.info("[MLOps] Exporting YOLO dataset → %s (limit=%d)", run_dir, limit)

    db = _Session()
    try:
        # JOIN: feedback_samples → detections (via crop_path) → captures
        rows = db.execute(
            text("""
                SELECT
                    fs.id               AS fs_id,
                    fs.crop_path        AS crop_path,
                    fs.corrected_text   AS plate_text,
                    d.bbox              AS bbox_json,
                    c.original_path     AS original_path
                FROM feedback_samples fs
                LEFT JOIN detections d ON d.crop_path = fs.crop_path
                LEFT JOIN captures   c ON c.id = d.capture_id
                WHERE fs.used_in_train = FALSE
                ORDER BY fs.created_at ASC
                LIMIT :lim
            """),
            {"lim": int(limit)},
        ).mappings().all()

        if not rows:
            log.warning("[MLOps] No samples to export.")
            _release_lock()
            return {"ok": False, "reason": "no_samples"}

        log.info("[MLOps] %d samples found", len(rows))

        # 90:10 split
        val_n = max(1, int(len(rows) * 0.1))
        splits = [("train", list(rows)[:-val_n]), ("val", list(rows)[-val_n:])]

        exported_ids, stats = [], {"train": 0, "val": 0, "skipped": 0}
        for split, split_rows in splits:
            for row in split_rows:
                ok = _export_one(
                    dict(row),
                    run_dir / "images" / split,
                    run_dir / "labels" / split,
                )
                if ok:
                    exported_ids.append(int(row["fs_id"]))
                    stats[split] += 1
                else:
                    stats["skipped"] += 1

        if stats["train"] == 0:
            log.error("[MLOps] No valid samples — aborting.")
            shutil.rmtree(run_dir, ignore_errors=True)
            _release_lock()
            return {"ok": False, "reason": "all_invalid"}

        # dataset.yaml
        yaml_path = run_dir / "dataset.yaml"
        yaml_path.write_text(
            yaml.dump(
                {"path": str(run_dir), "train": "images/train", "val": "images/val",
                 "nc": 1, "names": ["plate"]},
                allow_unicode=True,
            )
        )

        # บันทึก IDs (จะ mark ใน DB หลัง deploy สำเร็จเท่านั้น)
        (run_dir / "exported_ids.json").write_text(json.dumps(exported_ids))

        log.info("[MLOps] Export done: %s", stats)

        run_yolo_train.apply_async(
            kwargs={"run_dir": str(run_dir), "yaml_path": str(yaml_path),
                    "sample_ids": exported_ids},
            queue="training",
        )
        return {"ok": True, "run_dir": str(run_dir), "stats": stats}

    except Exception as exc:
        log.error("[MLOps] export_yolo_dataset failed: %s", exc, exc_info=True)
        shutil.rmtree(run_dir, ignore_errors=True)
        _release_lock()
        raise
    finally:
        db.close()


def _export_one(row: dict, images_dir: Path, labels_dir: Path) -> bool:
    """Export รูป 1 ใบ + label (handle กรณีมี/ไม่มี bbox)"""
    import cv2

    fs_id       = row["fs_id"]
    crop_path   = Path(row["crop_path"])   if row.get("crop_path")    else None
    orig_path   = Path(row["original_path"]) if row.get("original_path") else None
    bbox_json   = row.get("bbox_json")

    # ---- กรณี A: original + bbox ----
    if orig_path and orig_path.exists() and bbox_json:
        try:
            bbox = json.loads(bbox_json) if isinstance(bbox_json, str) else bbox_json
            xyxy = bbox.get("xyxy") or bbox.get("box")
            if xyxy and len(xyxy) == 4:
                img = cv2.imread(str(orig_path))
                if img is None:
                    raise ValueError("unreadable")
                h, w = img.shape[:2]
                x1, y1, x2, y2 = (float(v) for v in xyxy)
                cx = max(0.0, min(1.0, (x1 + x2) / 2 / w))
                cy = max(0.0, min(1.0, (y1 + y2) / 2 / h))
                bw = max(0.001, min(1.0, (x2 - x1) / w))
                bh = max(0.001, min(1.0, (y2 - y1) / h))

                dst_img = images_dir / f"s{fs_id}{orig_path.suffix or '.jpg'}"
                shutil.copy2(orig_path, dst_img)
                (labels_dir / f"s{fs_id}.txt").write_text(
                    f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n"
                )
                return True
        except Exception as e:
            log.debug("[MLOps] bbox parse failed fs_id=%s: %s", fs_id, e)

    # ---- กรณี B: ใช้ crop image ทั้งใบ ----
    if crop_path and crop_path.exists():
        dst_img = images_dir / f"s{fs_id}{crop_path.suffix or '.jpg'}"
        shutil.copy2(crop_path, dst_img)
        # bbox เต็มภาพ
        (labels_dir / f"s{fs_id}.txt").write_text("0 0.5 0.5 1.0 1.0\n")
        return True

    log.warning("[MLOps] No image for fs_id=%s", fs_id)
    return False


# ---------------------------------------------------------------------------
# STEP 2 — Run YOLO Training (subprocess, non-blocking)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="mlops.tasks.yolo_retrain.run_yolo_train",
    bind=True,
    max_retries=0,
    time_limit=86400,  # 24 h max
)
def run_yolo_train(self, run_dir: str, yaml_path: str, sample_ids: list):
    """
    รัน yolo train เป็น subprocess.Popen (non-blocking Celery thread)
    Poll ทุก 60 วินาทีจนเสร็จ แล้วส่งต่อ validate_and_deploy
    """
    run_dir    = Path(run_dir)
    output_dir = run_dir / "yolo_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    # อ่าน mAP เดิม
    current_map = _read_current_map()
    log.info("[MLOps] YOLO train start — current mAP50=%.4f", current_map)

    cmd = [
        "yolo", "train",
        f"data={yaml_path}",
        f"model={YOLO_BASE_MODEL}",
        f"epochs={YOLO_EPOCHS}",
        f"imgsz={YOLO_IMGSZ}",
        f"batch={YOLO_BATCH}",
        f"device={YOLO_DEVICE}",
        f"project={output_dir}",
        "name=retrain",
        "exist_ok=True",
        "verbose=False",
        "amp=True",       # mixed precision — ประหยัด VRAM
        "cache=False",
        "workers=2",
        "plots=False",    # ไม่ generate plots — ประหยัด memory
    ]

    log_file = run_dir / "train.log"
    log.info("[MLOps] CMD: %s", " ".join(cmd))

    try:
        with open(log_file, "w") as fout:
            proc = subprocess.Popen(
                cmd,
                stdout=fout,
                stderr=subprocess.STDOUT,
                env={**os.environ,
                     "YOLO_VERBOSE": "False",
                     "ULTRALYTICS_AUTOINSTALL": "false"},
            )

        # Poll จนเสร็จ (ทุก 60 วินาที)
        while proc.poll() is None:
            time.sleep(60)

        rc = proc.returncode
        log.info("[MLOps] YOLO training exited rc=%d", rc)

        if rc != 0:
            log.error("[MLOps] Training FAILED (rc=%d). Log: %s", rc, log_file)
            _release_lock()
            return {"ok": False, "reason": f"rc_{rc}", "log": str(log_file)}

        best_pt = output_dir / "retrain" / "weights" / "best.pt"
        if not best_pt.exists():
            log.error("[MLOps] best.pt not found at %s", best_pt)
            _release_lock()
            return {"ok": False, "reason": "no_best_pt"}

        new_map = _parse_map(output_dir / "retrain" / "results.csv")
        log.info("[MLOps] New mAP50=%.4f  (current=%.4f)", new_map, current_map)

        from mlops.tasks.model_deploy import validate_and_deploy
        validate_and_deploy.apply_async(
            kwargs={
                "new_model_path": str(best_pt),
                "new_map":        new_map,
                "current_map":    current_map,
                "sample_ids":     sample_ids,
                "run_dir":        str(run_dir),
            },
            queue="training",
        )
        return {"ok": True, "best_pt": str(best_pt),
                "new_map": new_map, "current_map": current_map}

    except Exception as exc:
        log.error("[MLOps] run_yolo_train error: %s", exc, exc_info=True)
        _release_lock()
        raise


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_current_map() -> float:
    path = MODELS_DIR / "current_map.json"
    try:
        if path.exists():
            return float(json.loads(path.read_text()).get("map50", 0.0))
    except Exception:
        pass
    return 0.0


def _parse_map(results_csv: Path) -> float:
    """อ่าน mAP50 บรรทัดสุดท้ายจาก Ultralytics results.csv"""
    if not results_csv.exists():
        return 0.0
    try:
        with open(results_csv, newline="") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            return 0.0
        last = rows[-1]
        for k in last:
            if "mAP50" in k and "95" not in k:
                return float(last[k].strip())
    except Exception as e:
        log.warning("[MLOps] Cannot parse mAP: %s", e)
    return 0.0


def _release_lock():
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
            log.info("[MLOps] Lock released.")
    except Exception:
        pass