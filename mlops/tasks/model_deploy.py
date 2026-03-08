"""
mlops/tasks/model_deploy.py
===========================
Task สุดท้ายของ pipeline:
  1. เปรียบ mAP ใหม่ vs เก่า
  2. ถ้าดีกว่า → atomic deploy (os.replace → ไม่มี half-written file)
  3. touch sentinel file → production worker reload model
  4. mark feedback_samples ว่า used_in_train=True
  5. ถ้าแย่กว่า → เก็บโมเดลเก่า (Fail-safe ✓)

กฎเหล็ก:
  - production worker ทำงานต่อด้วยโมเดลเดิมตลอดระหว่าง deploy
  - os.replace() เป็น atomic operation บน Linux
  - sentinel file watcher ใน worker/start.sh จะ reload model โดยไม่ kill process
"""
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from mlops.celery_app import celery_app

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
MODELS_DIR   = Path(os.getenv("MODELS_DIR", "/models"))
LOCK_FILE    = "/tmp/mlops_training.lock"

# Path ที่ production worker ใช้ (จาก docker-compose: MODEL_PATH=/models/best.pt)
PRODUCTION_MODEL = MODELS_DIR / "best.pt"
OCR_PRODUCTION_MODEL = MODELS_DIR / "ocr_th_custom.pth"
# Sentinel file: worker/start.sh จะ watch file นี้
SENTINEL_FILE    = MODELS_DIR / "reload.sentinel"
# เก็บประวัติ mAP
MAP_HISTORY_FILE = MODELS_DIR / "current_map.json"
OCR_VERSION_FILE = MODELS_DIR / "ocr_th_custom.version.json"

# กี่ % ที่ mAP ต้องดีกว่าเดิม (default: ดีกว่าแม้แต่ 0.1%)
MIN_MAP_IMPROVEMENT = float(os.getenv("MIN_MAP_IMPROVEMENT", "0.001"))

