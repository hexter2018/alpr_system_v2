"""
mlops/tasks/province_retrain.py
================================
Train a YOLOv8n-cls province classifier on province-band images and deploy.

Full pipeline (triggered by check_retrain or manually):
  1. export_province_dataset  — slice bottom 30% of verified plate crops
  2. _build_train_val_split   — 80/20 split into train/ val/ subdirectories
  3. yolo classify train      — train yolov8n-cls.pt (~10-15 min on GPU)
  4. deploy                   — copy best.pt → /models/province_classifier.pt
  5. restart workers          — Docker socket restart so workers pick up new model

Environment variables:
  PROVINCE_BASE_MODEL         — base YOLO-cls weights (default: yolov8n-cls.pt)
  PROVINCE_TRAIN_EPOCHS       — training epochs (default: 50)
  PROVINCE_TRAIN_IMGSZ        — input image size (default: 64)
  PROVINCE_TRAIN_BATCH        — batch size (default: 64)
  PROVINCE_VAL_SPLIT          — validation fraction 0.0-1.0 (default: 0.2)
  PROVINCE_BAND_FRAC          — bottom band fraction, forwarded to dataset export
  MODELS_DIR                  — where to deploy province_classifier.pt
  STORAGE_DIR                 — base storage path
  CUDA_VISIBLE_DEVICES        — GPU device (default: 0)
"""
from __future__ import annotations

import logging
import os
import random
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mlops.celery_app import celery_app

log = logging.getLogger(__name__)

STORAGE_DIR     = Path(os.getenv("STORAGE_DIR",  "/storage"))
MODELS_DIR      = Path(os.getenv("MODELS_DIR",   "/models"))

PROVINCE_BASE_MODEL  = os.getenv("PROVINCE_BASE_MODEL",   "yolov8n-cls.pt")
PROVINCE_EPOCHS      = int(os.getenv("PROVINCE_TRAIN_EPOCHS", "50"))
PROVINCE_IMGSZ       = int(os.getenv("PROVINCE_TRAIN_IMGSZ",  "64"))
PROVINCE_BATCH       = int(os.getenv("PROVINCE_TRAIN_BATCH",  "64"))
PROVINCE_VAL_SPLIT   = float(os.getenv("PROVINCE_VAL_SPLIT",  "0.20"))
YOLO_DEVICE          = os.getenv("YOLO_TRAIN_DEVICE",         "0")

