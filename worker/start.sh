#!/usr/bin/env bash
# worker/start.sh  (MODIFIED — เพิ่ม sentinel watcher ด้านล่าง)
# ====================================================================
# ⚠️  เพิ่มเฉพาะส่วน "Sentinel watcher" ด้านล่าง
#     โค้ดส่วนบนทั้งหมดเหมือนเดิม ไม่แก้ core logic
# ====================================================================
set -euo pipefail

export PYTHONPATH=/app

echo "[worker] python:" && python -V

# Auto build/select engine per GPU (if GPU available)
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "[worker] NVIDIA GPU detected. Ensuring TensorRT engine..."
  python /app/bin/ensure_engine.py || {
    echo "[worker] WARNING: Engine build failed, will attempt fallback"
  }

  if [[ -f /models/.model_path ]]; then
    _CANDIDATE="$(cat /models/.model_path)"
    if [[ -f "$_CANDIDATE" ]]; then
      export MODEL_PATH="$_CANDIDATE"
      echo "[worker] MODEL_PATH set to: $MODEL_PATH"
    else
      echo "[worker] WARNING: .model_path points to missing file: $_CANDIDATE — ignoring stale pointer"
      rm -f /models/.model_path
    fi
  fi

  # If MODEL_PATH is still unset (engine build failed or .model_path was stale), use fallbacks:
  if [[ -z "${MODEL_PATH:-}" ]]; then
    echo "[worker] No .model_path file, checking for fallback models..."
    if [[ -f /models/best.engine ]]; then
      export MODEL_PATH="/models/best.engine"
      echo "[worker] MODEL_PATH set to (cached engine): $MODEL_PATH"
    elif [[ -f /models/best.pt ]]; then
      export MODEL_PATH="/models/best.pt"
      echo "[worker] MODEL_PATH set to (fallback .pt): $MODEL_PATH"
    fi
  fi
else
  echo "[worker] No nvidia-smi -> running without GPU"
  if [[ -f /models/best.pt ]]; then
    export MODEL_PATH="/models/best.pt"
    echo "[worker] MODEL_PATH set to: $MODEL_PATH"
  fi
fi

if [[ -z "${MODEL_PATH:-}" ]]; then
  echo "[worker] ERROR: No model found! Checked for .engine and .pt"
  exit 1
fi

echo "[worker] starting celery..."
if [[ "${PRELOAD_MODELS:-1}" == "1" ]]; then
  echo "[worker] preloading detector and OCR models..."
  python - <<'PY'
from alpr_worker.inference.detector import PlateDetector
from alpr_worker.inference.ocr import PlateOCR

PlateDetector()
PlateOCR()
print("[worker] preload complete")
PY
fi

# ====================================================================
# ✅ NEW: Sentinel File Watcher
# ====================================================================
# Background loop: เช็คทุก 30 วินาทีว่า /models/reload.sentinel ถูก touch หรือไม่
# ถ้าใช่ → ส่ง SIGHUP ให้ Celery worker (graceful warm restart)
# Celery จะ finish งานที่กำลังทำอยู่ก่อนแล้วค่อย reload
SENTINEL_FILE="/models/reload.sentinel"
LAST_SENTINEL_TS=0

sentinel_watcher() {
  echo "[worker-sentinel] Watcher started. Watching: $SENTINEL_FILE"
  while true; do
    sleep 30
    if [[ -f "$SENTINEL_FILE" ]]; then
      CURRENT_TS=$(stat -c %Y "$SENTINEL_FILE" 2>/dev/null || echo 0)
      if [[ "$CURRENT_TS" -gt "$LAST_SENTINEL_TS" ]]; then
        LAST_SENTINEL_TS="$CURRENT_TS"
        echo "[worker-sentinel] Sentinel updated at $(date). Sending warm restart to Celery..."
        # ส่ง SIGHUP → Celery warm restart (finish current tasks then reload)
        kill -HUP "$(cat /tmp/celery_worker.pid 2>/dev/null || echo 0)" 2>/dev/null || true
        # fallback: kill -TERM แล้วให้ Docker restart policy เปิดใหม่
        # (ใช้เมื่อ SIGHUP ไม่ work กับ --pool=solo)
        if [[ "${WORKER_RESTART_ON_SENTINEL:-false}" == "true" ]]; then
          echo "[worker-sentinel] WORKER_RESTART_ON_SENTINEL=true → graceful stop for Docker to restart"
          # Remove the pidfile BEFORE terminating Celery so the next startup
          # (triggered by Docker's restart policy) does not fail with
          # "Pidfile (/tmp/celery_worker.pid) already exists".
          rm -f /tmp/celery_worker.pid
          kill -TERM "$(cat /tmp/celery_worker.pid 2>/dev/null || echo 0)" 2>/dev/null || true
        fi
      fi
    fi
  done
}

# รัน sentinel watcher เป็น background process
sentinel_watcher &
SENTINEL_WATCHER_PID=$!
echo "[worker] Sentinel watcher PID: $SENTINEL_WATCHER_PID"

# Remove any stale pidfile left over from a previous container run.
# Docker's "restart: unless-stopped" restarts the same container (preserving
# /tmp) without recreating it, so the old pidfile from a prior Celery process
# survives and causes "Pidfile already exists" on the next startup.
rm -f /tmp/celery_worker.pid

# รัน Celery worker (เก็บ PID ไว้ให้ sentinel ใช้)
celery -A alpr_worker.celery_app:celery_app worker \
  -l info \
  --pool=solo \
  -Q default,celery \
  --pidfile=/tmp/celery_worker.pid &
CELERY_PID=$!
echo "[worker] Celery worker PID: $CELERY_PID"

# รอให้ Celery จบ (จะ exit เมื่อถูก kill หรือ error)
wait $CELERY_PID
EXIT_CODE=$?

# cleanup
kill $SENTINEL_WATCHER_PID 2>/dev/null || true
echo "[worker] Celery exited with code $EXIT_CODE"
exit $EXIT_CODE