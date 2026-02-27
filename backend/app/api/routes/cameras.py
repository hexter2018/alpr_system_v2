from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, text
from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path
import cv2

from app.db.session import get_db
from app.db import models
from app.schemas.camera import (
    CameraOut, CameraCreateIn, CameraUpdateIn,
    CameraStatusUpdate, TriggerZoneUpdate
)

router = APIRouter()


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

    try:
        from app.services.camera_pool import get_camera_pool
        pool = get_camera_pool()
        pool.reload_trigger_zone(payload.camera_id)
    except Exception:
        pass

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
    """
    Get the latest snapshot from a camera for the trigger zone editor.

    Priority order:
    1. Live frame from a running CameraStreamManager  →  fastest / most current
    2. Most-recent Capture row stored on disk          →  fallback when offline
    3. 404 with a descriptive message
    """

    # ── 1. Try live frame from CameraPool ──────────────────────────────────
    try:
        from app.services.camera_pool import get_camera_pool
        pool = get_camera_pool()
        cam_mgr = pool.get_camera(camera_id)
        if cam_mgr is not None:
            frame_obj = cam_mgr.get_latest_frame()
            if frame_obj is not None:
                ret, buf = cv2.imencode(
                    ".jpg", frame_obj.frame,
                    [cv2.IMWRITE_JPEG_QUALITY, 90]
                )
                if ret:
                    return Response(
                        content=buf.tobytes(),
                        media_type="image/jpeg",
                        headers={"X-Snapshot-Source": "live"},
                    )
    except Exception:
        # Pool not initialised yet, or camera not in pool – fall through
        pass

    # ── 2. Fall back to the most-recent DB capture ──────────────────────────
    capture = (
        db.query(models.Capture)
        .filter(models.Capture.camera_id == camera_id)
        .order_by(desc(models.Capture.captured_at))
        .first()
    )

    if capture:
        img_path = Path(capture.original_path)
        if img_path.exists():
            img = cv2.imread(str(img_path))
            if img is not None:
                ret, buf = cv2.imencode(
                    ".jpg", img,
                    [cv2.IMWRITE_JPEG_QUALITY, 90]
                )
                if ret:
                    return Response(
                        content=buf.tobytes(),
                        media_type="image/jpeg",
                        headers={"X-Snapshot-Source": "db"},
                    )

    # ── 3. Nothing available ────────────────────────────────────────────────
    raise HTTPException(
        status_code=404,
        detail=(
            "No snapshot available for this camera. "
            "Start the camera stream or upload an image with "
            f"camera_id='{camera_id}' first."
        ),
    )