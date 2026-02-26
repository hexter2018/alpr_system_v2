from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db import models
from app.schemas.watchlist import (
    WatchlistOut, WatchlistCreateIn, WatchlistUpdateIn,
    AlertOut
)

router = APIRouter()

@router.get("/watchlist", response_model=List[WatchlistOut])
def list_watchlist(
    list_type: Optional[str] = Query(None),
    active_only: bool = Query(True),
    q: str = Query(""),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """List watchlist entries with optional filtering"""
    query = db.query(models.Watchlist)
    
    if active_only:
        query = query.filter(models.Watchlist.active == True)
    
    if list_type:
        query = query.filter(models.Watchlist.list_type == list_type.upper())
    
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.Watchlist.plate_text_norm.ilike(like),
                models.Watchlist.reason.ilike(like)
            )
        )
    
    entries = query.order_by(desc(models.Watchlist.created_at)).limit(limit).all()
    return [WatchlistOut.model_validate(e) for e in entries]

@router.get("/watchlist/{watchlist_id}", response_model=WatchlistOut)
def get_watchlist_entry(watchlist_id: int, db: Session = Depends(get_db)):
    """Get watchlist entry by ID"""
    entry = db.query(models.Watchlist).filter(
        models.Watchlist.id == watchlist_id
    ).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    
    return WatchlistOut.model_validate(entry)

@router.post("/watchlist", response_model=WatchlistOut)
def create_watchlist_entry(
    payload: WatchlistCreateIn,
    db: Session = Depends(get_db)
):
    """Add a plate to watchlist (blacklist or whitelist)"""
    # Check if already exists and is active
    existing = db.query(models.Watchlist).filter(
        models.Watchlist.plate_text_norm == payload.plate_text_norm,
        models.Watchlist.list_type == payload.list_type,
        models.Watchlist.active == True
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Plate '{payload.plate_text_norm}' already exists in {payload.list_type}"
        )
    
    entry = models.Watchlist(
        plate_text_norm=payload.plate_text_norm,
        list_type=payload.list_type,
        reason=payload.reason,
        alert_level=payload.alert_level,
        created_by=payload.created_by,
        expires_at=payload.expires_at,
        active=True
    )
    
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    return WatchlistOut.model_validate(entry)

@router.put("/watchlist/{watchlist_id}", response_model=WatchlistOut)
def update_watchlist_entry(
    watchlist_id: int,
    payload: WatchlistUpdateIn,
    db: Session = Depends(get_db)
):
    """Update watchlist entry"""
    entry = db.query(models.Watchlist).filter(
        models.Watchlist.id == watchlist_id
    ).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    
    if payload.reason is not None:
        entry.reason = payload.reason
    if payload.alert_level is not None:
        entry.alert_level = payload.alert_level
    if payload.expires_at is not None:
        entry.expires_at = payload.expires_at
    if payload.active is not None:
        entry.active = payload.active
    
    db.commit()
    db.refresh(entry)
    
    return WatchlistOut.model_validate(entry)

@router.delete("/watchlist/{watchlist_id}")
def delete_watchlist_entry(watchlist_id: int, db: Session = Depends(get_db)):
    """Deactivate (soft delete) a watchlist entry"""
    entry = db.query(models.Watchlist).filter(
        models.Watchlist.id == watchlist_id
    ).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    
    entry.active = False
    db.commit()
    
    return {"ok": True, "watchlist_id": watchlist_id}

@router.get("/alerts", response_model=List[AlertOut])
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

@router.patch("/alerts/{alert_id}/acknowledge")
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