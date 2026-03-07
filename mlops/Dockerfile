FROM python:3.11-slim

ENV TZ="Asia/Bangkok"

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 git curl \
    tzdata \
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

# Patch DTRB for PyTorch 2.x compatibility:
#   torch._utils._accumulate was removed in PyTorch 2.0.
#   itertools.accumulate is an identical drop-in replacement.
RUN sed -i \
    's/from torch\._utils import _accumulate/from itertools import accumulate as _accumulate/' \
    /opt/deep-text-recognition-benchmark/dataset.py

COPY . /app/mlops

ENV PYTHONPATH=/app