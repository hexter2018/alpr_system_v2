import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "mlops_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "mlops.tasks.check_retrain",
        "mlops.tasks.yolo_retrain",
        "mlops.tasks.model_deploy",
        "mlops.ocr_finetune.celery_tasks",
        "mlops.tasks.province_dataset",   # province-band image export
        "mlops.tasks.province_retrain",   # YOLOv8n-cls training + deploy
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Bangkok",
    enable_utc=True,
    task_default_queue="training",
    task_routes={
        "mlops.tasks.check_retrain.check_retrain_trigger":              {"queue": "training"},
        "mlops.tasks.yolo_retrain.export_yolo_dataset":                 {"queue": "training"},
        "mlops.tasks.yolo_retrain.run_yolo_train":                      {"queue": "training"},
        "mlops.tasks.model_deploy.validate_and_deploy":                 {"queue": "training"},
        # OCR fine-tuning pipeline
        "mlops.tasks.ocr_pipeline.run_ocr_finetune":                    {"queue": "training"},
        # Province classifier pipeline
        "mlops.tasks.province_pipeline.export_province_dataset":        {"queue": "training"},
        "mlops.tasks.province_pipeline.run_province_train":             {"queue": "training"},
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