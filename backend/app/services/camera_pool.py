"""
Global Camera Pool Manager
Manages multiple camera streams with centralized control
"""

import logging
from typing import Dict, Optional, List
from pathlib import Path
import threading

from .camera_manager import CameraStreamManager, CameraConfig, ProcessedFrame
from app.db.session import SessionLocal
from app.db import models
from app.services.queue import enqueue_process_capture
import hashlib
from datetime import datetime
import cv2

log = logging.getLogger(__name__)


class CameraPoolManager:
    """
    Global manager for all camera streams.
    
    Singleton pattern - one instance per application.
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(
        self,
        storage_dir: Path,
        detector_model_path: str,
        detector_conf: float = 0.35,
        detector_iou: float = 0.45
    ):
        # Prevent re-initialization
        if hasattr(self, '_initialized'):
            return
        
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        self.detector_model_path = detector_model_path
        self.detector_conf = detector_conf
        self.detector_iou = detector_iou
        
        # Camera streams
        self.cameras: Dict[str, CameraStreamManager] = {}
        self.cameras_lock = threading.Lock()
        
        self._initialized = True
        
        log.info("Camera Pool Manager initialized")
    
    def _create_ocr_callback(self, camera_id: str):
        """
        Create OCR callback for a specific camera.
        
        This callback is triggered when a vehicle exits the trigger zone.
        """
        def ocr_callback(track, best_frame, best_bbox):
            try:
                # Save frame to storage
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
                filename = f"stream_{camera_id}_track_{track.track_id}_{timestamp}.jpg"
                image_path = self.storage_dir / "original" / filename
                image_path.parent.mkdir(parents=True, exist_ok=True)
                
                cv2.imwrite(str(image_path), best_frame)
                
                # Create capture record in database
                db = SessionLocal()
                try:
                    # Compute SHA256
                    with open(image_path, "rb") as f:
                        sha256 = hashlib.sha256(f.read()).hexdigest()
                    
                    # Create capture
                    capture = models.Capture(
                        source="STREAM",
                        camera_id=camera_id,
                        captured_at=datetime.utcnow(),
                        original_path=str(image_path),
                        sha256=sha256
                    )
                    
                    db.add(capture)
                    db.commit()
                    db.refresh(capture)
                    
                    # Enqueue for OCR processing
                    enqueue_process_capture(capture.id, str(image_path))
                    
                    log.info(
                        f"OCR queued for camera {camera_id}, "
                        f"track {track.track_id}, capture_id {capture.id}"
                    )
                    
                finally:
                    db.close()
                    
            except Exception as e:
                log.error(f"OCR callback error: {e}", exc_info=True)
        
        return ocr_callback
    
    def start_camera(self, camera_id: str) -> bool:
        """
        Start camera stream.
        
        Returns True if started successfully, False otherwise.
        """
        with self.cameras_lock:
            # Check if already running
            if camera_id in self.cameras:
                log.warning(f"Camera {camera_id} already running")
                return True
            
            # Load camera config from database
            db = SessionLocal()
            try:
                camera = db.query(models.Camera).filter(
                    models.Camera.camera_id == camera_id,
                    models.Camera.enabled == True
                ).first()
                
                if not camera:
                    log.error(f"Camera {camera_id} not found or not enabled")
                    return False
                
                if not camera.rtsp_url:
                    log.error(f"Camera {camera_id} has no RTSP URL")
                    return False
                
                # Create config
                config = CameraConfig(
                    camera_id=camera.camera_id,
                    name=camera.name,
                    rtsp_url=camera.rtsp_url,
                    fps=camera.fps or 2.0,
                    trigger_zone=camera.trigger_zone,
                    enabled=camera.enabled
                )
                
                # Create camera manager
                manager = CameraStreamManager(
                    config=config,
                    detector_model_path=self.detector_model_path,
                    detector_conf=self.detector_conf,
                    detector_iou=self.detector_iou
                )
                
                # Set OCR callback
                manager.set_ocr_callback(self._create_ocr_callback(camera_id))
                
                # Start stream
                manager.start()
                
                # Store manager
                self.cameras[camera_id] = manager
                
                log.info(f"Camera {camera_id} started successfully")
                return True
                
            except Exception as e:
                log.error(f"Failed to start camera {camera_id}: {e}", exc_info=True)
                return False
            finally:
                db.close()
    
    def stop_camera(self, camera_id: str) -> bool:
        """Stop camera stream"""
        with self.cameras_lock:
            if camera_id not in self.cameras:
                log.warning(f"Camera {camera_id} not running")
                return False
            
            manager = self.cameras[camera_id]
            manager.stop()
            del self.cameras[camera_id]
            
            log.info(f"Camera {camera_id} stopped")
            return True
    
    def restart_camera(self, camera_id: str) -> bool:
        """Restart camera stream"""
        self.stop_camera(camera_id)
        return self.start_camera(camera_id)
    
    def reload_trigger_zone(self, camera_id: str):
        """Reload trigger zone from database (called when updated)"""
        with self.cameras_lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].reload_trigger_zone()
                log.info(f"Reloaded trigger zone for {camera_id}")
    
    def get_camera(self, camera_id: str) -> Optional[CameraStreamManager]:
        """Get camera manager"""
        return self.cameras.get(camera_id)
    
    def list_cameras(self) -> List[str]:
        """List all running cameras"""
        return list(self.cameras.keys())
    
    def get_all_stats(self) -> Dict:
        """Get stats for all cameras"""
        return {
            camera_id: manager.get_stats()
            for camera_id, manager in self.cameras.items()
        }
    
    def stop_all(self):
        """Stop all camera streams"""
        with self.cameras_lock:
            for camera_id in list(self.cameras.keys()):
                self.stop_camera(camera_id)
        
        log.info("All cameras stopped")


# Global instance
_camera_pool: Optional[CameraPoolManager] = None
_pool_lock = threading.Lock()


def get_camera_pool(
    storage_dir: Optional[Path] = None,
    detector_model_path: Optional[str] = None,
    **kwargs
) -> CameraPoolManager:
    """
    Get global camera pool instance.
    
    Thread-safe singleton.
    """
    global _camera_pool
    
    if _camera_pool is None:
        with _pool_lock:
            if _camera_pool is None:
                if storage_dir is None or detector_model_path is None:
                    raise ValueError(
                        "First call to get_camera_pool must provide "
                        "storage_dir and detector_model_path"
                    )
                
                _camera_pool = CameraPoolManager(
                    storage_dir=storage_dir,
                    detector_model_path=detector_model_path,
                    **kwargs
                )
    
    return _camera_pool