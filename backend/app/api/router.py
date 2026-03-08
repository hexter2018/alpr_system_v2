from fastapi import APIRouter
from app.api.routes import (
    upload,
    dashboard,
    reads,
    master,
    images,
    reports,
    watchlist,
    search,
    monitor,
    mlops,
    auth,
)

api_router = APIRouter()

# ── Auth (public login + admin user management) ───────────────────────────────
api_router.include_router(auth.router, tags=["auth"])

# ── Core routes ───────────────────────────────────────────────────────────────
api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(dashboard.router, tags=["dashboard"])
api_router.include_router(reads.router, tags=["reads"])
api_router.include_router(master.router, tags=["master"])
api_router.include_router(images.router, tags=["images"])
api_router.include_router(reports.router, tags=["reports"])
api_router.include_router(monitor.router, tags=["monitor"])
api_router.include_router(mlops.router, tags=["mlops"])

# ── Management routes ─────────────────────────────────────────────────────────
api_router.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
