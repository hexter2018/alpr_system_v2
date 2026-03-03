FROM python:3.11-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# clone deep-text-recognition-benchmark สำหรับ EasyOCR fine-tuning
RUN git clone --depth=1 \
    https://github.com/clovaai/deep-text-recognition-benchmark \
    /opt/deep-text-recognition-benchmark && \
    pip install --no-cache-dir lmdb pillow torchvision nltk natsort

COPY . /app/mlops

ENV PYTHONPATH=/app