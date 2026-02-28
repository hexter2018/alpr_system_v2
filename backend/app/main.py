# backend/app/main.py
# ✅ FIXED: เพิ่ม CORS support สำหรับ WebSocket และ Streaming

import logging
import logging.config

# ✅ Configure logging so INFO messages from app.services.* appear in docker logs
logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stdout",
        }
    },
    "root": {"level": "INFO", "handlers": ["console"]},
    "loggers": {
        "uvicorn": {"level": "INFO", "propagate": True},
        "uvicorn.access": {"level": "WARNING", "propagate": True},  # Reduce access log noise
        "app": {"level": "INFO", "propagate": True},
    },
})

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
import os

from app.core.config import settings
from app.api.router import api_router
from app.services.camera_pool import get_camera_pool
from app.db.session import SessionLocal
from app.db import models

# ✅ Lifespan event
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("[STARTUP] Initializing Camera Pool...")
    
    storage_dir = Path(settings.storage_dir)

    # VEHICLE_MODEL_PATH: model used by the backend for vehicle/plate detection in the trigger zone.
    # Defaults to /models/yolov8n.pt (COCO vehicle classes 2,3,5,7).
    # Falls back to auto-download "yolov8n.pt" from ultralytics hub if file not found.
    vehicle_model_path = os.getenv("VEHICLE_MODEL_PATH", "/models/yolov8n.pt")
    if not os.path.exists(vehicle_model_path):
        vehicle_model_path = "yolov8n.pt"  # ultralytics will auto-download
        print(f"[STARTUP] {os.getenv('VEHICLE_MODEL_PATH', '/models/yolov8n.pt')} not found — will auto-download yolov8n.pt")
    else:
        print(f"[STARTUP] Using vehicle model: {vehicle_model_path}")

    pool = get_camera_pool(
        storage_dir=storage_dir,
        detector_model_path=vehicle_model_path,
        detector_conf=float(os.getenv("DETECTOR_CONF", "0.35")),
        detector_iou=float(os.getenv("DETECTOR_IOU", "0.45"))
    )
    
    # Auto-start enabled cameras
    db = SessionLocal()
    try:
        enabled_cameras = db.query(models.Camera).filter(
            models.Camera.enabled == True
        ).all()
        
        for camera in enabled_cameras:
            print(f"[STARTUP] Starting camera: {camera.camera_id}")
            pool.start_camera(camera.camera_id)
    finally:
        db.close()
    
    print(f"[STARTUP] Camera Pool initialized with {len(pool.list_cameras())} cameras")
    
    yield
    
    print("[SHUTDOWN] Stopping all cameras...")
    pool.stop_all()
    print("[SHUTDOWN] Camera Pool stopped")


# ✅ Create FastAPI app
app = FastAPI(
    title="Thai ALPR API", 
    version="2.0.0",
    lifespan=lifespan
)

# ================================================================
# ✅ FIXED: CORS Configuration
# ================================================================
# ตั้งค่า CORS ให้รองรับ WebSocket และ Streaming
app.add_middleware(
    CORSMiddleware,
    # ✅ Allow all origins for development (จำกัดใน production)
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://10.32.70.136",
        "http://10.32.70.136:5173",
        "http://10.32.70.136:3000",
        "*",  # ⚠️ ใน production ควรระบุ origin ที่ชัดเจน
    ],
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, PUT, DELETE, OPTIONS, etc.
    allow_headers=["*"],  # Accept all headers
    expose_headers=[
        "Content-Length",
        "Content-Range", 
        "X-Snapshot-Source",  # Custom header สำหรับ snapshot
    ],
    max_age=3600,  # Preflight cache duration
)

# ================================================================
# Include API Router
# ================================================================
app.include_router(api_router, prefix="/api")

# ================================================================
# Health Check Endpoints
# ================================================================
@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/health")
def health():
    return {"ok": True}


# ================================================================
# ✅ OPTIONAL: Debugging WebSocket connections
# ================================================================
if os.getenv("DEBUG", "false").lower() == "true":
    @app.middleware("http")
    async def log_requests(request, call_next):
        print(f"📨 {request.method} {request.url.path}")
        if "upgrade" in request.headers.get("connection", "").lower():
            print(f"  ⚡ WebSocket upgrade request detected")
            print(f"  Headers: {dict(request.headers)}")
        response = await call_next(request)
        print(f"📤 {response.status_code}")
        return response