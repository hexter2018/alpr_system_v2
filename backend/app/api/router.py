from fastapi import APIRouter
from app.api.routes import (
    upload, 
    dashboard, 
    reads, 
    master, 
    images, 
    reports, 
    stream,
    cameras,
    watchlist,
    health,
    search,
    alerts  
)

api_router = APIRouter()

# Existing routes
api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(dashboard.router, tags=["dashboard"])
api_router.include_router(reads.router, tags=["reads"])
api_router.include_router(master.router, tags=["master"])
api_router.include_router(images.router, tags=["images"])
api_router.include_router(reports.router, tags=["reports"])
api_router.include_router(stream.router, tags=["stream"])

# NEW: Management routes
api_router.include_router(cameras.router, prefix="/cameras", tags=["cameras"])
api_router.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"]) 