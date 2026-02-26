from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db import models
from app.schemas.watchlist import AlertOut

router = APIRouter()

@router.get("/", response_model=List[AlertOut])
def list_alerts(
    acknowledged: Optional[bool] = Query(None),
    camera_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """List alerts triggered by watchlist matches"""
    query = db.query(models.Alert).join(
        models.PlateRead, models.Alert.read_id == models.PlateRead.id
    ).join(
        models.Detection, models.PlateRead.detection_id == models.Detection.id
    ).join(
        models.Capture, models.Detection.capture_id == models.Capture.id
    )
    
    if acknowledged is not None:
        query = query.filter(models.Alert.acknowledged == acknowledged)
    
    if camera_id:
        query = query.filter(models.Alert.camera_id == camera_id)
    
    alerts = query.order_by(desc(models.Alert.created_at)).limit(limit).all()
    
    # Enrich with plate read info
    results = []
    for alert in alerts:
        plate_read = alert.read
        results.append(AlertOut(
            id=alert.id,
            read_id=alert.read_id,
            watchlist_id=alert.watchlist_id,
            camera_id=alert.camera_id,
            alert_level=alert.alert_level,
            acknowledged=alert.acknowledged,
            acknowledged_by=alert.acknowledged_by,
            acknowledged_at=alert.acknowledged_at,
            created_at=alert.created_at,
            plate_text=plate_read.plate_text if plate_read else "",
            plate_text_norm=plate_read.plate_text_norm if plate_read else "",
            confidence=plate_read.confidence if plate_read else 0.0,
        ))
    
    return results

@router.patch("/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    acknowledged_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Acknowledge an alert"""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.acknowledged = True
    alert.acknowledged_by = acknowledged_by
    alert.acknowledged_at = datetime.utcnow()
    
    db.commit()
    
    return {"ok": True, "alert_id": alert_id}