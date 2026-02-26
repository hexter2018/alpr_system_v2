from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, and_, func
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db import models
from app.schemas.search import SearchResultOut, SearchFilters
from app.services.storage import make_image_url

router = APIRouter()

@router.get("/search/plates", response_model=List[SearchResultOut])
def search_plates(
    q: Optional[str] = Query(None, description="Plate number (partial match)"),
    camera_id: Optional[str] = Query(None),
    province: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0),
    status: Optional[str] = Query(None),  # PENDING, VERIFIED
    watchlist_only: bool = Query(False),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    """
    Advanced search for license plate reads with comprehensive filtering.
    
    Filters:
    - q: Plate number (partial match on plate_text or plate_text_norm)
    - camera_id: Filter by camera
    - province: Filter by province
    - start_date/end_date: Date range filter
    - min_confidence: Minimum OCR confidence
    - status: PENDING or VERIFIED
    - watchlist_only: Only show plates on watchlist
    """
    
    # Build query with joins
    query = db.query(models.PlateRead).join(
        models.Detection, models.PlateRead.detection_id == models.Detection.id
    ).join(
        models.Capture, models.Detection.capture_id == models.Capture.id
    )
    
    # Apply filters
    filters = []
    
    if q and q.strip():
        search_term = f"%{q.strip()}%"
        filters.append(
            or_(
                models.PlateRead.plate_text.ilike(search_term),
                models.PlateRead.plate_text_norm.ilike(search_term)
            )
        )
    
    if camera_id:
        filters.append(models.Capture.camera_id == camera_id)
    
    if province:
        filters.append(models.PlateRead.province.ilike(f"%{province}%"))
    
    if start_date:
        filters.append(models.PlateRead.created_at >= start_date)
    
    if end_date:
        filters.append(models.PlateRead.created_at <= end_date)
    
    if min_confidence is not None:
        filters.append(models.PlateRead.confidence >= min_confidence)
    
    if status:
        status_enum = models.ReadStatus[status.upper()]
        filters.append(models.PlateRead.status == status_enum)
    
    if watchlist_only:
        # Join with watchlist through alerts
        query = query.join(
            models.Alert, models.PlateRead.id == models.Alert.read_id
        )
    
    # Apply all filters
    if filters:
        query = query.filter(and_(*filters))
    
    # Get total count before pagination
    total_count = query.count()
    
    # Order by most recent first
    query = query.order_by(desc(models.PlateRead.created_at))
    
    # Pagination
    results = query.offset(offset).limit(limit).all()
    
    # Build response
    output = []
    for read in results:
        detection = read.detection
        capture = detection.capture if detection else None
        
        # Check if on watchlist
        on_watchlist = db.query(models.Alert).filter(
            models.Alert.read_id == read.id
        ).first() is not None
        
        # Get watchlist info if applicable
        watchlist_info = None
        if on_watchlist:
            alert = db.query(models.Alert).join(
                models.Watchlist
            ).filter(
                models.Alert.read_id == read.id
            ).first()
            
            if alert and alert.watchlist:
                watchlist_info = {
                    "list_type": alert.watchlist.list_type.value,
                    "alert_level": alert.alert_level,
                    "reason": alert.watchlist.reason
                }
        
        output.append(SearchResultOut(
            id=read.id,
            plate_text=read.plate_text,
            plate_text_norm=read.plate_text_norm,
            province=read.province,
            confidence=read.confidence,
            status=read.status.value,
            created_at=read.created_at,
            camera_id=capture.camera_id if capture else None,
            camera_name="",  # Populated below if needed
            original_url=make_image_url(capture.original_path) if capture else "",
            crop_url=make_image_url(detection.crop_path) if detection else "",
            bbox=detection.bbox if detection else "",
            on_watchlist=on_watchlist,
            watchlist_info=watchlist_info
        ))
    
    # Enrich with camera names
    if output:
        camera_ids = [r.camera_id for r in output if r.camera_id]
        if camera_ids:
            cameras = db.query(models.Camera).filter(
                models.Camera.camera_id.in_(camera_ids)
            ).all()
            camera_map = {c.camera_id: c.name for c in cameras}
            
            for result in output:
                if result.camera_id:
                    result.camera_name = camera_map.get(result.camera_id, "")
    
    # Add pagination metadata to response headers (you could also return in body)
    return output

@router.get("/search/evidence/{read_id}")
def get_evidence_details(read_id: int, db: Session = Depends(get_db)):
    """Get complete evidence details for a plate read including all images and metadata"""
    read = db.query(models.PlateRead).filter(
        models.PlateRead.id == read_id
    ).first()
    
    if not read:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Read not found")
    
    detection = read.detection
    capture = detection.capture if detection else None
    
    # Get verification info if available
    verification = read.verification
    verification_info = None
    if verification:
        verification_info = {
            "verified_at": verification.verified_at.isoformat() if verification.verified_at else None,
            "result_type": verification.result_type.value if verification.result_type else None,
            "corrected_text": verification.corrected_text,
            "corrected_province": verification.corrected_province,
            "assigned_to": verification.assigned_to,
            "note": verification.note
        }
    
    # Get watchlist/alert info
    alerts = db.query(models.Alert).join(
        models.Watchlist
    ).filter(
        models.Alert.read_id == read_id
    ).all()
    
    alert_info = []
    for alert in alerts:
        alert_info.append({
            "alert_id": alert.id,
            "list_type": alert.watchlist.list_type.value,
            "alert_level": alert.alert_level,
            "reason": alert.watchlist.reason,
            "acknowledged": alert.acknowledged,
            "acknowledged_by": alert.acknowledged_by,
            "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None
        })
    
    return {
        "read_id": read.id,
        "plate_text": read.plate_text,
        "plate_text_norm": read.plate_text_norm,
        "province": read.province,
        "confidence": read.confidence,
        "status": read.status.value,
        "created_at": read.created_at.isoformat(),
        "images": {
            "original": make_image_url(capture.original_path) if capture else "",
            "cropped_plate": make_image_url(detection.crop_path) if detection else ""
        },
        "metadata": {
            "camera_id": capture.camera_id if capture else None,
            "captured_at": capture.captured_at.isoformat() if capture else None,
            "detection_confidence": detection.det_conf if detection else 0.0,
            "bbox": detection.bbox if detection else ""
        },
        "verification": verification_info,
        "alerts": alert_info
    }