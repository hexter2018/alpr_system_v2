import os
from celery import Celery

from celery.schedules import crontab
from datetime import timedelta

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "alpr_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# ✅ ให้ Celery ไปหา tasks ใน package นี้
celery_app.autodiscover_tasks(["alpr_worker"])

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Bangkok",
    enable_utc=True,
)

# Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    'cleanup-old-data': {
        'task': 'tasks.cleanup_old_data',
        'schedule': crontab(hour=2, minute=0),
    },
    'check-camera-heartbeats': {
        'task': 'tasks.check_camera_heartbeats',
        'schedule': timedelta(seconds=60),
    },
    'cleanup-old-metrics': {
        'task': 'tasks.cleanup_old_metrics',
        'schedule': crontab(hour=3, minute=0),
    },
    'expire-watchlist-entries': {
        'task': 'tasks.expire_watchlist_entries',
        'schedule': timedelta(hours=1),
    }
}