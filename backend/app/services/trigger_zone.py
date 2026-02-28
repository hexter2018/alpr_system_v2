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
        self.zone_type = zone_type
        
        if zone_type == "rectangle" and len(points) != 2:
            raise ValueError("Rectangle zone requires exactly 2 points (top-left, bottom-right)")
        
        # For rectangle, expand to 4 corners
        if zone_type == "rectangle":
            x1, y1 = points[0]
            x2, y2 = points[1]
            raw = np.array([
                [x1, y1],  # top-left
                [x2, y1],  # top-right
                [x2, y2],  # bottom-right
                [x1, y2],  # bottom-left
            ], dtype=np.float32)
        else:
            raw = np.array(points, dtype=np.float32)
        
        # ✅ CRITICAL FIX: cv2.pointPolygonTest requires shape (N, 1, 2)
        # Passing (N, 2) causes ALL point tests to silently fail
        self.points = raw.reshape((-1, 1, 2))
    
    def contains_point(self, point: Point) -> bool:
        """Check if a point is inside the zone"""
        # ✅ FIXED: self.points is already (N, 1, 2) — correct shape for OpenCV
        result = cv2.pointPolygonTest(self.points, (float(point.x), float(point.y)), False)
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
    
    def line_crosses_zone(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> bool:
        """
        ✅ NEW: Check if line segment p1->p2 crosses the zone boundary.
        
        Used as fallback for fast-moving vehicles that may skip over the zone
        between frames without their bottom-center landing inside.
        
        Args:
            p1: Start point (x, y)
            p2: End point (x, y)
        
        Returns:
            True if the segment intersects any edge of the polygon
        """
        def _segments_intersect(a1, a2, b1, b2) -> bool:
            """Check if segment a1->a2 intersects segment b1->b2"""
            def cross(o, a, b):
                return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
            
            d1 = cross(b1, b2, a1)
            d2 = cross(b1, b2, a2)
            d3 = cross(a1, a2, b1)
            d4 = cross(a1, a2, b2)
            
            if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
               ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
                return True
            return False
        
        # Get polygon vertices as flat (N, 2) list
        pts = self.points.reshape(-1, 2)
        n = len(pts)
        
        for i in range(n):
            edge_start = (pts[i][0], pts[i][1])
            edge_end = (pts[(i + 1) % n][0], pts[(i + 1) % n][1])
            if _segments_intersect(p1, p2, edge_start, edge_end):
                return True
        
        return False
    
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
        # ✅ FIXED: reshape to (N, 1, 2) as int32 for cv2.fillPoly / cv2.polylines
        points = self.points.reshape((-1, 1, 2)).astype(np.int32)
        
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