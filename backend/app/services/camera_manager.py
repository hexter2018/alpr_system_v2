"""
Camera Manager with Trigger Zone Integration
Manages RTSP streams with trigger zone overlay and intelligent processing
"""

import cv2
import numpy as np
import threading
import time
import logging
from typing import Optional, Dict, List, Tuple, Callable
from dataclasses import dataclass
from datetime import datetime
from queue import Queue, Full
import asyncio

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db import models
from app.services.trigger_zone import TriggerZone, BBox
from app.services.vehicle_tracker import VehicleTracker, VehicleTrack

log = logging.getLogger(__name__)


@dataclass
class CameraConfig:
    """Camera configuration with trigger zone"""
    camera_id: str
    name: str
    rtsp_url: str
    fps: float
    trigger_zone: Optional[Dict] = None  # {"points": [[x,y], ...], "type": "polygon"}
    enabled: bool = True


@dataclass
class ProcessedFrame:
    """Frame with overlay and metadata"""
    frame: np.ndarray  # Frame with trigger zone overlay
    raw_frame: np.ndarray  # Original frame without overlay
    timestamp: datetime
    frame_number: int
    camera_id: str
    detections: List[Tuple[BBox, float]]  # Bounding boxes and confidences
    tracks: Dict[int, VehicleTrack]
    in_zone_count: int  # Number of vehicles in trigger zone


