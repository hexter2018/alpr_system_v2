import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "alpr_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# ✅ ให้ Celery ไปหา tasks ใน package นี้
celery_app.autodiscover_tasks(["alpr_worker"], related_name="data_retention")

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Bangkok",
    enable_utc=True,
    # ── Celery Beat scheduled tasks ─────────────────────────────────────────
    beat_schedule={
        # Data-retention: runs every day at 02:00 Asia/Bangkok
        # Deletes captures + images older than RETENTION_DAYS (default 90)
        "data-retention-daily": {
            "task": "tasks.run_data_retention",
            "schedule": crontab(hour=2, minute=0),
            "options": {"queue": "celery"},
        },
    },
)
