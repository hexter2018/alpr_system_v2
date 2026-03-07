"""
ocr_th_custom.py — EasyOCR user_network_directory architecture stub.

EasyOCR 1.7.x custom model loading works like this:
  1. sys.path.insert(0, user_network_directory)   ← adds /models/ to sys.path
  2. model_pkg = importlib.import_module('ocr_th_custom')  ← imports THIS file
  3. model = model_pkg.Model(input_channel, output_channel,
                              hidden_size, num_class)

Our fine-tuned .pth was trained with DTRB TPS+ResNet+BiLSTM+Attn, which is
the SAME architecture as EasyOCR's built-in generation2 model.  We therefore
re-export EasyOCR's own Model class rather than re-implementing it.

Import fallback chain (defensive, handles different EasyOCR packaging layouts):
  1. easyocr.model.Model            — standard EasyOCR 1.7.x location
  2. easyocr.model.vgg_model.Model  — alternative sub-package layout
  3. DTRB model.Model               — fallback: import from training repo
"""

try:
    from easyocr.model import Model          # EasyOCR 1.7.x
except ImportError:
    try:
        from easyocr.model.vgg_model import Model   # alternative layout
    except ImportError:
        import os, sys as _sys
        _dtrb = os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark")
        if _dtrb not in _sys.path:
            _sys.path.insert(0, _dtrb)
        from model import Model              # DTRB's own model.py

__all__ = ["Model"]
