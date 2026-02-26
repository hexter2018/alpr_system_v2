from typing import Tuple, List, Optional
from dataclasses import dataclass
import numpy as np
import cv2


@dataclass
class Point:
    x: float
    y: float


@dataclass
class BBox:
    """Bounding box in xyxy format"""
    x1: float
    y1: float
    x2: float
    y2: float
    
    @property
    def center(self) -> Point:
        return Point(
            x=(self.x1 + self.x2) / 2,
            y=(self.y1 + self.y2) / 2
        )
    
    @property
    def area(self) -> float:
        return (self.x2 - self.x1) * (self.y2 - self.y1)
    
    @property
    def width(self) -> float:
        return self.x2 - self.x1
    
    @property
    def height(self) -> float:
        return self.y2 - self.y1


class TriggerZone:
    """
    Defines a polygon zone for vehicle detection triggers.
    Supports both polygon and rectangle zones.
    """
    
    def __init__(self, points: List[Tuple[float, float]], zone_type: str = "polygon"):
        """
        Args:
            points: List of (x, y) coordinates defining the zone
            zone_type: "polygon" or "rectangle"
        """
        self.points = np.array(points, dtype=np.float32)
        self.zone_type = zone_type
        
        if zone_type == "rectangle" and len(points) != 2:
            raise ValueError("Rectangle zone requires exactly 2 points (top-left, bottom-right)")
        
        # For rectangle, expand to 4 corners
        if zone_type == "rectangle":
            x1, y1 = points[0]
            x2, y2 = points[1]
            self.points = np.array([
                [x1, y1],  # top-left
                [x2, y1],  # top-right
                [x2, y2],  # bottom-right
                [x1, y2],  # bottom-left
            ], dtype=np.float32)
    
    def contains_point(self, point: Point) -> bool:
        """Check if a point is inside the zone"""
        pt = np.array([[point.x, point.y]], dtype=np.float32)
        return cv2.pointPolygonTest(self.points, (point.x, point.y), False) >= 0
    
    def contains_bbox(self, bbox: BBox, threshold: float = 0.5) -> bool:
        """
        Check if a bounding box overlaps with the zone.
        
        Args:
            bbox: Vehicle bounding box
            threshold: Minimum overlap ratio (0-1) to consider as "inside"
                      0.5 = at least 50% of bbox must be in zone
        """
        # Check center point first (fast check)
        if self.contains_point(bbox.center):
            return True
        
        # For more accurate detection, check overlap ratio
        if threshold > 0:
            overlap_ratio = self._compute_overlap_ratio(bbox)
            return overlap_ratio >= threshold
        
        return False
    
    def _compute_overlap_ratio(self, bbox: BBox) -> float:
        """Compute what fraction of the bbox is inside the zone"""
        # Sample points within bbox
        x_samples = np.linspace(bbox.x1, bbox.x2, 5)
        y_samples = np.linspace(bbox.y1, bbox.y2, 5)
        
        inside_count = 0
        total_count = 0
        
        for x in x_samples:
            for y in y_samples:
                total_count += 1
                if self.contains_point(Point(x, y)):
                    inside_count += 1
        
        return inside_count / max(total_count, 1)
    
    def draw_on_frame(self, frame: np.ndarray, color: Tuple[int, int, int] = (0, 255, 0), 
                     thickness: int = 2) -> np.ndarray:
        """Draw the zone on a frame (for debugging/visualization)"""
        points = self.points.astype(np.int32)
        cv2.polylines(frame, [points], isClosed=True, color=color, thickness=thickness)
        return frame


class ZoneManager:
    """Manages multiple trigger zones"""
    
    def __init__(self):
        self.zones: List[TriggerZone] = []
    
    def add_zone(self, points: List[Tuple[float, float]], zone_type: str = "polygon") -> int:
        """Add a zone and return its ID"""
        zone = TriggerZone(points, zone_type)
        self.zones.append(zone)
        return len(self.zones) - 1
    
    def check_bbox(self, bbox: BBox, threshold: float = 0.5) -> Optional[int]:
        """
        Check if bbox is in any zone.
        Returns zone ID if found, None otherwise.
        """
        for zone_id, zone in enumerate(self.zones):
            if zone.contains_bbox(bbox, threshold):
                return zone_id
        return None
    
    def draw_all_zones(self, frame: np.ndarray) -> np.ndarray:
        """Draw all zones on frame"""
        for zone in self.zones:
            frame = zone.draw_on_frame(frame)
        return frame