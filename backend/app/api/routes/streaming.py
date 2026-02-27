"""
WebSocket Streaming Endpoint
Real-time video streaming with trigger zone overlay
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.responses import StreamingResponse
import cv2
import logging
import asyncio
from typing import Optional
import numpy as np

from app.services.camera_pool import get_camera_pool
from app.services.camera_manager import ProcessedFrame

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/camera/{camera_id}/stream")
async def websocket_camera_stream(
    websocket: WebSocket,
    camera_id: str
):
    """
    WebSocket endpoint for real-time camera streaming.
    
    Sends JPEG frames with trigger zone overlay and vehicle tracking.
    """
    await websocket.accept()
    log.info(f"WebSocket connected for camera {camera_id}")
    
    # Get camera manager
    pool = get_camera_pool()
    camera = pool.get_camera(camera_id)
    
    if not camera:
        await websocket.send_json({
            "error": f"Camera {camera_id} not running"
        })
        await websocket.close()
        return
    
    # Frame queue for this websocket
    frame_queue = asyncio.Queue(maxsize=2)
    
    # Subscriber callback
    def frame_callback(frame: ProcessedFrame):
        try:
            # Non-blocking put
            if frame_queue.full():
                try:
                    frame_queue.get_nowait()
                except:
                    pass
            frame_queue.put_nowait(frame)
        except Exception as e:
            log.error(f"Frame callback error: {e}")
    
    # Subscribe to camera
    camera.subscribe(frame_callback)
    
    try:
        while True:
            # Get frame from queue (with timeout)
            try:
                frame = await asyncio.wait_for(frame_queue.get(), timeout=5.0)
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({
                    "type": "heartbeat",
                    "camera_id": camera_id
                })
                continue
            
            # Encode frame as JPEG
            ret, buffer = cv2.imencode('.jpg', frame.frame, [
                cv2.IMWRITE_JPEG_QUALITY, 80
            ])
            
            if not ret:
                continue
            
            # Send frame data
            await websocket.send_json({
                "type": "frame",
                "camera_id": camera_id,
                "frame_number": frame.frame_number,
                "timestamp": frame.timestamp.isoformat(),
                "vehicles": len(frame.tracks),
                "in_zone": frame.in_zone_count,
                "jpeg_size": len(buffer)
            })
            
            # Send JPEG data as bytes
            await websocket.send_bytes(buffer.tobytes())
            
    except WebSocketDisconnect:
        log.info(f"WebSocket disconnected for camera {camera_id}")
    except Exception as e:
        log.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        # Unsubscribe
        camera.unsubscribe(frame_callback)
        log.info(f"Unsubscribed from camera {camera_id}")


@router.get("/camera/{camera_id}/stream.mjpeg")
async def mjpeg_camera_stream(camera_id: str):
    """
    MJPEG streaming endpoint.
    
    Alternative to WebSocket for simple video viewing.
    """
    pool = get_camera_pool()
    camera = pool.get_camera(camera_id)
    
    if not camera:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id} not running")
    
    def generate_frames():
        """Generator for MJPEG stream"""
        # Frame queue
        import queue
        frame_queue = queue.Queue(maxsize=2)
        
        # Subscriber callback
        def frame_callback(frame: ProcessedFrame):
            try:
                if frame_queue.full():
                    try:
                        frame_queue.get_nowait()
                    except:
                        pass
                frame_queue.put_nowait(frame)
            except Exception as e:
                log.error(f"Frame callback error: {e}")
        
        # Subscribe
        camera.subscribe(frame_callback)
        
        try:
            while True:
                # Get frame (blocking with timeout)
                try:
                    frame = frame_queue.get(timeout=5.0)
                except queue.Empty:
                    continue
                
                # Encode as JPEG
                ret, buffer = cv2.imencode('.jpg', frame.frame, [
                    cv2.IMWRITE_JPEG_QUALITY, 80
                ])
                
                if not ret:
                    continue
                
                # Yield MJPEG frame
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' +
                    buffer.tobytes() +
                    b'\r\n'
                )
        finally:
            camera.unsubscribe(frame_callback)
    
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@router.get("/camera/{camera_id}/snapshot")
async def get_camera_snapshot(camera_id: str):
    """Get latest snapshot from camera"""
    pool = get_camera_pool()
    camera = pool.get_camera(camera_id)
    
    if not camera:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id} not running")
    
    # Get latest frame
    frame = camera.get_latest_frame()
    if not frame:
        raise HTTPException(status_code=404, detail="No frame available")
    
    # Encode as JPEG
    ret, buffer = cv2.imencode('.jpg', frame.frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to encode frame")
    
    return StreamingResponse(
        iter([buffer.tobytes()]),
        media_type="image/jpeg"
    )


@router.get("/camera/{camera_id}/stats")
async def get_camera_stats(camera_id: str):
    """Get camera statistics"""
    pool = get_camera_pool()
    camera = pool.get_camera(camera_id)
    
    if not camera:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id} not running")
    
    return camera.get_stats()


@router.post("/camera/{camera_id}/start")
async def start_camera(camera_id: str):
    """Start camera stream"""
    pool = get_camera_pool()
    success = pool.start_camera(camera_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to start camera {camera_id}")
    
    return {"ok": True, "camera_id": camera_id, "status": "started"}


@router.post("/camera/{camera_id}/stop")
async def stop_camera(camera_id: str):
    """Stop camera stream"""
    pool = get_camera_pool()
    success = pool.stop_camera(camera_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Camera {camera_id} not running")
    
    return {"ok": True, "camera_id": camera_id, "status": "stopped"}


@router.post("/camera/{camera_id}/restart")
async def restart_camera(camera_id: str):
    """Restart camera stream"""
    pool = get_camera_pool()
    success = pool.restart_camera(camera_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to restart camera {camera_id}")
    
    return {"ok": True, "camera_id": camera_id, "status": "restarted"}


@router.get("/cameras/list")
async def list_cameras():
    """List all running cameras"""
    pool = get_camera_pool()
    cameras = pool.list_cameras()
    
    return {
        "cameras": cameras,
        "count": len(cameras)
    }


@router.get("/cameras/stats")
async def get_all_camera_stats():
    """Get statistics for all cameras"""
    pool = get_camera_pool()
    return pool.get_all_stats()