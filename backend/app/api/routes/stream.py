import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pathlib import Path
import json
import os

from ...services.stream_processor import StreamProcessor
from ...core.config import settings

log = logging.getLogger(__name__)
router = APIRouter()

# Global processor instance (one per worker)
_processor: StreamProcessor = None


def get_processor() -> StreamProcessor:
    """Get or create stream processor singleton"""
    global _processor
    if _processor is None:
        model_path = os.getenv("MODEL_PATH", "/models/best.pt")
        storage_dir = Path(settings.storage_dir)
        
        _processor = StreamProcessor(
            storage_dir=storage_dir,
            detector_model_path=model_path,
            detector_conf=float(os.getenv("DETECTOR_CONF", "0.35")),
            detector_iou=float(os.getenv("DETECTOR_IOU", "0.45")),
        )
        
        log.info("Stream processor initialized")
    
    return _processor


@router.websocket("/ws/stream/{session_id}")
async def websocket_stream(
    websocket: WebSocket,
    session_id: str,
    processor: StreamProcessor = Depends(get_processor)
):
    """
    WebSocket endpoint for real-time video streaming and ALPR processing.
    
    Message format from client:
    {
        "type": "frame",
        "frame_data": "<base64_encoded_image>",
        "frame_number": 123
    }
    
    or
    
    {
        "type": "set_zone",
        "points": [[x1, y1], [x2, y2], ...],
        "zone_type": "polygon"
    }
    
    Response format:
    {
        "frame_number": 123,
        "timestamp": "2026-02-26T...",
        "active_tracks": 3,
        "detections": 5,
        "processing_triggered": 1,
        "tracks": [...],
        "ocr_results": [...],
        "stats": {...}
    }
    """
    await websocket.accept()
    log.info("WebSocket connected: session_id=%s", session_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "set_zone":
                    # Configure trigger zone
                    points = message.get("points", [])
                    zone_type = message.get("zone_type", "polygon")
                    
                    processor.set_trigger_zone(
                        points=[(float(x), float(y)) for x, y in points],
                        zone_type=zone_type
                    )
                    
                    response = {
                        "type": "zone_configured",
                        "status": "ok",
                        "zone_type": zone_type,
                        "points_count": len(points)
                    }
                    await websocket.send_json(response)
                
                elif msg_type == "frame":
                    # Process video frame
                    frame_data = message.get("frame_data")
                    frame_number = message.get("frame_number", 0)
                    
                    if not frame_data:
                        await websocket.send_json({"error": "Missing frame_data"})
                        continue
                    
                    # Process frame
                    result = await processor.process_frame(
                        frame_data=frame_data,
                        session_id=session_id,
                        frame_number=frame_number
                    )
                    
                    # Send response
                    result["type"] = "tracking_result"
                    await websocket.send_json(result)
                
                else:
                    await websocket.send_json({
                        "error": f"Unknown message type: {msg_type}"
                    })
            
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
            except Exception as e:
                log.error("Error processing message: %s", e, exc_info=True)
                await websocket.send_json({"error": str(e)})
    
    except WebSocketDisconnect:
        log.info("WebSocket disconnected: session_id=%s", session_id)
    except Exception as e:
        log.error("WebSocket error: %s", e, exc_info=True)
    finally:
        # Cleanup if needed
        pass