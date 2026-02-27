# ✅ FIXED: Backend Dockerfile with complete FFmpeg support
# 
# การแก้ไข:
# 1. เพิ่ม FFmpeg dependencies ครบถ้วน
# 2. เพิ่ม network utilities สำหรับ debugging
# 3. ตรวจสอบ OpenCV build with FFmpeg

FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ================================================================
# ✅ FIXED: Install system dependencies with FFmpeg
# ================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build tools
    build-essential \
    libpq-dev \
    # ✅ Graphics libraries
    libglib2.0-0 \
    libxcb1 \
    libgl1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    # ✅ FFmpeg and codecs (CRITICAL for RTSP)
    ffmpeg \
    libavcodec-extra \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libavresample-dev \
    # ✅ H.264/H.265 codecs
    libx264-dev \
    libx265-dev \
    # ✅ Network tools (for debugging)
    iputils-ping \
    net-tools \
    curl \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# ================================================================
# Install Python dependencies
# ================================================================
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ================================================================
# ✅ Verify OpenCV FFmpeg support
# ================================================================
RUN python -c "import cv2; \
    print('OpenCV version:', cv2.__version__); \
    print('FFmpeg support:', cv2.getBuildInformation().find('FFMPEG') > 0); \
    assert cv2.getBuildInformation().find('FFMPEG') > 0, 'OpenCV missing FFmpeg support!'"

# ================================================================
# Copy application code
# ================================================================
COPY . /app

# ================================================================
# ✅ OPTIONAL: Test RTSP connectivity script
# ================================================================
RUN echo '#!/bin/bash\n\
echo "Testing RTSP connectivity..."\n\
python3 << EOF\n\
import cv2\n\
import sys\n\
url = sys.argv[1] if len(sys.argv) > 1 else "rtsp://test"\n\
cap = cv2.VideoCapture(url)\n\
if cap.isOpened():\n\
    print(f"✅ Successfully opened: {url}")\n\
    ret, frame = cap.read()\n\
    if ret:\n\
        print(f"✅ Frame size: {frame.shape}")\n\
    cap.release()\n\
else:\n\
    print(f"❌ Failed to open: {url}")\n\
EOF\n\
' > /app/test_rtsp.sh && chmod +x /app/test_rtsp.sh

CMD ["bash", "start.sh"]
