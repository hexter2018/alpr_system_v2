FROM nvcr.io/nvidia/tensorrt:25.12-py3

WORKDIR /app

ENV TZ="Asia/Bangkok"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    libglib2.0-0 \
    libxcb1 \
    libgl1 \
    tzdata \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# ── Clone deep-text-recognition-benchmark for DTRBRecognizer inference ────────
# Only model.py + utils.py are used at runtime (no training scripts executed).
# Apply the same two patches as the mlops/trainer-worker image so the repo is
# consistent if ever re-used for fine-tuning from this container.
RUN git clone --depth=1 \
    https://github.com/clovaai/deep-text-recognition-benchmark \
    /opt/deep-text-recognition-benchmark

# Patch 1: torch._utils._accumulate removed in PyTorch 2.x → itertools.accumulate
RUN sed -i \
    's/from torch\._utils import _accumulate/from itertools import accumulate as _accumulate/' \
    /opt/deep-text-recognition-benchmark/dataset.py

# Patch 2: --sensitive flag silently replaces opt.character with ASCII-only chars;
# neutralise it so any accidental --sensitive call preserves the Thai charset.
RUN sed -i \
    's/opt\.character = string\.printable\[:-6\]/pass  # (patched) do not override opt.character/' \
    /opt/deep-text-recognition-benchmark/train.py

ENV DTRB_DIR=/opt/deep-text-recognition-benchmark
ENV PYTHONPATH=/opt/deep-text-recognition-benchmark:${PYTHONPATH}

COPY . /app
RUN chmod +x /app/start.sh /app/bin/ensure_engine.py || true

CMD ["/app/start.sh"]
