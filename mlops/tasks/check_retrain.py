"""
mlops/tasks/check_retrain.py
============================
Celery Beat task: เช็ค feedback_samples threshold ทุก 1 ชั่วโมง
ถ้าครบ threshold → trigger YOLO retrain + OCR finetune พร้อมกัน (parallel)

กฎเหล็ก:
  - ทำงานใน queue "training" เท่านั้น → production ไม่กระทบ
  - ถ้า error → log + หยุดเงียบ production ทำงานต่อด้วยโมเดลเดิม
  - OCR_RETRAIN_THRESHOLD แยกจาก RETRAIN_THRESHOLD ได้ (default: เท่ากัน)
"""
import os
import logging
from datetime import datetime, timezone

from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from mlops.celery_app import celery_app

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")

# ── Thresholds ──────────────────────────────────────────────────────────────
# RETRAIN_THRESHOLD     : จำนวน samples ขั้นต่ำที่จะ trigger YOLO retrain
# OCR_RETRAIN_THRESHOLD : จำนวน samples ขั้นต่ำที่จะ trigger OCR finetune
#   (default: ใช้ค่าเดียวกับ RETRAIN_THRESHOLD เพื่อ trigger ทั้งคู่พร้อมกัน)
RETRAIN_THRESHOLD     = int(os.getenv("RETRAIN_THRESHOLD",     "1000"))
OCR_RETRAIN_THRESHOLD = int(os.getenv("OCR_RETRAIN_THRESHOLD", str(RETRAIN_THRESHOLD)))

LOCK_FILE = "/tmp/mlops_training.lock"

_engine = create_engine(DATABASE_URL, pool_pre_ping=True)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


@celery_app.task(
    name="mlops.tasks.check_retrain.check_retrain_trigger",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def check_retrain_trigger(self):
    """
    เช็คจำนวน feedback_samples ที่ยังไม่ได้ train
    ถ้า >= RETRAIN_THRESHOLD     → dispatch export_yolo_dataset  (YOLO pipeline)
    ถ้า >= OCR_RETRAIN_THRESHOLD → dispatch run_ocr_finetune     (OCR pipeline)
    ทั้งสองรัน parallel กันบน queue "training"
    """
    log.info(
        "[MLOps] Checking retrain trigger (yolo_threshold=%d, ocr_threshold=%d)...",
        RETRAIN_THRESHOLD, OCR_RETRAIN_THRESHOLD,
    )

    db = _Session()
    try:
        count = db.execute(
            text("SELECT COUNT(*) FROM feedback_samples WHERE used_in_train = FALSE")
        ).scalar() or 0
        count = int(count)

        log.info("[MLOps] Pending training samples: %d", count)

        # ป้องกัน double-trigger: ถ้า lock file มีอยู่ → กำลัง train อยู่
        if os.path.exists(LOCK_FILE):
            log.info("[MLOps] Training already running (lock exists). Skipping.")
            return {
                "ok": True,
                "pending_count": count,
                "action": "skipped_locked",
                "ts": datetime.now(timezone.utc).isoformat(),
            }

        triggered = []

        yolo_ready = count >= RETRAIN_THRESHOLD
        ocr_ready  = count >= OCR_RETRAIN_THRESHOLD

        if yolo_ready or ocr_ready:
            # สร้าง lock file ก่อน dispatch — ป้องกัน beat check รอบถัดไป re-trigger
            with open(LOCK_FILE, "w") as f:
                f.write(datetime.now(timezone.utc).isoformat())

        if yolo_ready:
            log.info(
                "[MLOps] YOLO threshold reached (%d >= %d). Dispatching export_yolo_dataset...",
                count, RETRAIN_THRESHOLD,
            )
            from mlops.tasks.yolo_retrain import export_yolo_dataset
            export_yolo_dataset.apply_async(
                kwargs={"limit": count},
                queue="training",
            )
            triggered.append("yolo_retrain")

        if ocr_ready:
            log.info(
                "[MLOps] OCR threshold reached (%d >= %d). Dispatching run_ocr_finetune...",
                count, OCR_RETRAIN_THRESHOLD,
            )
            from mlops.ocr_finetune.celery_tasks import run_ocr_finetune
            run_ocr_finetune.apply_async(
                kwargs={"limit": count, "epochs": int(os.getenv("OCR_TRAIN_EPOCHS", "10"))},
                queue="training",
            )
            triggered.append("ocr_finetune")

        if triggered:
            return {
                "ok": True,
                "pending_count": count,
                "action": "triggered",
                "triggered": triggered,
                "ts": datetime.now(timezone.utc).isoformat(),
            }

        return {
            "ok": True,
            "pending_count": count,
            "action": "below_threshold",
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        log.error("[MLOps] check_retrain_trigger failed: %s", exc, exc_info=True)
        # ✅ Fail-safe: ลบ lock ถ้าสร้างไปแล้วก่อน error
        _release_lock()
        raise self.retry(exc=exc)
    finally:
        db.close()


def _release_lock():
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
    except Exception:
        pass
