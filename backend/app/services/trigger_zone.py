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
    def bottom_center(self) -> Point:
        """✅ NEW: Bottom-center point (where vehicle touches ground)"""
        return Point(
            x=(self.x1 + self.x2) / 2,
            y=self.y2  # Bottom edge
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
    ✅ FIXED: Simplified zone detection using bottom-center point
    
    Previous implementation used overlap ratio which was too strict.
    New implementation only checks if vehicle's bottom-center point
    is inside the polygon, which is more forgiving and realistic.
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
        result = cv2.pointPolygonTest(self.points, (point.x, point.y), False)
        return result >= 0  # >= 0 means inside or on boundary
    
    def get_bottom_center(self, bbox: BBox) -> Point:
        """Get bottom-center point of bounding box"""
        return bbox.bottom_center
    
    def contains_bbox(self, bbox: BBox, threshold: float = 0.0) -> bool:
        """
        ✅ FIXED: Check if vehicle's BOTTOM-CENTER point is inside zone.
        
        This is more lenient than checking full bbox overlap, which allows
        vehicles to be detected even when partially outside the zone.
        
        Args:
            bbox: Vehicle bounding box
            threshold: DEPRECATED - kept for compatibility but not used
        
        Returns:
            True if bottom-center point is inside zone
        """
        # ✅ PRIMARY CHECK: Bottom-center point (where vehicle touches ground)
        bottom_center = self.get_bottom_center(bbox)
        is_inside = self.contains_point(bottom_center)
        
        return is_inside
    
    def _compute_overlap_ratio(self, bbox: BBox) -> float:
        """
        ⚠️ DEPRECATED: No longer used for zone detection
        
        Compute what fraction of the bbox is inside the zone.
        Kept for potential future use.
        """
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
                     thickness: int = 2, fill_alpha: float = 0.2) -> np.ndarray:
        """
        ✅ ENHANCED: Draw the zone on a frame with semi-transparent fill
        
        Args:
            frame: Input frame
            color: Zone color (BGR)
            thickness: Line thickness
            fill_alpha: Transparency of fill (0=transparent, 1=opaque)
        """
        points = self.points.astype(np.int32)
        
        # Draw filled polygon (semi-transparent)
        if fill_alpha > 0:
            overlay = frame.copy()
            cv2.fillPoly(overlay, [points], color=color)
            frame = cv2.addWeighted(frame, 1 - fill_alpha, overlay, fill_alpha, 0)
        
        # Draw border
        cv2.polylines(frame, [points], isClosed=True, color=color, thickness=thickness)
        
        return frame
    
    def draw_debug_point(self, frame: np.ndarray, bbox: BBox, is_inside: bool) -> np.ndarray:
        """
        ✅ NEW: Draw debug visualization showing bottom-center point
        
        Args:
            frame: Input frame
            bbox: Vehicle bounding box
            is_inside: Whether the point is inside the zone
        """
        bottom_center = self.get_bottom_center(bbox)
        
        # Draw bottom-center point
        color = (0, 0, 255) if is_inside else (255, 255, 255)  # Red if inside, White if outside
        cv2.circle(
            frame,
            (int(bottom_center.x), int(bottom_center.y)),
            radius=8,
            color=color,
            thickness=-1  # Filled circle
        )
        
        # Draw outline for visibility
        cv2.circle(
            frame,
            (int(bottom_center.x), int(bottom_center.y)),
            radius=8,
            color=(0, 0, 0),
            thickness=2
        )
        
        # Draw line from bbox center to bottom-center
        center = bbox.center
        cv2.line(
            frame,
            (int(center.x), int(center.y)),
            (int(bottom_center.x), int(bottom_center.y)),
            color=(255, 255, 0),  # Cyan line
            thickness=2
        )
        
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
    
    def check_bbox(self, bbox: BBox, threshold: float = 0.0) -> Optional[int]:
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