from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, text
from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path
import cv2
import time
import logging

from app.db.session import get_db
from app.db import models
from app.schemas.camera import (
    CameraOut, CameraCreateIn, CameraUpdateIn,
    CameraStatusUpdate, TriggerZoneUpdate
)

router = APIRouter()
log = logging.getLogger(__name__)


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

    # Track which fields affect the live stream (require pool restart)
    stream_changed = False

    if payload.name is not None:
        camera.name = payload.name
    if payload.rtsp_url is not None:
        if camera.rtsp_url != payload.rtsp_url:
            stream_changed = True
        camera.rtsp_url = payload.rtsp_url
    if payload.enabled is not None:
        if camera.enabled != payload.enabled:
            stream_changed = True
        camera.enabled = payload.enabled
    if payload.fps is not None:
        if camera.fps != payload.fps:
            stream_changed = True
        camera.fps = payload.fps
    if payload.trigger_zone is not None:
        camera.trigger_zone = payload.trigger_zone.model_dump() if payload.trigger_zone else None

    db.commit()
    db.refresh(camera)

    # Restart camera pool entry when stream-affecting settings change
    if stream_changed:
        try:
            from app.services.camera_pool import get_camera_pool
            pool = get_camera_pool()
            if camera.enabled:
                pool.restart_camera(camera_id)
                log.info(f"Camera pool restarted for {camera_id} after config change")
            else:
                pool.stop_camera(camera_id)
                log.info(f"Camera pool stopped for {camera_id} (disabled)")
        except Exception as e:
            log.warning(f"Could not restart camera pool for {camera_id}: {e}")

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


# ============================================================================
# ✅ FIXED: Snapshot endpoint with better fallback logic
# ============================================================================
@router.get("/{camera_id}/snapshot")
@router.head("/{camera_id}/snapshot")
def get_camera_snapshot(camera_id: str, request: Request, db: Session = Depends(get_db)):
    """
    Get the latest snapshot from a camera.

    Priority order:
    1. Live frame from camera pool (fastest, most current)
    2. Most recent capture from database (fallback when offline)
    3. Placeholder message (camera exists but no data)
    """
    
    # ✅ First, verify camera exists in database
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(
            status_code=404, 
            detail=f"Camera '{camera_id}' not found in database"
        )
    
    if request.method == "HEAD":
        return Response(status_code=200)
    
    # ── 1. Try live frame from camera pool ──
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
                    log.info(f"✅ Snapshot from live stream: {camera_id}")
                    return Response(
                        content=buf.tobytes(),
                        media_type="image/jpeg",
                        headers={
                            "X-Snapshot-Source": "live",
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            "Pragma": "no-cache",
                        },
                    )
    except Exception as e:
        log.warning(f"Failed to get live frame for {camera_id}: {e}")
        # Continue to fallback

    # ── 2. Fall back to most recent database capture ──
    try:
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
                        log.info(f"✅ Snapshot from database: {camera_id}")
                        return Response(
                            content=buf.tobytes(),
                            media_type="image/jpeg",
                            headers={
                                "X-Snapshot-Source": "db",
                                "Cache-Control": "max-age=60",
                            },
                        )
    except Exception as e:
        log.warning(f"Failed to get DB capture for {camera_id}: {e}")

    # ── 3. No snapshot available ──
    log.warning(f"❌ No snapshot available for {camera_id}")
    raise HTTPException(
        status_code=404,
        detail={
            "message": "No snapshot available for this camera",
            "camera_id": camera_id,
            "camera_status": camera.status,
            "suggestions": [
                "Ensure camera is enabled and streaming",
                "Check RTSP connection",
                "Wait for camera pool initialization"
            ]
        }
    )


# ============================================================================
# ✅ FIXED: Stream endpoint with HEAD support
# ============================================================================
@router.get("/{camera_id}/stream")
@router.head("/{camera_id}/stream")  # ✅ Support HEAD requests
async def get_camera_stream(
    camera_id: str, 
    request: Request,  # ✅ Access request to check method
    db: Session = Depends(get_db)
):
    """
    MJPEG live stream for browser viewing.
    Supports both GET (streaming) and HEAD (availability check).
    
    Returns:
    - GET: multipart/x-mixed-replace stream of JPEG frames
    - HEAD: 200 OK if stream available, 404 if not
    """
    
    # ✅ Verify camera exists
    camera = db.query(models.Camera).filter(
        models.Camera.camera_id == camera_id
    ).first()
    
    if not camera:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{camera_id}' not found"
        )
    
    # ✅ Check if camera is in pool
    try:
        from app.services.camera_pool import get_camera_pool
        pool = get_camera_pool()
        cam_mgr = pool.get_camera(camera_id)
        
        if cam_mgr is None:
            raise HTTPException(
                status_code=404, 
                detail=f"Camera '{camera_id}' stream not available. Camera may be offline or not initialized."
            )
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Camera pool error for {camera_id}: {e}")
        raise HTTPException(
            status_code=503, 
            detail="Camera pool not ready"
        )
    
    # ✅ For HEAD requests, just return success (stream is available)
    if request.method == "HEAD":
        return Response(
            status_code=200,
            headers={
                "Content-Type": "multipart/x-mixed-replace; boundary=frame",
                "Cache-Control": "no-cache",
            }
        )
    
    # ✅ For GET requests, stream the video
    def generate():
        """Generate MJPEG stream"""
        boundary = b"--frame"
        last_frame_id = None

        try:
            from app.services.camera_pool import get_camera_pool
            pool = get_camera_pool()
            cam_mgr = pool.get_camera(camera_id)
            
            if cam_mgr is None:
                log.error(f"Camera {camera_id} disappeared from pool during streaming")
                return

            while True:
                frame_obj = cam_mgr.get_latest_frame()
                
                if frame_obj is None:
                    time.sleep(0.1)
                    continue

                # Skip duplicate frames
                frame_id = id(frame_obj)
                if frame_id == last_frame_id:
                    time.sleep(0.05)
                    continue
                last_frame_id = frame_id

                # Encode frame as JPEG
                ret, buf = cv2.imencode(
                    ".jpg", frame_obj.frame,
                    [cv2.IMWRITE_JPEG_QUALITY, 75]
                )
                if not ret:
                    continue

                jpg = buf.tobytes()
                
                # Yield MJPEG part
                yield (
                    boundary + b"\r\n"
                    + b"Content-Type: image/jpeg\r\n"
                    + f"Content-Length: {len(jpg)}\r\n\r\n".encode()
                    + jpg
                    + b"\r\n"
                )
                
                # Throttle to ~10 fps
                time.sleep(0.1)

        except GeneratorExit:
            log.info(f"Client disconnected from stream: {camera_id}")
        except Exception as e:
            log.error(f"MJPEG stream error for {camera_id}: {e}", exc_info=True)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Access-Control-Allow-Origin": "*",
            "Connection": "keep-alive",
        },
    )