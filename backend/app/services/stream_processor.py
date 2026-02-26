import cv2
import numpy as np
import base64
import logging
import requests
from typing import Optional, List, Tuple, Dict
from pathlib import Path
import asyncio
from datetime import datetime

from .vehicle_tracker import VehicleTracker, VehicleTrack, VehicleState
from .trigger_zone import TriggerZone, BBox
from ..services.queue import enqueue_process_capture

log = logging.getLogger(__name__)


class StreamProcessor:
    """
    Processes video frames from WebSocket stream.
    Handles vehicle detection, tracking, and triggers OCR processing.
    """
    
    def __init__(
        self,
        storage_dir: Path,
        detector_model_path: str,
        detector_conf: float = 0.35,
        detector_iou: float = 0.45,
        session_id: str = None,
    ):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize vehicle detector (YOLOv8)
        from ultralytics import YOLO
        self.detector = YOLO(detector_model_path, task="detect")
        self.detector_conf = detector_conf
        self.detector_iou = detector_iou
        
        # Initialize tracker
        self.tracker = VehicleTracker(
            max_disappeared=30,
            max_distance=100.0,
            min_frames_in_zone=5,
            min_frames_out_of_zone=10,
        )
        
        # Zone configuration (can be updated via WebSocket message)
        self.trigger_zone: Optional[TriggerZone] = None
        
        # Statistics
        self.frame_count = 0
        self.total_vehicles_processed = 0
        
        # Heartbeat configuration
        self.session_id = session_id
        self.heartbeat_interval = 30  # Send heartbeat every 30 frames
        self.api_base = "http://backend:8000"  # Internal Docker network URL
        self.current_fps = 0.0
        self.last_heartbeat_frame = 0
        
        log.info("StreamProcessor initialized with model: %s", detector_model_path)
    
    def set_trigger_zone(self, points: List[Tuple[float, float]], zone_type: str = "polygon"):
        """Configure the trigger zone"""
        self.trigger_zone = TriggerZone(points, zone_type)
        log.info("Trigger zone configured: %s with %d points", zone_type, len(points))
    
    async def process_frame(
        self,
        frame_data: str,  # base64 encoded image
        session_id: str,
        frame_number: int
    ) -> Dict:
        """
        Process a single frame from WebSocket.
        
        Returns:
            dict with tracking results and triggers for OCR processing
        """
        try:
            # Decode frame
            frame = self._decode_frame(frame_data)
            if frame is None:
                return {"error": "Failed to decode frame"}
            
            self.frame_count += 1
            
            # Calculate FPS (simple moving average)
            # This assumes process_frame is called regularly
            # For more accurate FPS, track timestamps between frames
            if not hasattr(self, '_fps_frames'):
                self._fps_frames = []
                self._fps_last_time = datetime.utcnow()
            
            current_time = datetime.utcnow()
            time_diff = (current_time - self._fps_last_time).total_seconds()
            
            if time_diff >= 1.0:  # Update FPS every second
                self.current_fps = len(self._fps_frames) / time_diff
                self._fps_frames = []
                self._fps_last_time = current_time
            
            self._fps_frames.append(frame_number)
            
            # Send heartbeat every N frames
            if self.session_id and self.frame_count % self.heartbeat_interval == 0:
                self._send_heartbeat()
            
            # Run vehicle detection
            detections = self._detect_vehicles(frame)
            
            # Update tracker
            tracks = self.tracker.update(detections, frame, self.trigger_zone)
            
            # Check for tracks ready for OCR processing
            ready_tracks = self.tracker.get_tracks_ready_for_processing()
            
            # Process ready tracks
            processing_results = []
            for track in ready_tracks:
                result = await self._trigger_ocr_processing(track, session_id)
                if result:
                    processing_results.append(result)
                    self.total_vehicles_processed += 1
            
            # Prepare response
            response = {
                "frame_number": frame_number,
                "timestamp": datetime.utcnow().isoformat(),
                "active_tracks": len(tracks),
                "detections": len(detections),
                "processing_triggered": len(processing_results),
                "tracks": self._serialize_tracks(tracks),
                "ocr_results": processing_results,
                "stats": {
                    "total_frames": self.frame_count,
                    "total_vehicles_processed": self.total_vehicles_processed,
                }
            }
            
            return response
            
        except Exception as e:
            log.error("Error processing frame: %s", e, exc_info=True)
            return {"error": str(e)}
    
    def _decode_frame(self, frame_data: str) -> Optional[np.ndarray]:
        """Decode base64 frame to numpy array"""
        try:
            # Remove data URL prefix if present
            if "base64," in frame_data:
                frame_data = frame_data.split("base64,")[1]
            
            # Decode base64
            img_bytes = base64.b64decode(frame_data)
            
            # Convert to numpy array
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            return frame
            
        except Exception as e:
            log.error("Frame decode error: %s", e)
            return None
    
    def _detect_vehicles(self, frame: np.ndarray) -> List[Tuple[BBox, float]]:
        """
        Run YOLO vehicle detection on frame.
        Returns list of (bbox, confidence) tuples.
        """
        try:
            # Run detection
            results = self.detector.predict(
                source=frame,
                conf=self.detector_conf,
                iou=self.detector_iou,
                classes=[2, 3, 5, 7],  # car, motorcycle, bus, truck
                verbose=False,
                device=0,  # GPU
            )
            
            if not results or results[0].boxes is None:
                return []
            
            boxes = results[0].boxes
            detections = []
            
            for box in boxes:
                xyxy = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0].cpu().numpy())
                
                bbox = BBox(
                    x1=float(xyxy[0]),
                    y1=float(xyxy[1]),
                    x2=float(xyxy[2]),
                    y2=float(xyxy[3])
                )
                
                detections.append((bbox, conf))
            
            return detections
            
        except Exception as e:
            log.error("Vehicle detection error: %s", e)
            return []
    
    async def _trigger_ocr_processing(
        self,
        track: VehicleTrack,
        session_id: str
    ) -> Optional[Dict]:
        """
        Trigger OCR processing for a vehicle track's best shot.
        
        Returns OCR result if successful, None otherwise.
        """
        try:
            # Mark as processing started
            track.processing_started = True
            
            # Get best shot
            best_frame, best_bbox = track.get_best_shot()
            if best_frame is None or best_bbox is None:
                log.warning("No best shot available for track %d", track.track_id)
                return None
            
            # Save frame to storage
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"stream_{session_id}_track_{track.track_id}_{timestamp}.jpg"
            image_path = self.storage_dir / "original" / filename
            image_path.parent.mkdir(parents=True, exist_ok=True)
            
            cv2.imwrite(str(image_path), best_frame)
            
            # Create capture record in database
            from sqlalchemy import text
            from ..db.session import SessionLocal
            import hashlib
            
            db = SessionLocal()
            try:
                # Compute SHA256
                with open(image_path, "rb") as f:
                    sha256 = hashlib.sha256(f.read()).hexdigest()
                
                # Insert capture
                sql = text("""
                    INSERT INTO captures (
                        source, camera_id, captured_at, original_path, sha256
                    )
                    VALUES (
                        :source, :camera_id, :captured_at, :original_path, :sha256
                    )
                    RETURNING id
                """)
                
                capture_id = db.execute(sql, {
                    "source": "STREAM",
                    "camera_id": session_id,
                    "captured_at": datetime.utcnow(),
                    "original_path": str(image_path),
                    "sha256": sha256,
                }).scalar_one()
                
                db.commit()
                
                # Enqueue for OCR processing (existing Celery task)
                enqueue_process_capture(capture_id, str(image_path))
                
                log.info(
                    "Triggered OCR for track %d, capture_id %d",
                    track.track_id, capture_id
                )
                
                return {
                    "track_id": track.track_id,
                    "capture_id": capture_id,
                    "bbox": {
                        "x1": best_bbox.x1,
                        "y1": best_bbox.y1,
                        "x2": best_bbox.x2,
                        "y2": best_bbox.y2,
                    },
                    "best_shot_score": track.best_shot_score,
                    "time_in_zone": (
                        track.zone_exit_time - track.zone_entry_time
                        if track.zone_exit_time and track.zone_entry_time
                        else 0
                    ),
                }
                
            finally:
                db.close()
            
        except Exception as e:
            log.error("OCR trigger error for track %d: %s", track.track_id, e, exc_info=True)
            return None
    
    def _serialize_tracks(self, tracks: Dict[int, VehicleTrack]) -> List[Dict]:
        """Serialize tracks for JSON response"""
        serialized = []
        
        for track_id, track in tracks.items():
            bbox = track.current_bbox
            if bbox is None:
                continue
            
            serialized.append({
                "track_id": track_id,
                "state": track.state.value,
                "bbox": {
                    "x1": bbox.x1,
                    "y1": bbox.y1,
                    "x2": bbox.x2,
                    "y2": bbox.y2,
                },
                "frames_in_zone": track.frames_in_zone,
                "age": track.age,
                "processing_started": track.processing_started,
            })
        
        return serialized
    
    def load_trigger_zone_from_db(self, session_id: str):
        """Load trigger zone from database for this camera"""
        from sqlalchemy import text
        from ..db.session import SessionLocal
        
        db = SessionLocal()
        try:
            sql = text("SELECT trigger_zone FROM cameras WHERE camera_id = :camera_id")
            result = db.execute(sql, {"camera_id": session_id}).scalar_one_or_none()
            
            if result and result.get("points"):
                self.set_trigger_zone(
                    points=result["points"],
                    zone_type=result.get("type", "polygon")
                )
                log.info(f"Loaded trigger zone for camera {session_id}")
        finally:
            db.close()

    def _send_heartbeat(self):
        """Send heartbeat update to backend API"""
        try:
            url = f"{self.api_base}/api/health/heartbeat/{self.session_id}"
            payload = {"fps": round(self.current_fps, 2)}
            
            response = requests.post(url, json=payload, timeout=1.0)
            
            if response.status_code == 200:
                log.debug(
                    "Heartbeat sent for camera %s (FPS: %.1f)",
                    self.session_id,
                    self.current_fps
                )
            else:
                log.warning(
                    "Heartbeat failed for camera %s: HTTP %d",
                    self.session_id,
                    response.status_code
                )
                
        except requests.Timeout:
            log.debug("Heartbeat timeout for camera %s (non-critical)", self.session_id)
        except Exception as e:
            # Don't let heartbeat errors crash the stream processor
            log.debug("Heartbeat error for camera %s: %s", self.session_id, e)