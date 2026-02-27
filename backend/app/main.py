# backend/app/main.py
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

# ✅ เพิ่ม lifespan event
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown events for the application.
    """
    # Startup
    print("[STARTUP] Initializing Camera Pool...")
    
    # Initialize camera pool
    storage_dir = Path(settings.storage_dir)
    model_path = os.getenv("MODEL_PATH", "/models/best.pt")
    
    pool = get_camera_pool(
        storage_dir=storage_dir,
        detector_model_path=model_path,
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
    
    yield  # Application runs
    
    # Shutdown
    print("[SHUTDOWN] Stopping all cameras...")
    pool.stop_all()
    print("[SHUTDOWN] Camera Pool stopped")

# ✅ เปลี่ยนจาก app = FastAPI() เป็น
app = FastAPI(
    title="Thai ALPR API", 
    version="2.0.0",
    lifespan=lifespan  # ← เพิ่มบรรทัดนี้
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include main API router (รวม cameras, watchlist, health, search อยู่แล้ว)
app.include_router(api_router, prefix="/api")

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/health")
def health():
    return {"ok": True}