from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, text
from typing import List, Optional
from datetime import datetime, timedelta

from app.db.session import get_db
from app.db import models
from app.schemas.camera import (
    CameraOut, CameraCreateIn, CameraUpdateIn, 
    CameraStatusUpdate, TriggerZoneUpdate
)

router = APIRouter()

# ✅ แก้ไขเป็น / แทน /cameras
@router.get("/", response_model=List[CameraOut])
def list_cameras(
    enabled_only: bool = Query(False),
    db: Session = Depends(get_db)
):
    """List all cameras with their current status"""
    query = db.query(models.Camera)
    if enabled_only:
        query = query.filter(models.Camera.enabled == True)
    cameras = query.order_by(desc(models.Camera.created_at)).all()
    
    # Check heartbeat status (mark offline if not seen in 30s)
    now = datetime.utcnow()
    for cam in cameras:
        if cam.last_seen and (now - cam.last_seen).total_seconds() > 30:
            if cam.status != "OFFLINE":
                cam.status = "OFFLINE"
                db.commit()
    
    return [CameraOut.model_validate(c) for c in cameras]

@router.get("/{camera_id}", response_model=CameraOut)
def get_camera(camera_id: str, db: Session = Depends(get_db)):
    """Get camera details by ID"""
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    return CameraOut.model_validate(camera)

@router.post("/", response_model=CameraOut)
def create_camera(payload: CameraCreateIn, db: Session = Depends(get_db)):
    """Create a new camera"""
    # Check if camera_id already exists
    existing = db.query(models.Camera).filter(
        models.Camera.camera_id == payload.camera_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Camera with ID '{payload.camera_id}' already exists"
        )
    
    camera = models.Camera(
        camera_id=payload.camera_id,
        name=payload.name,
        rtsp_url=payload.rtsp_url or "",
        enabled=payload.enabled,
        fps=payload.fps,
        trigger_zone=payload.trigger_zone.model_dump() if payload.trigger_zone else None,
        status="OFFLINE"
    )
    
    db.add(camera)
    db.commit()
    db.refresh(camera)
    
    return CameraOut.model_validate(camera)

@router.put("/{camera_id}", response_model=CameraOut)
def update_camera(
    camera_id: str, 
    payload: CameraUpdateIn, 
    db: Session = Depends(get_db)
):
    """Update camera configuration"""
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Update fields if provided
    if payload.name is not None:
        camera.name = payload.name
    if payload.rtsp_url is not None:
        camera.rtsp_url = payload.rtsp_url
    if payload.enabled is not None:
        camera.enabled = payload.enabled
    if payload.fps is not None:
        camera.fps = payload.fps
    if payload.trigger_zone is not None:
        camera.trigger_zone = payload.trigger_zone.model_dump() if payload.trigger_zone else None
    
    db.commit()
    db.refresh(camera)
    
    return CameraOut.model_validate(camera)

@router.patch("/{camera_id}/trigger-zone", response_model=CameraOut)
def update_trigger_zone(
    camera_id: str,
    payload: TriggerZoneUpdate,
    db: Session = Depends(get_db)
):
    """Update only the trigger zone for a camera"""
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    camera.trigger_zone = payload.trigger_zone.model_dump() if payload.trigger_zone else None
    db.commit()
    db.refresh(camera)
    
    return CameraOut.model_validate(camera)

@router.patch("/{camera_id}/status", response_model=CameraOut)
def update_camera_status(
    camera_id: str,
    payload: CameraStatusUpdate,
    db: Session = Depends(get_db)
):
    """Update camera status (used by heartbeat system)"""
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    camera.status = payload.status
    camera.last_seen = datetime.utcnow()
    
    db.commit()
    db.refresh(camera)
    
    return CameraOut.model_validate(camera)

@router.delete("/{camera_id}")
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    """Delete a camera"""
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    db.delete(camera)
    db.commit()
    
    return {"ok": True, "camera_id": camera_id}

@router.get("/{camera_id}/snapshot")
def get_camera_snapshot(camera_id: str, db: Session = Depends(get_db)):
    """Get the latest snapshot from a camera for trigger zone editor"""
    # Get the most recent capture for this camera
    capture = db.query(models.Capture).filter(
        models.Capture.camera_id == camera_id
    ).order_by(desc(models.Capture.captured_at)).first()
    
    if not capture:
        raise HTTPException(
            status_code=404, 
            detail="No snapshots available for this camera"
        )
    
    from app.services.storage import make_image_url
    
    return {
        "camera_id": camera_id,
        "image_url": make_image_url(capture.original_path),
        "captured_at": capture.captured_at.isoformat(),
        "capture_id": capture.id
    }