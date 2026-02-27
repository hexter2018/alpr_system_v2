FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies INCLUDING FFmpeg for H.265
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libglib2.0-0 \
    libxcb1 \
    libgl1 \
    ffmpeg \
    libavcodec-extra \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libx264-dev \
    libx265-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

CMD ["bash", "start.sh"]