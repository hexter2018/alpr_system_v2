# Thai ALPR MLOps Pipeline - Complete Implementation
# =====================================================
# Copy each section into the corresponding file path shown above it.

# ===========================================================================
# FILE: mlops/__init__.py
# ===========================================================================
# (empty)

# ===========================================================================
# FILE: mlops/celery_app.py
# ===========================================================================
"""
Celery app สำหรับ MLOps pipeline
- queue "training" แยกจาก production queue "default"
"""
import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery("mlops_worker", broker=REDIS_URL, backend=REDIS_URL)
celery_app.autodiscover_tasks(["mlops.tasks"])

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Bangkok",
    enable_utc=True,
    task_default_queue="training",
    task_routes={
        "mlops.tasks.check_retrain.check_retrain_trigger": {"queue": "training"},
        "mlops.tasks.yolo_retrain.export_yolo_dataset":    {"queue": "training"},
        "mlops.tasks.yolo_retrain.run_yolo_train":         {"queue": "training"},
        "mlops.tasks.model_deploy.validate_and_deploy":    {"queue": "training"},
    },
    beat_schedule={
        "check-retrain-trigger": {
            "task": "mlops.tasks.check_retrain.check_retrain_trigger",
            "schedule": crontab(minute=0, hour="*/1"),
            "options": {"queue": "training"},
        },
    },
    beat_schedule_filename="/data/celerybeat-schedule",
)