DATASET_BASE_DIR = Path(os.getenv(
    "PROVINCE_DATASET_DIR",
    str(STORAGE_DIR / "province_classification" / "dataset"),
))
LOCK_FILE = "/tmp/mlops_training.lock"


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="mlops.tasks.province_pipeline.run_province_train",
    bind=True,
    max_retries=0,
    time_limit=7200,  # 2 h absolute ceiling
)
def run_province_train(self, limit: int = 10_000) -> dict[str, Any]:
    """
    Full province classifier pipeline: export → split → train → deploy → restart.
    """
    ts       = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    run_dir  = STORAGE_DIR / "province_classification" / f"run_{ts}"
    run_dir.mkdir(parents=True, exist_ok=True)

    log.info(
        "[Province] Starting province classifier pipeline  epochs=%d imgsz=%d batch=%d",
        PROVINCE_EPOCHS, PROVINCE_IMGSZ, PROVINCE_BATCH,
    )

    # ── Step 1: Export province-band dataset ──────────────────────────────
    from mlops.tasks.province_dataset import export_province_dataset
    ds_result = export_province_dataset(
        output_dir=str(DATASET_BASE_DIR),
        limit=limit,
    )
    if not ds_result.get("ok"):
        log.error("[Province] Dataset export failed: %s", ds_result)
        _release_lock()
        return {"ok": False, "step": "export_dataset", "detail": ds_result}

    log.info(
        "[Province] Dataset: %d images, %d classes",
        ds_result["exported"], ds_result["total_classes"],
    )

    if ds_result["total_classes"] < 2:
        log.error("[Province] Need at least 2 classes to train a classifier. Aborting.")
        _release_lock()
        return {"ok": False, "step": "insufficient_classes", "total_classes": ds_result["total_classes"]}

    # ── Step 2: Build train / val split ───────────────────────────────────
    split_dir = run_dir / "split"
    try:
        split_stats = _build_train_val_split(
            src_dir=DATASET_BASE_DIR,
            dst_dir=split_dir,
            val_frac=PROVINCE_VAL_SPLIT,
        )
    except Exception as exc:
        log.error("[Province] Train/val split failed: %s", exc, exc_info=True)
        _release_lock()
        return {"ok": False, "step": "train_val_split", "error": str(exc)}

    log.info(
        "[Province] Split complete — train: %d  val: %d",
        split_stats["train_total"], split_stats["val_total"],
    )

    # ── Step 3: YOLOv8-cls training ───────────────────────────────────────
    output_dir = run_dir / "yolo_output"
    output_dir.mkdir(parents=True, exist_ok=True)
    log_file   = run_dir / "train.log"

    cmd = [
        "yolo", "classify", "train",
        f"data={split_dir}",          # train/val subdirs inside split_dir
        f"model={PROVINCE_BASE_MODEL}",
        f"epochs={PROVINCE_EPOCHS}",
        f"imgsz={PROVINCE_IMGSZ}",
        f"batch={PROVINCE_BATCH}",
        f"device={YOLO_DEVICE}",
        f"project={output_dir}",
        "name=province_cls",
        "exist_ok=True",
        "verbose=False",
        "plots=False",
        "amp=True",
        "workers=2",
        "patience=15",                # early stopping — typical convergence <30 epochs
    ]

    log.info("[Province] Training CMD: %s", " ".join(cmd))

    try:
        with open(log_file, "w") as fout:
            proc = subprocess.Popen(
                cmd,
                stdout=fout,
                stderr=subprocess.STDOUT,
                env={
                    **os.environ,
                    "YOLO_VERBOSE": "False",
                    "ULTRALYTICS_AUTOINSTALL": "false",
                },
            )

        while proc.poll() is None:
            time.sleep(30)

        rc = proc.returncode
        log.info("[Province] Training exited rc=%d", rc)

        if rc != 0:
            log.error("[Province] Training FAILED (rc=%d). Log: %s", rc, log_file)
            _release_lock()
            return {"ok": False, "step": "yolo_train", "rc": rc, "log": str(log_file)}

    except Exception as exc:
        log.error("[Province] Subprocess error: %s", exc, exc_info=True)
        _release_lock()
        return {"ok": False, "step": "yolo_train", "error": str(exc)}

    # ── Step 4: Deploy ────────────────────────────────────────────────────
    best_pt = output_dir / "province_cls" / "weights" / "best.pt"
    if not best_pt.exists():
        log.error("[Province] best.pt not found at %s", best_pt)
        _release_lock()
        return {"ok": False, "step": "deploy", "reason": "no_best_pt"}

    deploy_path = MODELS_DIR / "province_classifier.pt"

    # Backup previous model
    if deploy_path.exists():
        backup = MODELS_DIR / "backups" / f"province_classifier_{ts}.pt"
        backup.parent.mkdir(exist_ok=True)
        shutil.copy2(deploy_path, backup)
        log.info("[Province] Previous model backed up to %s", backup)

    # Atomic deploy: copy to temp then os.replace
    staging = MODELS_DIR / f"province_cls_staging_{ts}.pt"
    shutil.copy2(best_pt, staging)
    os.replace(staging, deploy_path)
    log.info("[Province] ✅ Deployed: %s  (%.1f MiB)", deploy_path,
             deploy_path.stat().st_size / (1024 * 1024))

    # Write class manifest alongside the model so the classifier can map
    # prediction indices → province names without loading the weights.
    _write_class_manifest(output_dir / "province_cls", MODELS_DIR)

    # ── Step 5: Restart workers ───────────────────────────────────────────
    sentinel = MODELS_DIR / "reload.sentinel"
    sentinel.touch()
    log.info("[Province] Sentinel touched: %s", sentinel)

    restart_result: dict = {"ok": False, "error": "not_attempted"}
    try:
        from mlops.tasks.worker_restart import restart_inference_workers
        restart_result = restart_inference_workers()
        log.info("[Province] Worker restart result: %s", restart_result)
    except Exception as exc:
        restart_result = {"ok": False, "error": str(exc)}
        log.warning(
            "[Province] Docker restart failed (non-fatal): %s.  "
            "Workers will reload via sentinel within 30 s.",
            exc,
        )

    _release_lock()
    return {
        "ok": True,
        "deployed": str(deploy_path),
        "classes": ds_result["total_classes"],
        "split": split_stats,
        "restart": restart_result,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_train_val_split(
    src_dir: Path,
    dst_dir: Path,
    val_frac: float = 0.20,
) -> dict[str, int]:
    """
    Copy images from flat {src_dir}/{class}/*.jpg into:
      {dst_dir}/train/{class}/
      {dst_dir}/val/{class}/

    Files are distributed with a deterministic shuffle (seed=42) to keep
    the split reproducible across re-runs on the same dataset.
    """
    train_dir = dst_dir / "train"
    val_dir   = dst_dir / "val"

    train_total = 0
    val_total   = 0

    for class_dir in sorted(src_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        class_name = class_dir.name

        images = sorted(class_dir.glob("*.jpg"))
        if not images:
            log.warning("[Province-Split] Class %r has no images — skipping", class_name)
            continue

        # Deterministic shuffle
        rng = random.Random(42)
        images_shuffled = images[:]
        rng.shuffle(images_shuffled)

        n_val   = max(1, int(len(images_shuffled) * val_frac))
        n_train = len(images_shuffled) - n_val

        (train_dir / class_name).mkdir(parents=True, exist_ok=True)
        (val_dir   / class_name).mkdir(parents=True, exist_ok=True)

        for img_path in images_shuffled[:n_train]:
            shutil.copy2(img_path, train_dir / class_name / img_path.name)
        for img_path in images_shuffled[n_train:]:
            shutil.copy2(img_path, val_dir   / class_name / img_path.name)

        train_total += n_train
        val_total   += n_val

    return {
        "train_total": train_total,
        "val_total":   val_total,
        "train_dir":   str(train_dir),
        "val_dir":     str(val_dir),
    }


def _write_class_manifest(yolo_run_dir: Path, models_dir: Path) -> None:
    """
    Copy or derive the class-index → province-name mapping from the YOLO
    training output and save it as province_classifier_classes.txt alongside
    the deployed .pt so the inference code can map prediction indices to
    province names without re-loading the full model labels.

    YOLO-cls writes a yaml file with class names at
    {run_dir}/weights/ (or inside the run dir directly); we also check for
    the standard data.yaml pattern.
    """
    import yaml as _yaml  # PyYAML

    # YOLO writes class names into args.yaml and/or the model itself.
    # The most reliable source is the data.yaml that YOLO generates from
    # the split directory — it lists classes alphabetically.
    data_yaml_candidates = [
        yolo_run_dir / "data.yaml",
        yolo_run_dir / "args.yaml",
        yolo_run_dir.parent / "data.yaml",
    ]
    class_names: list[str] = []
    for candidate in data_yaml_candidates:
        if candidate.exists():
            try:
                doc = _yaml.safe_load(candidate.read_text(encoding="utf-8"))
                if "names" in doc:
                    raw = doc["names"]
                    if isinstance(raw, list):
                        class_names = raw
                    elif isinstance(raw, dict):
                        # dict index→name (Ultralytics format)
                        class_names = [raw[i] for i in sorted(raw.keys())]
                    if class_names:
                        break
            except Exception as exc:
                log.debug("[Province] Could not read %s: %s", candidate, exc)

    if not class_names:
        log.warning(
            "[Province] Could not derive class names from training artefacts.  "
            "The classifier will fall back to model.names at inference time."
        )
        return

    manifest_path = models_dir / "province_classifier_classes.txt"
    manifest_path.write_text("\n".join(class_names) + "\n", encoding="utf-8")
    log.info(
        "[Province] Class manifest written: %s  (%d classes)", manifest_path, len(class_names)
    )


def _release_lock() -> None:
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
            log.info("[Province] Training lock released.")
    except Exception:
        pass