_engine  = create_engine(DATABASE_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


@celery_app.task(
    name="mlops.tasks.model_deploy.validate_and_deploy",
    bind=True,
    max_retries=0,
)
def validate_and_deploy(
    self,
    new_model_path: str,
    new_map: float,
    current_map: float,
    sample_ids: list,
    run_dir: str,
):
    """
    ตรวจสอบ mAP แล้วตัดสินใจ deploy หรือไม่
    """
    new_pt   = Path(new_model_path)
    run_path = Path(run_dir)
    is_ocr_model = new_pt.suffix == ".pth"
    target_model = OCR_PRODUCTION_MODEL if is_ocr_model else PRODUCTION_MODEL
    resolved_current_map = _read_current_accuracy(target_model, current_map)

    log.info(
        "[MLOps] Validate & Deploy: new_map=%.4f  current_map=%.4f  samples=%d  target=%s",
        new_map, resolved_current_map, len(sample_ids), target_model,
    )

    try:
        # ----- ตรวจสอบ: โมเดลใหม่ต้องดีกว่าเดิม -----
        if new_map <= (resolved_current_map + MIN_MAP_IMPROVEMENT):
            warning_msg = "New model underperforms - Deployment skipped" if is_ocr_model else (
                "[MLOps] New model (mAP=%.4f) NOT better than current (%.4f). Skipping deploy."
            )
            if is_ocr_model:
                log.warning(warning_msg)
            else:
                log.warning(warning_msg, new_map, resolved_current_map)
            _save_run_report(run_path, new_map, resolved_current_map, "rejected_low_map", [])
            _release_lock()
            return {
                "ok": True,
                "deployed": False,
                "reason": "map_not_improved",
                "new_map": new_map,
                "current_map": resolved_current_map,
            }

        if not new_pt.exists():
            log.error("[MLOps] new model file not found: %s", new_pt)
            _release_lock()
            return {"ok": False, "reason": "model_file_missing"}

        # ----- Backup โมเดลเก่า -----
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        if is_ocr_model:
            backup_pt = target_model.with_suffix(f"{target_model.suffix}.bak")
            if backup_pt.exists():
                backup_pt.unlink()
            if target_model.exists():
                os.replace(target_model, backup_pt)
                log.info("[MLOps] Old OCR model renamed to backup: %s", backup_pt)
        else:
            backup_dir = MODELS_DIR / "backups"
            backup_dir.mkdir(exist_ok=True)
            backup_pt = backup_dir / f"best_{ts}_map{resolved_current_map:.4f}.pt"
            if target_model.exists():
                shutil.copy2(target_model, backup_pt)
                log.info("[MLOps] Old model backed up to %s", backup_pt)

        # ----- Atomic deploy -----
        # copy → temp file → os.replace (atomic on Linux)
        staging = MODELS_DIR / f"{target_model.stem}_staging_{ts}{target_model.suffix}"
        shutil.copy2(new_pt, staging)
        os.replace(staging, target_model)  # ✅ atomic — production ไม่ได้รับ half-written file
        log.info("[MLOps] ✅ New model deployed: %s", target_model)

        if is_ocr_model:
            _write_ocr_version(new_map, new_pt)

        # ----- Invalidate stale derived artifacts -----
        # best.onnx and engines/ are compiled from best.pt.  Now that best.pt
        # has changed they must be regenerated.  Deleting them here forces
        # ensure_engine.py (run by the worker on next start) to rebuild both.
        # If deletion fails for any reason we log a warning but continue — the
        # mtime guards in ensure_engine.py will still catch the staleness.
        if not is_ocr_model:
            _invalidate_derived_artifacts(MODELS_DIR)

        # ----- อัปเดต mAP history -----
        MAP_HISTORY_FILE.write_text(
            json.dumps({
                "map50":       new_map,
                "deployed_at": ts,
                "run_dir":     str(run_path),
                "sample_count": len(sample_ids),
                "previous_map": resolved_current_map,
            }, ensure_ascii=False, indent=2)
        )

        # ----- Touch sentinel file (backward-compat / monitoring) -----
        SENTINEL_FILE.touch()
        log.info("[MLOps] Sentinel file touched: %s", SENTINEL_FILE)

        # ----- Restart inference workers via Docker socket -----
        # Immediately restarts all worker-gpu containers so they pick up the
        # new YOLO engine on next start.sh initialisation.  Rolling restart
        # (3 s stagger) keeps at least 2 of 3 replicas handling traffic.
        try:
            from mlops.tasks.worker_restart import restart_inference_workers
            restart_result = restart_inference_workers()
            log.info("[MLOps] Worker restart result: %s", restart_result)
        except Exception as _restart_exc:
            # Non-fatal — the sentinel watcher will still trigger a reload
            # within 30 s.  Log and continue so the deploy is not rolled back.
            log.warning(
                "[MLOps] Docker restart failed (non-fatal): %s.  "
                "Workers will reload via sentinel watcher within 30 s.",
                _restart_exc,
            )

        # ----- Mark samples ว่าใช้แล้ว (เฉพาะ deploy สำเร็จ) -----
        deployed_ids = _mark_samples_used(sample_ids)
        log.info("[MLOps] Marked %d samples as used_in_train=True", deployed_ids)

        _save_run_report(run_path, new_map, resolved_current_map, "deployed", sample_ids)
        _release_lock()

        return {
            "ok": True,
            "deployed": True,
            "new_map": new_map,
            "current_map": resolved_current_map,
            "backup": str(backup_pt),
            "samples_marked": deployed_ids,
        }

    except Exception as exc:
        log.error("[MLOps] validate_and_deploy failed: %s", exc, exc_info=True)
        # ✅ Fail-safe: ไม่แตะ production model ถ้า error ระหว่าง deploy
        _release_lock()
        raise


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mark_samples_used(sample_ids: list) -> int:
    if not sample_ids:
        return 0
    db = _Session()
    try:
        result = db.execute(
            text("UPDATE feedback_samples SET used_in_train = TRUE WHERE id = ANY(:ids)"),
            {"ids": list(sample_ids)},
        )
        db.commit()
        return result.rowcount
    except Exception as e:
        db.rollback()
        log.error("[MLOps] mark_samples_used failed: %s", e)
        return 0
    finally:
        db.close()


def _save_run_report(run_dir: Path, new_map: float, current_map: float,
                     status: str, sample_ids: list):
    """บันทึก report JSON ไว้ใน run directory"""
    report = {
        "status":       status,
        "new_map":      new_map,
        "current_map":  current_map,
        "sample_count": len(sample_ids),
        "finished_at":  datetime.now(timezone.utc).isoformat(),
    }
    report_path = run_dir / "deploy_report.json"
    try:
        report_path.write_text(json.dumps(report, indent=2))
        log.info("[MLOps] Run report saved: %s", report_path)
    except Exception as e:
        log.warning("[MLOps] Cannot save report: %s", e)


def _release_lock():
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
            log.info("[MLOps] Training lock released.")
    except Exception:
        pass


def _invalidate_derived_artifacts(models_dir: Path) -> None:
    """Delete best.onnx and clear engines/ so ensure_engine.py rebuilds from scratch.

    Called immediately after a new best.pt is atomically deployed.  The worker
    watches reload.sentinel and calls ensure_engine.py before loading the model,
    so it will always regenerate fresh artifacts from the new .pt file.
    """
    # Remove stale ONNX
    onnx = models_dir / "best.onnx"
    if onnx.exists():
        try:
            onnx.unlink()
            log.info("[MLOps] Removed stale ONNX: %s", onnx)
        except Exception as exc:
            log.warning("[MLOps] Could not remove stale ONNX %s: %s", onnx, exc)

    # Remove any ONNX that ultralytics may have placed beside the .pt
    pt_side = models_dir / "best.onnx"   # already handled above; kept for clarity
    alt_onnx = models_dir / "best_opset12.onnx"
    for extra in (alt_onnx,):
        if extra.exists():
            try:
                extra.unlink()
                log.info("[MLOps] Removed stale ONNX (alt): %s", extra)
            except Exception as exc:
                log.warning("[MLOps] Could not remove %s: %s", extra, exc)

    # Clear engines directory — TensorRT engines are GPU/driver-version specific
    # and must be rebuilt from the new ONNX anyway.
    engines_dir = models_dir / "engines"
    if engines_dir.is_dir():
        removed = 0
        for engine_file in list(engines_dir.glob("*.engine")):
            try:
                engine_file.unlink()
                removed += 1
            except Exception as exc:
                log.warning("[MLOps] Could not remove engine %s: %s", engine_file, exc)
        if removed:
            log.info("[MLOps] Removed %d stale engine file(s) from %s", removed, engines_dir)

    # Remove cached model path pointer so ensure_engine.py writes a fresh one
    model_path_file = models_dir / ".model_path"
    if model_path_file.exists():
        try:
            model_path_file.unlink()
            log.info("[MLOps] Removed stale .model_path pointer")
        except Exception as exc:
            log.warning("[MLOps] Could not remove .model_path: %s", exc)


def _read_current_accuracy(model_path: Path, fallback: float) -> float:
    """Read deployed model accuracy from version file when available."""
    if model_path == OCR_PRODUCTION_MODEL and OCR_VERSION_FILE.exists():
        try:
            payload = json.loads(OCR_VERSION_FILE.read_text())
            return float(payload.get("accuracy", fallback))
        except Exception as exc:
            log.warning("[MLOps] Failed to read OCR version file %s: %s", OCR_VERSION_FILE, exc)
    return fallback


def _write_ocr_version(accuracy: float, source_model: Path) -> None:
    payload = {
        "model_path": str(OCR_PRODUCTION_MODEL),
        "source": str(source_model),
        "accuracy": float(accuracy),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    OCR_VERSION_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    log.info("[MLOps] OCR version metadata updated: %s", OCR_VERSION_FILE)
