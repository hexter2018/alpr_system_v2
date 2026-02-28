from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import numpy as np
from collections import deque
import time
import logging

from .trigger_zone import BBox, TriggerZone

log = logging.getLogger(__name__)


class VehicleState(str, Enum):
    """State machine for vehicle tracking"""
    IDLE = "IDLE"                          # Vehicle detected but not in zone
    ENTERING_ZONE = "ENTERING_ZONE"        # Vehicle crossing zone boundary
    IN_ZONE = "IN_ZONE"                    # Vehicle fully inside zone
    PROCESSING = "PROCESSING"              # Best shot selected, waiting for OCR
    PROCESSED = "PROCESSED"                # OCR complete, result sent
    EXITING_ZONE = "EXITING_ZONE"         # Vehicle leaving zone
    EXITED = "EXITED"                      # Vehicle left zone (cleanup soon)


@dataclass
class VehicleTrack:
    """Represents a tracked vehicle with state machine"""
    track_id: int
    state: VehicleState = VehicleState.IDLE
    
    # Tracking data
    bbox_history: deque = field(default_factory=lambda: deque(maxlen=30))  # Last 30 frames
    frame_history: deque = field(default_factory=lambda: deque(maxlen=30))
    confidence_history: deque = field(default_factory=lambda: deque(maxlen=30))
    
    # Zone tracking
    frames_in_zone: int = 0
    frames_out_of_zone: int = 0
    zone_id: Optional[int] = None
    
    # ✅ NEW: Track if vehicle was born inside zone
    born_in_zone: bool = False
    
    # ✅ NEW: Track previous bottom-center for fast-vehicle line-crossing detection
    prev_bottom_center: Optional[Tuple[float, float]] = None
    
    # Best shot selection
    best_shot_frame: Optional[np.ndarray] = None
    best_shot_bbox: Optional[BBox] = None
    best_shot_score: float = 0.0
    
    # Timestamps
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    zone_entry_time: Optional[float] = None
    zone_exit_time: Optional[float] = None
    
    # Processing results
    ocr_result: Optional[dict] = None
    processing_started: bool = False
    
    def update(self, bbox: BBox, frame: np.ndarray, confidence: float):
        """Update track with new detection"""
        # ✅ Save previous bottom-center before appending new bbox
        if self.bbox_history:
            prev = self.bbox_history[-1]
            self.prev_bottom_center = ((prev.x1 + prev.x2) / 2, prev.y2)
        self.bbox_history.append(bbox)
        self.frame_history.append(frame.copy())
        self.confidence_history.append(confidence)
        self.last_seen = time.time()
    
    def get_best_shot(self) -> Tuple[Optional[np.ndarray], Optional[BBox]]:
        """
        Select best frame for OCR based on:
        1. Largest bounding box area (closest to camera)
        2. Highest detection confidence
        3. Most centered in frame
        """
        if not self.bbox_history or not self.frame_history:
            return None, None
        
        best_idx = 0
        best_score = 0.0
        
        frame_height, frame_width = self.frame_history[0].shape[:2]
        frame_center = (frame_width / 2, frame_height / 2)
        
        for idx, (bbox, conf) in enumerate(zip(self.bbox_history, self.confidence_history)):
            # Score components
            area_score = bbox.area / (frame_width * frame_height)  # Normalized area
            conf_score = conf
            
            # Distance from center (lower is better)
            center_dist = np.sqrt(
                (bbox.center.x - frame_center[0])**2 + 
                (bbox.center.y - frame_center[1])**2
            )
            max_dist = np.sqrt(frame_width**2 + frame_height**2)
            center_score = 1.0 - (center_dist / max_dist)
            
            # Combined score (weighted)
            score = (
                0.5 * area_score +      # 50% weight on size
                0.3 * conf_score +      # 30% weight on confidence
                0.2 * center_score      # 20% weight on centering
            )
            
            if score > best_score:
                best_score = score
                best_idx = idx
        
        self.best_shot_score = best_score
        self.best_shot_frame = self.frame_history[best_idx]
        self.best_shot_bbox = self.bbox_history[best_idx]
        
        return self.best_shot_frame, self.best_shot_bbox
    
    @property
    def age(self) -> float:
        """Track age in seconds"""
        return time.time() - self.first_seen
    
    @property
    def time_since_last_seen(self) -> float:
        """Time since last update in seconds"""
        return time.time() - self.last_seen
    
    @property
    def current_bbox(self) -> Optional[BBox]:
        """Most recent bounding box"""
        return self.bbox_history[-1] if self.bbox_history else None


