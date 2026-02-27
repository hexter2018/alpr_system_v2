"""
Camera Manager with RTSP Reconnect Logic - FIXED VERSION
แก้ไขปัญหา:
1. เพิ่ม retry logic พร้อม exponential backoff
2. เพิ่ม connection timeout และ verification
3. เพิ่ม error handling ที่ครบถ้วน
4. ป้องกัน memory leak จาก failed connections
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
    trigger_zone: Optional[Dict] = None
    enabled: bool = True


@dataclass
class ProcessedFrame:
    """Frame with overlay and metadata"""
    frame: np.ndarray
    raw_frame: np.ndarray
    timestamp: datetime
    frame_number: int
    camera_id: str
    detections: List[Tuple[BBox, float]]
    tracks: Dict[int, VehicleTrack]
    in_zone_count: int


class CameraStreamManager:
    """
    ✅ FIXED: Camera stream manager with robust RTSP reconnection
    
    Key improvements:
    - Auto-reconnect with exponential backoff
    - Connection verification with timeout
    - Proper cleanup on errors
    - Consecutive failure tracking
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
        
        # Subscribers
        self.subscribers: List[Callable[[ProcessedFrame], None]] = []
        self.subscriber_lock = threading.Lock()
        
        # Initialize detector
        from ultralytics import YOLO
        import torch

        self.device = 0 if torch.cuda.is_available() else 'cpu'
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
        
        # Trigger zone
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
                    zone_type = camera.trigger_zone.get("zone_type",
                                camera.trigger_zone.get("type", "polygon"))

                    if points:
                        is_normalized = all(
                            0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0
                            for x, y in points
                        )
                        self._raw_zone_points = [(float(x), float(y)) for x, y in points]
                        self._zone_is_normalized = is_normalized
                        self._zone_type = zone_type

                        if is_normalized:
                            self.trigger_zone = None
                            log.info(
                                f"Trigger zone for {self.config.camera_id}: "
                                f"{len(points)} normalized points"
                            )
                        else:
                            self.trigger_zone = TriggerZone(
                                points=self._raw_zone_points,
                                zone_type=zone_type
                            )
                            log.info(
                                f"Loaded trigger zone for {self.config.camera_id}: "
                                f"{len(points)} pixel points"
                            )
                    else:
                        log.warning(f"No trigger zone points for {self.config.camera_id}")
                        self._raw_zone_points = []
                        self._zone_is_normalized = False
                else:
                    log.warning(f"No trigger zone configured for {self.config.camera_id}")
                    self._raw_zone_points = []
                    self._zone_is_normalized = False
            finally:
                db.close()
        except Exception as e:
            log.error(f"Failed to load trigger zone: {e}", exc_info=True)

    def _apply_trigger_zone_with_frame_size(self, frame_w: int, frame_h: int):
        """Build TriggerZone using actual frame dimensions"""
        if not getattr(self, '_zone_is_normalized', False):
            return
        if not getattr(self, '_raw_zone_points', []):
            return

        pixel_points = [
            (x * frame_w, y * frame_h)
            for x, y in self._raw_zone_points
        ]
        self.trigger_zone = TriggerZone(
            points=pixel_points,
            zone_type=getattr(self, '_zone_type', 'polygon')
        )
        self._zone_is_normalized = False
        log.info(
            f"Trigger zone applied for {self.config.camera_id} "
            f"at {frame_w}×{frame_h}"
        )
    
    # ========================================================================
    # ✅ FIXED: _capture_frames with retry logic
    # ========================================================================
    def _capture_frames(self):
        """
        ✅ FIXED: Background thread with auto-reconnect and error recovery
        
        Improvements:
        - Exponential backoff retry logic
        - Connection verification with timeout
        - Consecutive failure tracking
        - Proper resource cleanup
        """
        log.info(f"Starting frame capture for {self.config.camera_id}")

        import os
        # Set RTSP transport to TCP for better reliability
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"
        
        max_retries = 5
        retry_delay = 5.0  # seconds
        consecutive_failures = 0
        cap = None
        
        while self.running:
            try:
                # ─── Try to open/reopen camera ───
                if cap is None or not cap.isOpened():
                    log.info(f"Connecting to RTSP stream: {self.config.rtsp_url}")
                    
                    # Create VideoCapture with timeout
                    cap = cv2.VideoCapture(self.config.rtsp_url, cv2.CAP_FFMPEG)
                    
                    # Configure camera settings
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
                    cap.set(cv2.CAP_PROP_FPS, self.config.fps)
                    
                    # ✅ Verify connection with timeout
                    start_time = time.time()
                    connection_verified = False
                    
                    while (time.time() - start_time) < 10.0:  # 10 second timeout
                        if cap.isOpened():
                            ret, test_frame = cap.read()
                            if ret and test_frame is not None:
                                log.info(
                                    f"✅ Successfully connected to {self.config.camera_id} "
                                    f"(resolution: {test_frame.shape[1]}x{test_frame.shape[0]})"
                                )
                                consecutive_failures = 0
                                connection_verified = True
                                break
                        time.sleep(0.1)
                    
                    if not connection_verified:
                        raise Exception("Connection timeout - camera did not respond within 10s")
                
                # ─── Frame capture loop ───
                target_interval = 1.0 / self.config.fps
                last_capture_time = time.time()
                
                while self.running and cap.isOpened():
                    current_time = time.time()
                    
                    # Rate limiting
                    if current_time - last_capture_time < target_interval:
                        time.sleep(0.001)
                        continue
                    
                    ret, frame = cap.read()
                    
                    if not ret or frame is None:
                        consecutive_failures += 1
                        log.warning(
                            f"Failed to read frame from {self.config.camera_id} "
                            f"(consecutive failures: {consecutive_failures})"
                        )
                        
                        # ✅ Reconnect if too many failures
                        if consecutive_failures >= 10:
                            log.error(f"❌ Too many consecutive failures, forcing reconnect...")
                            raise Exception("Stream connection lost")
                        
                        time.sleep(0.1)
                        continue
                    
                    # ✅ Reset failure counter on successful read
                    consecutive_failures = 0
                    
                    # Try to add to queue (non-blocking)
                    try:
                        self.raw_frame_queue.put_nowait((frame.copy(), current_time))
                        last_capture_time = current_time
                    except Full:
                        # Queue full, skip frame
                        pass
                
            except Exception as e:
                log.error(f"❌ RTSP capture error for {self.config.camera_id}: {e}")
                
                # ✅ Cleanup old connection
                if cap is not None:
                    try:
                        cap.release()
                    except:
                        pass
                    cap = None
                
                # ✅ Retry logic with exponential backoff
                if self.running:
                    retry_count = min(consecutive_failures, max_retries)
                    wait_time = retry_delay * (2 ** min(retry_count, 3))  # Max 40s
                    log.info(
                        f"🔄 Retrying connection in {wait_time:.1f}s... "
                        f"(attempt {retry_count + 1}/{max_retries})"
                    )
                    time.sleep(wait_time)
                    consecutive_failures += 1
        
        # ✅ Final cleanup
        if cap is not None:
            try:
                cap.release()
            except:
                pass
        log.info(f"Frame capture stopped for {self.config.camera_id}")
    
    # ========================================================================
    # อันนี้ไม่ต้องแก้ - เหมือนเดิม
    # ========================================================================
    def reload_trigger_zone(self):
        """Reload trigger zone from database"""
        self._load_trigger_zone()
    
    def set_ocr_callback(self, callback: Callable[[VehicleTrack, np.ndarray, BBox], None]):
        """Set callback for OCR processing"""
        self.ocr_callback = callback
    
    def subscribe(self, callback: Callable[[ProcessedFrame], None]):
        """Subscribe to processed frames"""
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
    
    def _draw_trigger_zone_overlay(self, frame: np.ndarray) -> np.ndarray:
        """Draw trigger zone overlay on frame"""
        if not self.trigger_zone:
            return frame
        
        overlay = frame.copy()
        points = self.trigger_zone.points.astype(np.int32)
        
        cv2.fillPoly(overlay, [points], color=(0, 255, 0))
        frame_with_overlay = cv2.addWeighted(frame, 0.8, overlay, 0.2, 0)
        cv2.polylines(frame_with_overlay, [points], isClosed=True, 
                     color=(0, 255, 0), thickness=3)
        
        text = "TRIGGER ZONE"
        font = cv2.FONT_HERSHEY_SIMPLEX
        text_size = cv2.getTextSize(text, font, 0.7, 2)[0]
        
        if len(points) > 0:
            text_x = int(points[:, 0].min())
            text_y = int(points[:, 1].min()) - 10
            
            cv2.rectangle(
                frame_with_overlay,
                (text_x - 5, text_y - text_size[1] - 5),
                (text_x + text_size[0] + 5, text_y + 5),
                (0, 255, 0),
                -1
            )
            
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
                classes=[2, 3, 5, 7],
                verbose=False,
                device=0,
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
        """Trigger OCR processing for vehicle track"""
        if not self.ocr_callback:
            log.warning("No OCR callback set, skipping processing")
            return
        
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
        """Background thread: Process frames with detection and tracking"""
        log.info(f"Starting frame processing for {self.config.camera_id}")
        
        while self.running:
            try:
                try:
                    raw_frame, capture_time = self.raw_frame_queue.get(timeout=1.0)
                except:
                    continue
                
                self.frame_count += 1
                
                if self.frame_count == 1 or (
                    self.trigger_zone is None and getattr(self, '_zone_is_normalized', False)
                ):
                    h, w = raw_frame.shape[:2]
                    self._apply_trigger_zone_with_frame_size(w, h)

                current_time = time.time()
                self.fps_frame_count += 1
                if current_time - self.last_fps_update >= 1.0:
                    self.fps_actual = self.fps_frame_count / (current_time - self.last_fps_update)
                    self.fps_frame_count = 0
                    self.last_fps_update = current_time
                
                detections = self._detect_vehicles(raw_frame)
                tracks = self.tracker.update(detections, raw_frame, self.trigger_zone)
                ready_tracks = self.tracker.get_tracks_ready_for_processing()
                
                for track in ready_tracks:
                    self._trigger_ocr_for_track(track)
                
                in_zone_count = sum(
                    1 for track in tracks.values()
                    if track.state.value in ["ENTERING_ZONE", "IN_ZONE"]
                )
                
                frame_with_overlay = self._draw_trigger_zone_overlay(raw_frame.copy())
                
                for track_id, track in tracks.items():
                    bbox = track.current_bbox
                    if bbox is None:
                        continue
                    
                    if track.state.value in ["ENTERING_ZONE", "IN_ZONE"]:
                        color = (0, 255, 0)
                    elif track.state.value == "PROCESSING":
                        color = (0, 165, 255)
                    else:
                        color = (255, 255, 255)
                    
                    cv2.rectangle(
                        frame_with_overlay,
                        (int(bbox.x1), int(bbox.y1)),
                        (int(bbox.x2), int(bbox.y2)),
                        color,
                        2
                    )
                    
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
                
                self._broadcast_frame(processed)
                
                try:
                    self.processed_frame_queue.put_nowait(processed)
                except Full:
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
        
        self.capture_thread = threading.Thread(
            target=self._capture_frames,
            name=f"Capture-{self.config.camera_id}",
            daemon=True
        )
        self.capture_thread.start()
        
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
        
        if self.capture_thread:
            self.capture_thread.join(timeout=5.0)
        if self.process_thread:
            self.process_thread.join(timeout=5.0)
        
        log.info(f"Camera stream stopped: {self.config.camera_id}")
    
    def get_latest_frame(self) -> Optional[ProcessedFrame]:
        """Get latest processed frame"""
        latest = None
        while True:
            try:
                latest = self.processed_frame_queue.get_nowait()
            except Exception:
                break
        if latest is not None:
            self._last_frame: Optional[ProcessedFrame] = latest
        return getattr(self, '_last_frame', None)
    
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