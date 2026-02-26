#!/usr/bin/env python3
"""
Celery Beat configuration for periodic tasks.
Add this to your worker/alpr_worker/celery_app.py
"""
import os
from datetime import timedelta
from celery.schedules import crontab

# This should be added to your celery_app.py configuration

CELERY_BEAT_SCHEDULE = {
    # Data retention task - runs daily at 2 AM
    'cleanup-old-data': {
        'task': 'tasks.cleanup_old_data',
        'schedule': crontab(hour=2, minute=0),
        'options': {'queue': 'maintenance'}
    },
    
    # Camera heartbeat check - runs every minute
    'check-camera-heartbeats': {
        'task': 'tasks.check_camera_heartbeats',
        'schedule': timedelta(seconds=60),
        'options': {'queue': 'monitoring'}
    },
    
    # Cleanup old metrics - runs daily at 3 AM
    'cleanup-old-metrics': {
        'task': 'tasks.cleanup_old_metrics',
        'schedule': crontab(hour=3, minute=0),
        'options': {'queue': 'maintenance'}
    },
    
    # Check watchlist expirations - runs every hour
    'expire-watchlist-entries': {
        'task': 'tasks.expire_watchlist_entries',
        'schedule': timedelta(hours=1),
        'options': {'queue': 'monitoring'}
    }
}

# Update your celery_app configuration:
# celery_app.conf.beat_schedule = CELERY_BEAT_SCHEDULE