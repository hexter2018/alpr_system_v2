"""
worker/alpr_worker/inference/province_classifier.py
====================================================
Thin wrapper around the YOLOv8-cls province model.

Usage
-----
    classifier = ProvinceClassifier()
    if classifier.available:
        province, confidence = classifier.predict(bottom_band_img)

The model is loaded lazily on first call to ``predict()`` and cached for
the lifetime of the process.  If the model file doesn't exist (e.g. before
the first training run) the wrapper degrades silently — ``available`` is
False and ``predict()`` returns ("", 0.0) so the calling code can fall back
to the existing fuzzy-match logic.

Environment variables
---------------------
  MODELS_DIR                    — directory containing province_classifier.pt
                                  and province_classifier_classes.txt
  PROVINCE_CLASSIFIER_CONF_MIN  — minimum top-1 confidence to accept the
                                  prediction (default: 0.45).  Below this the
                                  classifier returns "" so OCR fallback is used.
  PROVINCE_BAND_FRAC            — bottom fraction of the plate to crop before
                                  passing to the classifier.  When PlateOCR
                                  already sends a pre-cropped band this is 1.0;
                                  set to 0.30 when passing the full plate.
                                  (PlateOCR passes a pre-cropped band so this
                                  variable is informational only here.)
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger(__name__)

_MODELS_DIR    = Path(os.getenv("MODELS_DIR", "/models"))
_MODEL_PATH    = _MODELS_DIR / "province_classifier.pt"
_CLASSES_FILE  = _MODELS_DIR / "province_classifier_classes.txt"
_CONF_MIN      = float(os.getenv("PROVINCE_CLASSIFIER_CONF_MIN", "0.45"))
_NO_PROVINCE   = "NA"   # class name used during training for plates with no province


class ProvinceClassifier:
    """
    YOLOv8-cls province band classifier.

    Attributes
    ----------
    available : bool
        True when the model file exists and loaded successfully.
    num_classes : int
        Number of province classes the model was trained on.
    """

    def __init__(self) -> None:
        self._model  = None
        self._names: Optional[list[str]] = None
        self.available  = False
        self.num_classes = 0

        if not _MODEL_PATH.exists():
            log.info(
                "[ProvinceClassifier] No model at %s — province classification disabled.  "
                "Run the province training pipeline to enable it.",
                _MODEL_PATH,
            )
            return

        try:
            from ultralytics import YOLO  # type: ignore
            self._model = YOLO(str(_MODEL_PATH))

            # Build the class-name list.
            # Priority: txt manifest (written by province_retrain) >
            #           model.names dict (always available in ultralytics)
            self._names = _load_class_manifest(_CLASSES_FILE)
            if not self._names:
                raw = self._model.names  # {0: "กรุงเทพมหานคร", 1: "กระบี่", ...}
                if isinstance(raw, dict):
                    self._names = [raw[i] for i in sorted(raw.keys())]
                elif isinstance(raw, list):
                    self._names = list(raw)

            self.num_classes = len(self._names or [])
            self.available   = True

            log.info(
                "[ProvinceClassifier] Model loaded: %s  (%d classes, conf_min=%.2f)",
                _MODEL_PATH, self.num_classes, _CONF_MIN,
            )

        except Exception as exc:
            log.error(
                "[ProvinceClassifier] Failed to load model %s: %s",
                _MODEL_PATH, exc, exc_info=True,
            )
            self.available = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def predict(self, image: np.ndarray) -> tuple[str, float]:
        """
        Run the classifier on a pre-cropped province band image.

        Parameters
        ----------
        image : np.ndarray
            The province band (bottom ~30 % of the plate crop), as a BGR
            NumPy array.  The image does NOT need to be resized — YOLO
            handles that internally via the ``imgsz`` it was trained with.

        Returns
        -------
        (province_name, confidence)
            ``province_name`` is the canonical Thai province string from
            ``THAI_PROVINCES`` (or "" when confidence is below threshold
            or the predicted class is ``NA``).
            ``confidence`` is the raw top-1 softmax probability [0, 1].
        """
        if not self.available or self._model is None:
            return "", 0.0

        if image is None or image.size == 0:
            return "", 0.0

        try:
            results = self._model(image, verbose=False)
        except Exception as exc:
            log.warning("[ProvinceClassifier] Inference error: %s", exc)
            return "", 0.0

        if not results:
            return "", 0.0

        probs = results[0].probs
        if probs is None:
            return "", 0.0

        top1_idx  = int(probs.top1)
        top1_conf = float(probs.top1conf)

        if top1_conf < _CONF_MIN:
            log.debug(
                "[ProvinceClassifier] Prediction below threshold: "
                "idx=%d conf=%.3f < %.3f",
                top1_idx, top1_conf, _CONF_MIN,
            )
            return "", top1_conf

        # Map index → name
        class_name = ""
        if self._names and 0 <= top1_idx < len(self._names):
            class_name = self._names[top1_idx]
        else:
            try:
                class_name = results[0].names.get(top1_idx, "")
            except Exception:
                pass

        # Treat NO_PROVINCE class as "no province" (military / TC / QC plates)
        if class_name == _NO_PROVINCE:
            return "", top1_conf

        return class_name, top1_conf

    def top_k(self, image: np.ndarray, k: int = 3) -> list[tuple[str, float]]:
        """
        Return the top-k predictions as [(province_name, confidence), ...].
        Useful for logging and post-processing decisions.
        """
        if not self.available or self._model is None:
            return []

        if image is None or image.size == 0:
            return []

        try:
            results = self._model(image, verbose=False)
        except Exception as exc:
            log.warning("[ProvinceClassifier] top_k inference error: %s", exc)
            return []

        if not results:
            return []

        probs = results[0].probs
        if probs is None:
            return []

        top_indices = probs.top5[:k] if hasattr(probs, "top5") else [int(probs.top1)]
        top_confs   = (
            probs.top5conf.tolist()[:k]
            if hasattr(probs, "top5conf")
            else [float(probs.top1conf)]
        )

        candidates = []
        for idx, conf in zip(top_indices, top_confs):
            if self._names and 0 <= int(idx) < len(self._names):
                name = self._names[int(idx)]
            else:
                try:
                    name = results[0].names.get(int(idx), "")
                except Exception:
                    name = ""
            if name and name != _NO_PROVINCE and conf >= _CONF_MIN:
                candidates.append((name, float(conf)))

        return candidates


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_class_manifest(path: Path) -> list[str]:
    """Read the newline-separated class list written by province_retrain."""
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        return [ln.strip() for ln in lines if ln.strip()]
    except Exception as exc:
        log.debug("[ProvinceClassifier] Could not read class manifest %s: %s", path, exc)
        return []