class VehicleTracker:
    """
    ✅ FIXED: Multi-object tracker with improved state machine

    Key improvements:
    1. Relaxed zone entry detection (bottom-center point only)
    2. Handle vehicles born inside zone
    3. Better debug logging
    4. fps-aware cleanup timing (fixes tracks deleted before OCR triggered)
    """

    def __init__(
        self,
        max_disappeared: int = 30,          # Frames before removing lost track
        max_distance: float = 100.0,        # Max centroid distance for matching
        min_frames_in_zone: int = 3,        # ✅ REDUCED: from 5 to 3 frames
        min_frames_out_of_zone: int = 5,    # ✅ REDUCED: from 10 to 5 frames
        fps: float = 2.0,                   # ✅ NEW: actual camera FPS for timing
    ):
        self.next_track_id = 0
        self.tracks: Dict[int, VehicleTrack] = {}

        self.max_disappeared = max_disappeared
        self.max_distance = max_distance
        self.min_frames_in_zone = min_frames_in_zone
        self.min_frames_out_of_zone = min_frames_out_of_zone
        self.fps = max(fps, 0.1)            # ✅ Prevent division by zero

        # ✅ Pending tracks ready for OCR (collected before cleanup so cleanup can't race-delete)
        self._pending_ready_tracks: List[VehicleTrack] = []

        # ✅ DEBUG: Count zone events
        self.debug_stats = {
            "total_vehicles": 0,
            "born_in_zone": 0,
            "entered_zone": 0,
            "captured": 0
        }
    
    def update(
        self,
        detections: List[Tuple[BBox, float]],  # List of (bbox, confidence)
        frame: np.ndarray,
        zone: Optional[TriggerZone] = None
    ) -> Dict[int, VehicleTrack]:
        """
        Update tracker with new detections.
        Returns active tracks with their current states.
        """
        # ✅ Reset pending list at start of each update
        self._pending_ready_tracks = []

        # Handle empty detections
        if len(detections) == 0:
            self._handle_disappeared_tracks()
            return self.tracks
        
        # Extract centroids from detections
        detection_centroids = np.array([
            [bbox.center.x, bbox.center.y] 
            for bbox, _ in detections
        ])
        
        # Match detections to existing tracks
        if len(self.tracks) == 0:
            # Initialize new tracks
            for bbox, conf in detections:
                self._register_new_track(bbox, frame, conf, zone)
        else:
            # Get existing track centroids
            track_ids = list(self.tracks.keys())
            track_centroids = np.array([
                [self.tracks[tid].current_bbox.center.x, 
                 self.tracks[tid].current_bbox.center.y]
                for tid in track_ids
            ])
            
            # Compute distance matrix
            distances = self._compute_distances(track_centroids, detection_centroids)
            
            # Match using Hungarian algorithm (greedy for simplicity)
            matched_tracks, matched_detections = self._match_detections(
                distances, track_ids, detections
            )
            
            # Update matched tracks
            for track_id, det_idx in zip(matched_tracks, matched_detections):
                bbox, conf = detections[det_idx]
                self.tracks[track_id].update(bbox, frame, conf)
            
            # Register unmatched detections as new tracks
            unmatched_det_indices = set(range(len(detections))) - set(matched_detections)
            for det_idx in unmatched_det_indices:
                bbox, conf = detections[det_idx]
                self._register_new_track(bbox, frame, conf, zone)
        
        # Update state machine for all tracks
        # (_update_state_machine enqueues captures into _pending_ready_tracks directly)
        self._update_state_machine(zone)

        # Cleanup old tracks
        # (_cleanup_old_tracks also enqueues forced captures before removal)
        self._cleanup_old_tracks()

        return self.tracks
    
    def _register_new_track(
        self, 
        bbox: BBox, 
        frame: np.ndarray, 
        confidence: float,
        zone: Optional[TriggerZone] = None
    ):
        """
        ✅ FIXED: Create a new vehicle track and check if born in zone
        """
        track = VehicleTrack(track_id=self.next_track_id)
        track.update(bbox, frame, confidence)
        
        # ✅ NEW: Check if vehicle is born inside zone
        if zone is not None:
            in_zone = zone.contains_bbox(bbox, threshold=0.0)
            if in_zone:
                track.born_in_zone = True
                track.state = VehicleState.IN_ZONE  # Skip ENTERING, go directly to IN_ZONE
                track.frames_in_zone = 1
                track.zone_entry_time = time.time()
                self.debug_stats["born_in_zone"] += 1
                log.info(
                    f"🚗 Track {self.next_track_id} BORN IN ZONE "
                    f"(bbox: {bbox.x1:.0f},{bbox.y1:.0f},{bbox.x2:.0f},{bbox.y2:.0f})"
                )
        
        self.tracks[self.next_track_id] = track
        self.next_track_id += 1
        self.debug_stats["total_vehicles"] += 1
    
    def _compute_distances(
        self, 
        track_centroids: np.ndarray, 
        detection_centroids: np.ndarray
    ) -> np.ndarray:
        """Compute Euclidean distance matrix between tracks and detections"""
        # Pairwise distances
        distances = np.linalg.norm(
            track_centroids[:, np.newaxis] - detection_centroids[np.newaxis, :],
            axis=2
        )
        return distances
    
    def _match_detections(
        self,
        distances: np.ndarray,
        track_ids: List[int],
        detections: List[Tuple[BBox, float]]
    ) -> Tuple[List[int], List[int]]:
        """
        Greedy matching of detections to tracks.
        Returns (matched_track_ids, matched_detection_indices)
        """
        matched_tracks = []
        matched_detections = []
        
        # Greedy assignment: match smallest distances first
        while distances.size > 0:
            min_idx = np.argmin(distances)
            track_idx, det_idx = np.unravel_index(min_idx, distances.shape)
            
            if distances[track_idx, det_idx] > self.max_distance:
                break  # No more valid matches
            
            matched_tracks.append(track_ids[track_idx])
            matched_detections.append(det_idx)
            
            # Remove matched row and column
            distances = np.delete(distances, track_idx, axis=0)
            distances = np.delete(distances, det_idx, axis=1)
            track_ids = [tid for i, tid in enumerate(track_ids) if i != track_idx]
        
        return matched_tracks, matched_detections
    
    def _handle_disappeared_tracks(self):
        """Increment disappeared counter for tracks with no detections"""
        for track in self.tracks.values():
            track.frames_out_of_zone += 1

            # Auto-transition: vehicle was in zone but now gone from camera
            # Guard: processing_started ensures we enqueue EXACTLY once per track
            if (track.state == VehicleState.IN_ZONE
                    and track.frames_out_of_zone >= self.min_frames_out_of_zone
                    and not track.processing_started):
                track.state = VehicleState.PROCESSING
                track.zone_exit_time = time.time()
                track.processing_started = True          # ← one-way gate
                self.debug_stats["captured"] += 1
                self._pending_ready_tracks.append(track)
                log.info(
                    f"📸 Track {track.track_id} PROCESSING "
                    f"(auto: no detections, frames_out={track.frames_out_of_zone})"
                )
    
    def _update_state_machine(self, zone: Optional[TriggerZone]):
        """
        ✅ FIXED: Update state machine with better zone entry/exit logic
        """
        if zone is None:
            return
        
        for track in self.tracks.values():
            current_bbox = track.current_bbox
            if current_bbox is None:
                continue
            
            # ✅ CHECK: Is vehicle's bottom-center in zone?
            in_zone = zone.contains_bbox(current_bbox, threshold=0.0)
            
            # ✅ FALLBACK: Line-crossing check for fast-moving vehicles
            # Catches vehicles that jump over zone boundary between frames
            if not in_zone and track.prev_bottom_center is not None:
                curr_bc = ((current_bbox.x1 + current_bbox.x2) / 2, current_bbox.y2)
                if zone.line_crosses_zone(track.prev_bottom_center, curr_bc):
                    in_zone = True
                    log.debug(
                        f"Track {track.track_id} caught by line-crossing check "
                        f"prev={track.prev_bottom_center} curr={curr_bc}"
                    )
            
            # ✅ DEBUG: Log zone checks for young tracks
            if track.age < 2.0:  # First 2 seconds
                bottom_center = zone.get_bottom_center(current_bbox)
                log.debug(
                    f"Track {track.track_id} age={track.age:.1f}s "
                    f"state={track.state.value} in_zone={in_zone} "
                    f"bottom_center=({bottom_center.x:.0f},{bottom_center.y:.0f}) "
                    f"frames_in_zone={track.frames_in_zone}"
                )
            
            # State transitions
            if track.state == VehicleState.IDLE:
                if in_zone:
                    track.state = VehicleState.ENTERING_ZONE
                    track.frames_in_zone = 1
                    track.zone_entry_time = time.time()
                    log.info(f"🚗 Track {track.track_id} ENTERING ZONE")
            
            elif track.state == VehicleState.ENTERING_ZONE:
                if in_zone:
                    track.frames_in_zone += 1
                    if track.frames_in_zone >= self.min_frames_in_zone:
                        track.state = VehicleState.IN_ZONE
                        self.debug_stats["entered_zone"] += 1
                        log.info(
                            f"✅ Track {track.track_id} IN ZONE "
                            f"(frames={track.frames_in_zone})"
                        )
                else:
                    # False alarm, vehicle didn't fully enter
                    track.state = VehicleState.IDLE
                    track.frames_in_zone = 0
                    log.info(f"⚠️ Track {track.track_id} FALSE ENTRY (went back outside)")
            
            elif track.state == VehicleState.IN_ZONE:
                if in_zone:
                    track.frames_in_zone += 1
                    track.frames_out_of_zone = 0
                else:
                    track.frames_out_of_zone += 1
                    
                    # Trigger capture after vehicle exits zone
                    # Guard: processing_started is a one-way gate — never fires twice
                    if (track.frames_out_of_zone >= self.min_frames_out_of_zone
                            and not track.processing_started):
                        track.state = VehicleState.PROCESSING
                        track.zone_exit_time = time.time()
                        track.processing_started = True      # ← one-way gate
                        self.debug_stats["captured"] += 1
                        self._pending_ready_tracks.append(track)
                        log.info(
                            f"📸 Track {track.track_id} EXITING -> PROCESSING "
                            f"(time_in_zone={(track.zone_exit_time - track.zone_entry_time):.1f}s)"
                        )
            
            elif track.state == VehicleState.PROCESSING:
                # Waiting for OCR result
                if track.ocr_result is not None:
                    track.state = VehicleState.PROCESSED
            
            elif track.state == VehicleState.PROCESSED:
                # Mark for cleanup soon
                track.state = VehicleState.EXITED
    
    def _cleanup_old_tracks(self):
        """Remove tracks that are too old or have exited"""
        to_remove = []

        # ✅ Use actual fps to compute timeout (was hardcoded to 30 fps → too short at 2 fps)
        max_disappeared_sec = self.max_disappeared / self.fps

        for track_id, track in self.tracks.items():
            # Remove if disappeared for too long
            if track.time_since_last_seen > max_disappeared_sec:
                # Force capture for IN_ZONE tracks before deletion
                # Guard: processing_started ensures we enqueue EXACTLY once per track
                if track.state == VehicleState.IN_ZONE and not track.processing_started:
                    track.state = VehicleState.PROCESSING
                    track.zone_exit_time = time.time()
                    track.processing_started = True          # ← one-way gate
                    self.debug_stats["captured"] += 1
                    self._pending_ready_tracks.append(track)
                    log.info(
                        f"📸 Track {track_id} FORCED PROCESSING (cleanup, "
                        f"gone={track.time_since_last_seen:.1f}s)"
                    )
                to_remove.append(track_id)

            # Remove processed tracks after 5 seconds
            elif track.state == VehicleState.EXITED and track.age > 5.0:
                to_remove.append(track_id)

        for track_id in to_remove:
            del self.tracks[track_id]
    
    def get_tracks_ready_for_processing(self) -> List[VehicleTrack]:
        """
        ✅ Returns tracks collected during last update() before cleanup ran.
        This prevents a race where tracks could be deleted before OCR is triggered.
        """
        ready = list(self._pending_ready_tracks)
        self._pending_ready_tracks = []

        if ready:
            log.info(
                f"🎯 {len(ready)} tracks ready for processing "
                f"(stats: {self.debug_stats})"
            )

        return ready
    
    def get_debug_stats(self) -> Dict:
        """Get debug statistics"""
        return {
            **self.debug_stats,
            "active_tracks": len(self.tracks),
            "in_zone": sum(1 for t in self.tracks.values() if t.state.value in ["ENTERING_ZONE", "IN_ZONE"]),
            "processing": sum(1 for t in self.tracks.values() if t.state == VehicleState.PROCESSING),
        }
