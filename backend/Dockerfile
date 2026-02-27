# ================================================================
# ALPR Backend Dockerfile - FIXED VERSION 2
# ================================================================
# Fixes:
# - Removed libavcodec-extra (unavailable in Ubuntu 22.04+)
# - Removed libavresample-dev (deprecated, removed in FFmpeg 5+)
# - Using libavcodec-dev instead
# - All other FFmpeg libraries intact for RTSP support
# ================================================================

FROM python:3.11-slim

WORKDIR /app

# ================================================================
# SYSTEM DEPENDENCIES - CORRECTED FOR UBUNTU 22.04
# ================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build tools
    build-essential \
    pkg-config \
    libpq-dev \
    # ✅ Graphics libraries (required for OpenCV)
    libglib2.0-0 \
    libxcb1 \
    libgl1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    # ✅ FFmpeg and codecs (CRITICAL for RTSP)
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    # ✅ H.264/H.265 codecs
    libx264-dev \
    libx265-dev \
    # ✅ Additional video codecs
    libvpx-dev \
    libopus-dev \
    # ✅ Network tools (for debugging)
    iputils-ping \
    net-tools \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ================================================================
# PYTHON DEPENDENCIES
# ================================================================
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ================================================================
# VERIFY OPENCV FFMPEG SUPPORT
# ================================================================
RUN python -c "import cv2; \
    build_info = cv2.getBuildInformation(); \
    assert 'FFMPEG' in build_info, 'OpenCV was not built with FFMPEG support'; \
    print('✅ OpenCV FFMPEG support verified')"

# ================================================================
# APPLICATION CODE
# ================================================================
COPY . .

# ================================================================
# MAKE STARTUP SCRIPT EXECUTABLE
# ================================================================
RUN chmod +x /app/start.sh

# ================================================================
# CREATE TEST SCRIPT
# ================================================================
RUN echo '#!/bin/bash\n\
echo "Testing RTSP connection to: $1"\n\
python3 << EOF\n\
import cv2\n\
import sys\n\
import os\n\
\n\
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"\n\
\n\
rtsp_url = sys.argv[1] if len(sys.argv) > 1 else "rtsp://host.docker.internal:554/stream"\n\
print(f"Attempting to connect to: {rtsp_url}")\n\
\n\
cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)\n\
if cap.isOpened():\n\
    ret, frame = cap.read()\n\
    if ret:\n\
        print(f"✅ Successfully connected! Frame shape: {frame.shape}")\n\
    else:\n\
        print("❌ Connection opened but no frames received")\n\
    cap.release()\n\
else:\n\
    print("❌ Failed to open connection")\n\
    print(f"Error details: {cv2.getBuildInformation()}")\n\
EOF\n\
' > /app/test_rtsp.sh && chmod +x /app/test_rtsp.sh

# ================================================================
# ENVIRONMENT & STARTUP
# ================================================================
ENV PYTHONUNBUFFERED=1
ENV OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp

EXPOSE 8000

# Use start.sh which handles:
# 1. Wait for PostgreSQL
# 2. Run migrations (alembic upgrade head)
# 3. Start uvicorn
CMD ["/app/start.sh"]