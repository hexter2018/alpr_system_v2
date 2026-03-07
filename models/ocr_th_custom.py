"""
ocr_th_custom.py — EasyOCR user_network_directory architecture stub.

EasyOCR 1.7.x custom model loading (recognition.py ~line 160-182):
  1. sys.path.insert(0, user_network_directory)   <- /models/ added to sys.path
  2. model_pkg = importlib.import_module('ocr_th_custom')
  3. model = model_pkg.Model(input_channel, output_channel, hidden_size, num_class)
  4. model.load_state_dict(torch.load(model_path, ...))

WHY A WRAPPER CLASS IS NEEDED
------------------------------
EasyOCR calls Model(input_channel, output_channel, hidden_size, num_class) with
four positional integers.

DTRB's model.py defines Model(opt) where opt is a Namespace object with
attributes: Transformation, FeatureExtraction, SequenceModeling, Prediction,
input_channel, output_channel, hidden_size, num_class.

These signatures are incompatible.  This file provides a thin Model class that:
  1. Accepts EasyOCR's (input_channel, output_channel, hidden_size, num_class) call
  2. Builds a synthetic opt Namespace with the correct DTRB architecture flags
  3. Delegates to DTRB's Model(opt) internally

ARCHITECTURE (must match the fine-tuned .pth exactly)
------------------------------------------------------
  Transformation    = TPS
  FeatureExtraction = ResNet
  SequenceModeling  = BiLSTM
  Prediction        = Attn

These match the flags used in finetune_easyocr.py:
  --Transformation TPS --FeatureExtraction ResNet
  --SequenceModeling BiLSTM --Prediction Attn
"""

import os
import sys
import types

import torch.nn as nn

# Ensure DTRB is on sys.path
_DTRB = os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark")
if _DTRB not in sys.path:
    sys.path.insert(0, _DTRB)


def _make_opt(input_channel: int, output_channel: int,
              hidden_size: int, num_class: int) -> types.SimpleNamespace:
    """Build a minimal DTRB opt Namespace from EasyOCR's four positional args."""
    opt = types.SimpleNamespace()
    # Architecture flags — must match finetune_easyocr.py training command
    opt.Transformation    = "TPS"
    opt.FeatureExtraction = "ResNet"
    opt.SequenceModeling  = "BiLSTM"
    opt.Prediction        = "Attn"
    # Numeric params passed in by EasyOCR from the YAML network_params
    opt.input_channel  = input_channel
    opt.output_channel = output_channel
    opt.hidden_size    = hidden_size
    opt.num_class      = num_class
    # TPS spatial transformer params (DTRB defaults, match EasyOCR Thai model)
    opt.num_fiducial = 20
    opt.imgH = 32
    opt.imgW = 100
    return opt


class Model(nn.Module):
    """
    Adapter: bridges EasyOCR's 4-arg call convention to DTRB's opt-based Model.

    EasyOCR calls:  Model(input_channel, output_channel, hidden_size, num_class)
    DTRB expects:   Model(opt)  where opt is a Namespace with architecture flags

    The inner _model is a genuine DTRB Model(opt) so its state_dict keys match
    the fine-tuned .pth checkpoint exactly.
    """

    def __init__(self, input_channel: int, output_channel: int,
                 hidden_size: int, num_class: int):
        super().__init__()
        opt = _make_opt(input_channel, output_channel, hidden_size, num_class)
        try:
            from model import Model as _DTRBModel  # noqa: PLC0415
        except ImportError as exc:
            raise ImportError(
                f"Cannot import DTRB model.py from {_DTRB!r}. "
                "Ensure DTRB_DIR env var is correct and the repo is cloned there. "
                "In the mlops container this is /opt/deep-text-recognition-benchmark."
            ) from exc
        self._inner = _DTRBModel(opt)

    def forward(self, *args, **kwargs):
        return self._inner(*args, **kwargs)

    # EasyOCR calls load_state_dict directly on the object returned by Model().
    # Delegate to the inner DTRB model so key names align with the checkpoint.
    def load_state_dict(self, state_dict, strict: bool = True):
        return self._inner.load_state_dict(state_dict, strict=strict)

    def state_dict(self, *args, **kwargs):
        return self._inner.state_dict(*args, **kwargs)


__all__ = ["Model"]