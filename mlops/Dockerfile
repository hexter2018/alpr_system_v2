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

# ── Patch 1: PyTorch 2.x compatibility ──────────────────────────────────────
# torch._utils._accumulate was removed in PyTorch 2.0.
# itertools.accumulate is an identical drop-in replacement.
RUN sed -i \
    's/from torch\._utils import _accumulate/from itertools import accumulate as _accumulate/' \
    /opt/deep-text-recognition-benchmark/dataset.py

# ── Patch 2: Preserve custom --character when --sensitive is passed ──────────
# DTRB's train.py contains this block:
#
#   if opt.sensitive:
#       opt.character = string.printable[:-6]   # 94 ASCII printable chars
#
# This unconditionally replaces opt.character with ASCII-only content,
# silently discarding every Thai character passed via --character.
# The --sensitive flag was designed for ASCII ASTER benchmarks and is
# meaningless and destructive for Thai licence-plate fine-tuning.
#
# Fix: replace the assignment with a no-op comment so the flag becomes
# harmless even if someone passes it accidentally in the future.
# We also omit --sensitive from finetune_easyocr.py's CMD as a second
# layer of defence, but this patch makes the container itself safe
# regardless of how train.py is invoked.
RUN sed -i \
    's/opt\.character = string\.printable\[:-6\].*$/# (patched) do not override opt.character — preserves custom Thai charset/' \
    /opt/deep-text-recognition-benchmark/train.py

COPY . /app/mlops

ENV PYTHONPATH=/app