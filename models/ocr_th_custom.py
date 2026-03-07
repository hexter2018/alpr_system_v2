"""
ocr_th_custom.py — EasyOCR user_network_directory architecture stub.

EasyOCR 1.7.x custom model loading:
  1. sys.path.insert(0, user_network_directory)   ← adds /models/ to sys.path
  2. model_pkg = importlib.import_module('ocr_th_custom')
  3. model = model_pkg.Model(input_channel, output_channel, hidden_size, num_class)

Our fine-tuned .pth was trained with DTRB TPS+ResNet+BiLSTM+Attn.
EasyOCR's generic Model class defaults to the VGG (generation1) backbone,
which does NOT match these weights.  We must explicitly build the generation2
(ResNet) model.

WHY NOT easyocr.model.Model
----------------------------
easyocr.model.Model is the generation1 VGG model.  Importing it here causes
a state_dict mismatch: the .pth has ResNet keys (ConvNet.conv0_1, layer1…)
but the VGG model expects flat sequential keys (ConvNet.0, ConvNet.3…).

CORRECT APPROACH
----------------
Build the model directly using DTRB's model.py from
/opt/deep-text-recognition-benchmark, which is the same code used during
fine-tuning.  This is the only guaranteed-correct architecture match.

Fallback chain:
  1. DTRB model.py            — the canonical source (always correct)
  2. easyocr.model.STRModel   — EasyOCR 1.7.x generation2 wrapper (if present)
  3. easyocr.model.Model      — last resort; may mismatch for older easyocr builds
"""

import os
import sys

# ── Primary: DTRB model.py ────────────────────────────────────────────────────
# This is the exact code used during fine-tuning so the architecture is
# guaranteed to match the saved weights.
_DTRB = os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark")
if _DTRB not in sys.path:
    sys.path.insert(0, _DTRB)

try:
    from model import Model  # DTRB model.py  (TPS+ResNet+BiLSTM+Attn)
except ImportError:
    # ── Fallback 1: EasyOCR generation2 STRModel ─────────────────────────────
    # Present in some easyocr builds as easyocr.model.STRModel
    try:
        from easyocr.model import STRModel as Model  # type: ignore
    except ImportError:
        # ── Fallback 2: easyocr.model.Model ──────────────────────────────────
        # WARNING: this is the VGG generation1 model and will raise a
        # state_dict mismatch at load time if the .pth uses ResNet weights.
        # Only reaches here if DTRB is not cloned and easyocr has no STRModel.
        from easyocr.model import Model  # type: ignore

__all__ = ["Model"]