class CameraStreamManager:
    """
    Manages RTSP camera stream with trigger zone integration.
    
    Key Features:
    - Background thread for frame capture
    - Trigger zone overlay on every frame
    - Vehicle detection and tracking
    - Zone-based OCR triggering
    - Pub/Sub pattern for frame distribution
    """
    
    def __init__(
        self,
        config: CameraConfig,
        detector_model_path: str,
        detector_conf: float = 0.35,
        detector_iou: float = 0.45,
        frame_queue_size: int = 10
    ):
        self.config = config
        self.running = False
        self.capture_thread: Optional[threading.Thread] = None
        self.process_thread: Optional[threading.Thread] = None
        
        # Frame queues
        self.raw_frame_queue = Queue(maxsize=frame_queue_size)
        self.processed_frame_queue = Queue(maxsize=frame_queue_size)
        
        # Subscribers (for WebSocket/MJPEG streaming)
        self.subscribers: List[Callable[[ProcessedFrame], None]] = []
        self.subscriber_lock = threading.Lock()
        
        # Initialize detector
        from ultralytics import YOLO
        import torch

        self.device = 0 if torch.cuda.is_available() else 'cpu'
        print(f"Using device: {self.device}")

        self.detector = YOLO(detector_model_path, task="detect")
        self.detector_conf = detector_conf
        self.detector_iou = detector_iou
        
        # Initialize tracker
        self.tracker = VehicleTracker(
            max_disappeared=30,
            max_distance=100.0,
            min_frames_in_zone=5,
            min_frames_out_of_zone=10
        )
        
        # Trigger zone (loaded from DB)
        self.trigger_zone: Optional[TriggerZone] = None
        self._load_trigger_zone()
        
        # Stats
        self.frame_count = 0
        self.processed_count = 0
        self.ocr_triggered_count = 0
        self.fps_actual = 0.0
        self.last_fps_update = time.time()
        self.fps_frame_count = 0
        
        # OCR callback
        self.ocr_callback: Optional[Callable[[VehicleTrack, np.ndarray, BBox], None]] = None
        
        log.info(f"Camera Manager initialized for {config.camera_id}")
    
    def _load_trigger_zone(self):
        """Load trigger zone from database"""
        try:
            db = SessionLocal()
            try:
                camera = db.query(models.Camera).filter(
                    models.Camera.camera_id == self.config.camera_id
                ).first()
                
                if camera and camera.trigger_zone:
                    points = camera.trigger_zone.get("points", [])
                    zone_type = camera.trigger_zone.get("type", "polygon")
                    
                    if points:
                        self.trigger_zone = TriggerZone(
                            points=[(float(x), float(y)) for x, y in points],
                            zone_type=zone_type
                        )
                        log.info(f"Loaded trigger zone for {self.config.camera_id}: {len(points)} points")
                    else:
                        log.warning(f"No trigger zone points for {self.config.camera_id}")
                else:
                    log.warning(f"No trigger zone configured for {self.config.camera_id}")
            finally:
                db.close()
        except Exception as e:
            log.error(f"Failed to load trigger zone: {e}", exc_info=True)
    
    def reload_trigger_zone(self):
        """Reload trigger zone from database (called when updated)"""
        self._load_trigger_zone()
    
    def set_ocr_callback(self, callback: Callable[[VehicleTrack, np.ndarray, BBox], None]):
        """Set callback for OCR processing when vehicle exits trigger zone"""
        self.ocr_callback = callback
    
    def subscribe(self, callback: Callable[[ProcessedFrame], None]):
        """Subscribe to processed frames (for WebSocket/MJPEG streaming)"""
        with self.subscriber_lock:
            self.subscribers.append(callback)
            log.info(f"New subscriber added. Total: {len(self.subscribers)}")
    
    def unsubscribe(self, callback: Callable[[ProcessedFrame], None]):
        """Unsubscribe from processed frames"""
        with self.subscriber_lock:
            if callback in self.subscribers:
                self.subscribers.remove(callback)
                log.info(f"Subscriber removed. Total: {len(self.subscribers)}")
    
    def _broadcast_frame(self, frame: ProcessedFrame):
        """Broadcast processed frame to all subscribers"""
        with self.subscriber_lock:
            for subscriber in self.subscribers:
                try:
                    subscriber(frame)
                except Exception as e:
                    log.error(f"Subscriber error: {e}", exc_info=True)
    
    def _capture_frames(self):
        """Background thread: Capture frames from RTSP stream"""
        log.info(f"Starting frame capture for {self.config.camera_id}")

        import os
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        
        cap = cv2.VideoCapture(self.config.rtsp_url)
        if not cap.isOpened():
            log.error(f"Failed to open RTSP stream: {self.config.rtsp_url}")
            return
        
        # Set buffer size to 1 to get latest frame
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        target_interval = 1.0 / self.config.fps
        last_capture_time = time.time()
        
        while self.running:
            current_time = time.time()
            
            # Rate limiting
            if current_time - last_capture_time < target_interval:
                time.sleep(0.001)  # Small sleep to prevent CPU spinning
                continue
            
            ret, frame = cap.read()
            if not ret:
                log.warning(f"Failed to read frame from {self.config.camera_id}")
                time.sleep(0.1)
                continue
            
            # Try to add to queue (non-blocking)
            try:
                self.raw_frame_queue.put_nowait((frame.copy(), current_time))
                last_capture_time = current_time
            except Full:
                # Queue full, skip frame
                pass
        
        cap.release()
        log.info(f"Frame capture stopped for {self.config.camera_id}")
    
    def _draw_trigger_zone_overlay(self, frame: np.ndarray) -> np.ndarray:
        """
        Draw trigger zone overlay on frame.
        
        CRITICAL: This must be called BEFORE broadcasting frame to web!
        """
        if not self.trigger_zone:
            return frame
        
        # Create overlay
        overlay = frame.copy()
        
        # Draw polygon
        points = self.trigger_zone.points.astype(np.int32)
        
        # Fill polygon with semi-transparent green
        cv2.fillPoly(overlay, [points], color=(0, 255, 0))
        
        # Blend overlay with original frame (20% opacity)
        frame_with_overlay = cv2.addWeighted(frame, 0.8, overlay, 0.2, 0)
        
        # Draw polygon border (bright green, thick)
        cv2.polylines(frame_with_overlay, [points], isClosed=True, 
                     color=(0, 255, 0), thickness=3)
        
        # Add label
        text = "TRIGGER ZONE"
        font = cv2.FONT_HERSHEY_SIMPLEX
        text_size = cv2.getTextSize(text, font, 0.7, 2)[0]
        
        # Position text at top-left of zone
        if len(points) > 0:
            text_x = int(points[:, 0].min())
            text_y = int(points[:, 1].min()) - 10
            
            # Background for text
            cv2.rectangle(
                frame_with_overlay,
                (text_x - 5, text_y - text_size[1] - 5),
                (text_x + text_size[0] + 5, text_y + 5),
                (0, 255, 0),
                -1
            )
            
            # Text
            cv2.putText(
                frame_with_overlay,
                text,
                (text_x, text_y),
                font,
                0.7,
                (0, 0, 0),
                2
            )
        
        return frame_with_overlay
    
    def _detect_vehicles(self, frame: np.ndarray) -> List[Tuple[BBox, float]]:
        """Run YOLO vehicle detection"""
        try:
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
            log.error(f"Vehicle detection error: {e}")
            return []
    
    def _trigger_ocr_for_track(self, track: VehicleTrack):
        """
        Trigger OCR processing for vehicle track.
        
        This is called when vehicle exits trigger zone.
        """
        if not self.ocr_callback:
            log.warning("No OCR callback set, skipping processing")
            return
        
        # Get best shot
        best_frame, best_bbox = track.get_best_shot()
        if best_frame is None or best_bbox is None:
            log.warning(f"No best shot for track {track.track_id}")
            return
        
        try:
            self.ocr_callback(track, best_frame, best_bbox)
            self.ocr_triggered_count += 1
            log.info(f"OCR triggered for track {track.track_id}")
        except Exception as e:
            log.error(f"OCR callback error: {e}", exc_info=True)
    
    def _process_frames(self):
        """
        Background thread: Process frames with detection, tracking, and zone checking.
        
        CRITICAL FLOW:
        1. Get raw frame
        2. Run vehicle detection
        3. Update tracker
        4. Check which vehicles are in trigger zone
        5. Trigger OCR for vehicles exiting zone
        6. Draw overlay (trigger zone + bounding boxes)
        7. Broadcast to subscribers
        """
        log.info(f"Starting frame processing for {self.config.camera_id}")
        
        while self.running:
            try:
                # Get frame from queue (blocking with timeout)
                try:
                    raw_frame, capture_time = self.raw_frame_queue.get(timeout=1.0)
                except:
                    continue
                
                self.frame_count += 1
                
                # Update FPS stats
                current_time = time.time()
                self.fps_frame_count += 1
                if current_time - self.last_fps_update >= 1.0:
                    self.fps_actual = self.fps_frame_count / (current_time - self.last_fps_update)
                    self.fps_frame_count = 0
                    self.last_fps_update = current_time
                
                # Step 1: Run vehicle detection
                detections = self._detect_vehicles(raw_frame)
                
                # Step 2: Update tracker
                tracks = self.tracker.update(detections, raw_frame, self.trigger_zone)
                
                # Step 3: Check for tracks ready for OCR processing
                # (vehicles that have exited trigger zone)
                ready_tracks = self.tracker.get_tracks_ready_for_processing()
                
                # Step 4: Trigger OCR for ready tracks
                for track in ready_tracks:
                    self._trigger_ocr_for_track(track)
                
                # Step 5: Count vehicles in zone
                in_zone_count = sum(
                    1 for track in tracks.values()
                    if track.state.value in ["ENTERING_ZONE", "IN_ZONE"]
                )
                
                # Step 6: Draw overlay
                # CRITICAL: Draw trigger zone FIRST
                frame_with_overlay = self._draw_trigger_zone_overlay(raw_frame.copy())
                
                # Draw bounding boxes and track IDs
                for track_id, track in tracks.items():
                    bbox = track.current_bbox
                    if bbox is None:
                        continue
                    
                    # Color based on state
                    if track.state.value in ["ENTERING_ZONE", "IN_ZONE"]:
                        color = (0, 255, 0)  # Green - in zone
                    elif track.state.value == "PROCESSING":
                        color = (0, 165, 255)  # Orange - processing
                    else:
                        color = (255, 255, 255)  # White - idle
                    
                    # Draw bounding box
                    cv2.rectangle(
                        frame_with_overlay,
                        (int(bbox.x1), int(bbox.y1)),
                        (int(bbox.x2), int(bbox.y2)),
                        color,
                        2
                    )
                    
                    # Draw track ID and state
                    label = f"ID:{track_id} {track.state.value}"
                    cv2.putText(
                        frame_with_overlay,
                        label,
                        (int(bbox.x1), int(bbox.y1) - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        color,
                        2
                    )
                
                # Add stats overlay
                stats_text = [
                    f"FPS: {self.fps_actual:.1f}",
                    f"Vehicles: {len(tracks)}",
                    f"In Zone: {in_zone_count}",
                    f"OCR: {self.ocr_triggered_count}"
                ]
                
                y_offset = 30
                for text in stats_text:
                    cv2.putText(
                        frame_with_overlay,
                        text,
                        (10, y_offset),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (255, 255, 255),
                        2
                    )
                    y_offset += 30
                
                # Step 7: Create processed frame object
                processed = ProcessedFrame(
                    frame=frame_with_overlay,
                    raw_frame=raw_frame,
                    timestamp=datetime.utcnow(),
                    frame_number=self.frame_count,
                    camera_id=self.config.camera_id,
                    detections=detections,
                    tracks=tracks,
                    in_zone_count=in_zone_count
                )
                
                # Step 8: Broadcast to subscribers (WebSocket/MJPEG)
                self._broadcast_frame(processed)
                
                # Add to processed queue (for retrieval)
                try:
                    self.processed_frame_queue.put_nowait(processed)
                except Full:
                    # Remove oldest frame
                    try:
                        self.processed_frame_queue.get_nowait()
                        self.processed_frame_queue.put_nowait(processed)
                    except:
                        pass
                
                self.processed_count += 1
                
            except Exception as e:
                log.error(f"Frame processing error: {e}", exc_info=True)
        
        log.info(f"Frame processing stopped for {self.config.camera_id}")
    
    def start(self):
        """Start camera stream processing"""
        if self.running:
            log.warning(f"Camera {self.config.camera_id} already running")
            return
        
        self.running = True
        
        # Start capture thread
        self.capture_thread = threading.Thread(
            target=self._capture_frames,
            name=f"Capture-{self.config.camera_id}",
            daemon=True
        )
        self.capture_thread.start()
        
        # Start processing thread
        self.process_thread = threading.Thread(
            target=self._process_frames,
            name=f"Process-{self.config.camera_id}",
            daemon=True
        )
        self.process_thread.start()
        
        log.info(f"Camera stream started: {self.config.camera_id}")
    
    def stop(self):
        """Stop camera stream processing"""
        if not self.running:
            return
        
        log.info(f"Stopping camera stream: {self.config.camera_id}")
        self.running = False
        
        # Wait for threads
        if self.capture_thread:
            self.capture_thread.join(timeout=5.0)
        if self.process_thread:
            self.process_thread.join(timeout=5.0)
        
        log.info(f"Camera stream stopped: {self.config.camera_id}")
    
    def get_latest_frame(self) -> Optional[ProcessedFrame]:
        """Get latest processed frame (non-blocking)"""
        try:
            return self.processed_frame_queue.get_nowait()
        except:
            return None
    
    def get_stats(self) -> Dict:
        """Get camera statistics"""
        return {
            "camera_id": self.config.camera_id,
            "running": self.running,
            "fps_actual": self.fps_actual,
            "fps_target": self.config.fps,
            "frames_captured": self.frame_count,
            "frames_processed": self.processed_count,
            "ocr_triggered": self.ocr_triggered_count,
            "subscribers": len(self.subscribers),
            "trigger_zone_configured": self.trigger_zone is not None
        }