"""
mlops/tasks/check_retrain.py
============================
Celery Beat task: เช็ค feedback_samples threshold ทุก 1 ชั่วโมง
ถ้าครบ 1,000 samples → trigger YOLO retrain pipeline

กฎเหล็ก:
  - ทำงานใน queue "training" เท่านั้น → production ไม่กระทบ
  - ถ้า error → log + หยุดเงียบ production ทำงานต่อด้วยโมเดลเดิม
"""
import os
import logging
from datetime import datetime, timezone

from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from mlops.celery_app import celery_app

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
RETRAIN_THRESHOLD = int(os.getenv("RETRAIN_THRESHOLD", "1000"))
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
    ถ้า >= RETRAIN_THRESHOLD → ส่ง export_yolo_dataset task
    """
    log.info("[MLOps] Checking retrain trigger (threshold=%d)...", RETRAIN_THRESHOLD)

    db = _Session()
    try:
        count = db.execute(
            text("SELECT COUNT(*) FROM feedback_samples WHERE used_in_train = FALSE")
        ).scalar() or 0
        count = int(count)

        log.info("[MLOps] Pending training samples: %d / %d", count, RETRAIN_THRESHOLD)

        # ป้องกัน double-trigger: ถ้า lock file มีอยู่ → กำลัง train อยู่
        if os.path.exists(LOCK_FILE):
            log.info("[MLOps] Training already running (lock exists). Skipping.")
            return {
                "ok": True,
                "pending_count": count,
                "action": "skipped_locked",
                "ts": datetime.now(timezone.utc).isoformat(),
            }

        if count >= RETRAIN_THRESHOLD:
            log.info("[MLOps] Threshold reached! Triggering YOLO retrain...")
            # สร้าง lock file ก่อน dispatch
            with open(LOCK_FILE, "w") as f:
                f.write(datetime.now(timezone.utc).isoformat())

            from mlops.tasks.yolo_retrain import export_yolo_dataset
            export_yolo_dataset.apply_async(
                kwargs={"limit": count},
                queue="training",
            )
            return {
                "ok": True,
                "pending_count": count,
                "action": "triggered_retrain",
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