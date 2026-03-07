"""
Celery task wrapper สำหรับ OCR fine-tuning pipeline
รัน export_lmdb → finetune_easyocr เป็น sequence ใน trainer-worker container
"""
import logging, os
from pathlib import Path
from mlops.celery_app import celery_app

log = logging.getLogger(__name__)
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "/storage"))


@celery_app.task(
    name="mlops.tasks.ocr_pipeline.run_ocr_finetune",
    bind=True, max_retries=0, time_limit=86400,
)
def run_ocr_finetune(self, limit: int = 7000, epochs: int = 10):
    """
    Pipeline เต็ม:
      1. export_lmdb    → /storage/ocr_training/lmdb/
      2. finetune       → /storage/ocr_training/output/
      3. deploy         → /models/ocr_th_custom.pth
    """
    log.info("[OCR] Starting OCR fine-tuning pipeline (limit=%d, epochs=%d)", limit, epochs)

    lmdb_dir   = STORAGE_DIR / "ocr_training" / "lmdb"
    output_dir = STORAGE_DIR / "ocr_training" / "output"

    # Step 1: Export LMDB
    from mlops.ocr_finetune.export_lmdb import export_to_lmdb
    ok = export_to_lmdb(output_dir=lmdb_dir, limit=limit, val_split=0.1)
    if not ok:
        log.error("[OCR] LMDB export failed.")
        return {"ok": False, "step": "export_lmdb"}

    # Step 2: Fine-tune
    from mlops.ocr_finetune.finetune_easyocr import finetune
    ok = finetune(
        lmdb_train=str(lmdb_dir / "train"),
        lmdb_val=str(lmdb_dir / "val"),
        output_dir=str(output_dir),
        epochs=epochs,
        batch_size=int(os.getenv("OCR_TRAIN_BATCH", "64")),
        device=os.getenv("YOLO_TRAIN_DEVICE", "0"),
    )
    if not ok:
        log.error("[OCR] Fine-tuning failed.")
        return {"ok": False, "step": "finetune"}

    log.info("[OCR] ✅ Pipeline complete. Model at /models/ocr_th_custom.pth")

    # ── Restart inference workers so they load the new OCR model ──────────────
    # The fine-tuning pipeline has deployed:
    #   /models/ocr_th_custom.pth  — DTRB fine-tuned weights
    #   /models/ocr_th_custom.yaml — EasyOCR architecture config
    # Workers only load these files on startup (PlateOCR.__init__).
    # Restarting the containers forces an immediate reload with zero manual steps.
    restart_result: dict = {"ok": False, "error": "not_attempted"}
    try:
        from mlops.tasks.worker_restart import restart_inference_workers
        restart_result = restart_inference_workers()
        log.info("[OCR] Worker restart result: %s", restart_result)
    except Exception as _exc:
        # Non-fatal — the sentinel watcher (worker/start.sh) will still detect
        # the new reload.sentinel within 30 s and trigger a graceful reload.
        restart_result = {"ok": False, "error": str(_exc)}
        log.warning(
            "[OCR] Docker restart failed (non-fatal): %s.  "
            "Workers will reload via sentinel watcher within 30 s.",
            _exc,
        )

    return {
        "ok": True,
        "lmdb_dir": str(lmdb_dir),
        "output_dir": str(output_dir),
        "restart": restart_result,
    }