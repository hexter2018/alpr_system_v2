# worker/alpr_worker/management_tasks.py
"""
Management & Operations tasks for ALPR system.
These tasks should be imported and registered in tasks.py
"""
import os
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from .celery_app import celery_app

# Database session
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

log = logging.getLogger(__name__)

# Configuration from environment
RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "90"))
HEARTBEAT_TIMEOUT_SEC = int(os.getenv("HEARTBEAT_TIMEOUT_SEC", "30"))
METRICS_RETENTION_DAYS = int(os.getenv("METRICS_RETENTION_DAYS", "7"))
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "/storage"))


@celery_app.task(name="tasks.cleanup_old_data")
def cleanup_old_data(retention_days: int = RETENTION_DAYS):
    """
    Delete images and database records older than retention_days.
    Runs daily at 2 AM via celery-beat.
    """
    log.info(f"Starting cleanup of data older than {retention_days} days")
    
    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
    db = SessionLocal()
    
    try:
        # Find old captures to delete
        sql_find_old = text("""
            SELECT id, original_path 
            FROM captures 
            WHERE captured_at < :cutoff_date
            LIMIT 1000
        """)
        
        old_captures = db.execute(sql_find_old, {"cutoff_date": cutoff_date}).mappings().all()
        
        deleted_files = 0
        deleted_records = 0
        
        for capture in old_captures:
            capture_id = capture["id"]
            original_path = capture["original_path"]
            
            # Delete physical image file
            try:
                img_path = Path(original_path)
                if img_path.exists():
                    img_path.unlink()
                    deleted_files += 1
            except Exception as e:
                log.warning(f"Failed to delete file {original_path}: {e}")
            
            # Delete crop files associated with this capture
            sql_find_crops = text("""
                SELECT crop_path 
                FROM detections 
                WHERE capture_id = :capture_id
            """)
            crops = db.execute(sql_find_crops, {"capture_id": capture_id}).mappings().all()
            
            for crop in crops:
                try:
                    crop_path = Path(crop["crop_path"])
                    if crop_path.exists():
                        crop_path.unlink()
                        deleted_files += 1
                except Exception as e:
                    log.warning(f"Failed to delete crop {crop['crop_path']}: {e}")
            
            # Delete database records (cascade will handle related records)
            sql_delete_capture = text("""
                DELETE FROM captures WHERE id = :capture_id
            """)
            db.execute(sql_delete_capture, {"capture_id": capture_id})
            deleted_records += 1
        
        db.commit()
        
        log.info(f"Cleanup complete: deleted {deleted_files} files, {deleted_records} captures")
        return {
            "ok": True,
            "deleted_files": deleted_files,
            "deleted_records": deleted_records,
            "cutoff_date": cutoff_date.isoformat()
        }
        
    except Exception as e:
        db.rollback()
        log.error(f"Cleanup task failed: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(name="tasks.check_camera_heartbeats")
def check_camera_heartbeats(timeout_seconds: int = HEARTBEAT_TIMEOUT_SEC):
    """
    Check camera heartbeats and mark cameras as OFFLINE if no activity.
    Runs every 60 seconds via celery-beat.
    """
    log.debug(f"Checking camera heartbeats (timeout: {timeout_seconds}s)")
    
    cutoff_time = datetime.utcnow() - timedelta(seconds=timeout_seconds)
    db = SessionLocal()
    
    try:
        # Mark cameras as OFFLINE if last_seen is too old
        sql_mark_offline = text("""
            UPDATE cameras 
            SET status = 'OFFLINE'
            WHERE (last_seen < :cutoff_time OR last_seen IS NULL)
              AND status != 'OFFLINE'
              AND enabled = true
            RETURNING camera_id
        """)
        
        offline_cameras = db.execute(sql_mark_offline, {"cutoff_time": cutoff_time}).scalars().all()
        
        # Mark cameras as ONLINE if recently seen
        sql_mark_online = text("""
            UPDATE cameras 
            SET status = 'ONLINE'
            WHERE last_seen >= :cutoff_time
              AND status != 'ONLINE'
              AND enabled = true
            RETURNING camera_id
        """)
        
        online_cameras = db.execute(sql_mark_online, {"cutoff_time": cutoff_time}).scalars().all()
        
        db.commit()
        
        if offline_cameras:
            log.warning(f"Marked cameras OFFLINE: {list(offline_cameras)}")
        if online_cameras:
            log.info(f"Marked cameras ONLINE: {list(online_cameras)}")
        
        return {
            "ok": True,
            "offline": list(offline_cameras),
            "online": list(online_cameras),
            "checked_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        db.rollback()
        log.error(f"Heartbeat check failed: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(name="tasks.cleanup_old_metrics")
def cleanup_old_metrics(retention_days: int = METRICS_RETENTION_DAYS):
    """
    Delete system metrics older than retention_days to prevent table bloat.
    Runs daily at 3 AM via celery-beat.
    """
    log.info(f"Cleaning up metrics older than {retention_days} days")
    
    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
    db = SessionLocal()
    
    try:
        sql_delete = text("""
            DELETE FROM system_metrics 
            WHERE recorded_at < :cutoff_date
        """)
        
        result = db.execute(sql_delete, {"cutoff_date": cutoff_date})
        deleted_count = result.rowcount
        db.commit()
        
        log.info(f"Deleted {deleted_count} old metric records")
        return {
            "ok": True,
            "deleted_count": deleted_count,
            "cutoff_date": cutoff_date.isoformat()
        }
        
    except Exception as e:
        db.rollback()
        log.error(f"Metrics cleanup failed: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(name="tasks.expire_watchlist_entries")
def expire_watchlist_entries():
    """
    Deactivate watchlist entries that have passed their expiration date.
    Runs every hour via celery-beat.
    """
    log.debug("Checking for expired watchlist entries")
    
    now = datetime.utcnow()
    db = SessionLocal()
    
    try:
        sql_expire = text("""
            UPDATE watchlist 
            SET active = false,
                updated_at = :now
            WHERE expires_at IS NOT NULL 
              AND expires_at < :now
              AND active = true
            RETURNING id, plate_text_norm, list_type
        """)
        
        expired = db.execute(sql_expire, {"now": now}).mappings().all()
        db.commit()
        
        if expired:
            log.info(f"Expired {len(expired)} watchlist entries")
            for entry in expired:
                log.debug(f"Expired: {entry['list_type']} - {entry['plate_text_norm']}")
        
        return {
            "ok": True,
            "expired_count": len(expired),
            "entries": [dict(e) for e in expired]
        }
        
    except Exception as e:
        db.rollback()
        log.error(f"Watchlist expiration failed: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(name="tasks.check_watchlist_match")
def check_watchlist_match(read_id: int, plate_text_norm: str, camera_id: str = None):
    """
    Check if a plate read matches any active watchlist entry.
    Creates an alert if there's a match.
    This should be called from process_capture task after a read is created.
    """
    db = SessionLocal()
    
    try:
        # Check for watchlist match
        sql_check = text("""
            SELECT id, list_type, alert_level, reason
            FROM watchlist
            WHERE plate_text_norm = :plate_text_norm
              AND active = true
              AND (expires_at IS NULL OR expires_at > :now)
        """)
        
        matches = db.execute(sql_check, {
            "plate_text_norm": plate_text_norm,
            "now": datetime.utcnow()
        }).mappings().all()
        
        if not matches:
            return {"ok": True, "matched": False}
        
        # Create alerts for each match
        alerts_created = []
        for match in matches:
            sql_create_alert = text("""
                INSERT INTO alerts (
                    read_id, 
                    watchlist_id, 
                    camera_id, 
                    alert_level,
                    acknowledged,
                    created_at
                )
                VALUES (
                    :read_id,
                    :watchlist_id,
                    :camera_id,
                    :alert_level,
                    false,
                    :now
                )
                RETURNING id
            """)
            
            alert_id = db.execute(sql_create_alert, {
                "read_id": read_id,
                "watchlist_id": match["id"],
                "camera_id": camera_id,
                "alert_level": match["alert_level"],
                "now": datetime.utcnow()
            }).scalar_one()
            
            alerts_created.append({
                "alert_id": alert_id,
                "list_type": match["list_type"],
                "alert_level": match["alert_level"]
            })
            
            log.warning(
                f"ALERT: {match['list_type']} match for plate {plate_text_norm} "
                f"(camera: {camera_id}, alert_level: {match['alert_level']})"
            )
        
        db.commit()
        
        return {
            "ok": True,
            "matched": True,
            "alerts_created": alerts_created
        }
        
    except Exception as e:
        db.rollback()
        log.error(f"Watchlist check failed for read {read_id}: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
    finally:
        db.close()