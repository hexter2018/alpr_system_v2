from __future__ import annotations

import itertools
import json
import logging
import os
import re
import sys
import types
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import cv2
import easyocr
import numpy as np
import torch

from .provinces import match_province, normalize_province, province_candidates
from .province_classifier import ProvinceClassifier
from .postprocess_thai_plate import (
    load_province_prior,
    normalize_plate_text,
    rerank_plate_candidates,
    resolve_province,
)
from .validate import is_valid_plate

log = logging.getLogger(__name__)

# ── Province band split fraction ─────────────────────────────────────────────
# When the province classifier model exists, the plate image is split at this
# Y-ratio before inference:
#   top  (1 - PROVINCE_BAND_FRAC)  → EasyOCR  (plate characters / numbers)
#   bottom PROVINCE_BAND_FRAC      → YOLOv8-cls (province prediction)
# Must match the PROVINCE_BAND_FRAC used during dataset export and training.
_PROVINCE_BAND_FRAC = float(os.getenv("PROVINCE_BAND_FRAC", "0.30"))
_PLATE_TEXT_FRAC    = 1.0 - _PROVINCE_BAND_FRAC   # default 0.70

# ── Custom fine-tuned OCR model ───────────────────────────────────────────────
# The MLOps trainer deploys to /models/ocr_th_custom.pth + ocr_th_custom.yaml
# after each successful fine-tuning run.  When both files exist the workers use
# the custom model (loaded via EasyOCR's user_network_directory API); otherwise
# they fall back to the standard pretrained Thai model.
_MODELS_DIR = Path(os.getenv("MODELS_DIR", "/models"))
_CUSTOM_OCR_PTH  = _MODELS_DIR / "ocr_th_custom.pth"
_CUSTOM_OCR_YAML = _MODELS_DIR / "ocr_th_custom.yaml"

_THAI_DIGIT_MAP = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")

# ── Training vocabulary ───────────────────────────────────────────────────────
# Exact character set used to train ocr_th_custom.pth.
# MUST be 100% identical — same characters, same order — to THAI_CHARS in
# mlops/ocr_finetune/finetune_easyocr.py.
#
# WHY THIS MATTERS
# ─────────────────
# EasyOCR / DTRB Attn decoding maps each output index directly to
# self.character[index].  If the inference charset differs from the one used
# during training by even a single character or swap in order, every predicted
# index decodes to the wrong character and the model outputs complete gibberish
# (e.g. "ฌข" instead of "3337").  This constant is the single source of truth
# for inference; the YAML's character_list is validated against it at startup.
#
# UPDATE POLICY: if you change THAI_CHARS in finetune_easyocr.py you MUST
# (1) update this string to match, (2) retrain the model, (3) redeploy.
_DTRB_CHARS: str = (
    # Thai consonants (42)
    "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
    # Thai vowel marks, tone marks, and special signs (23)
    "ฤฦาิีึืุูเแโใไำ็่้๊๋์ํ๎"
    # Arabic digits (10)
    "0123456789"
    # Latin uppercase A–Z: required for TC / QC test-car plate prefixes (26)
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    # Latin lowercase a–z: DTRB filters labels via label.lower() so both
    # cases must be present in the vocabulary (26)
    "abcdefghijklmnopqrstuvwxyz"
    # Space: separator in formatted plates e.g. "TC 3337", "กข 1234" (1)
    " "
)

# ── OCR output allowlists ─────────────────────────────────────────────────────
# Both constants are derived from _DTRB_CHARS so they stay in sync with the
# training vocabulary automatically.
#
# _THAI_ALLOWLIST      — passed to reader.readtext() for plate-text OCR.
#                        Includes all 128 training chars (Thai + digits + A–Z
#                        + a–z + space).  When DTRBRecognizer is active this is
#                        a weak any-match filter; when EasyOCR is the fallback
#                        reader it constrains the output to these chars, which
#                        is important for test-car plates ("TC 3337", "QC 1234")
#                        where the previous allowlist was missing A–Z entirely.
#
# _THAI_ONLY_ALLOWLIST — passed to thai_reader.readtext() for province-band
#                        OCR.  Digits, Latin, and space are excluded since
#                        province names are Thai-only text.
_THAI_ALLOWLIST      = _DTRB_CHARS          # all 128 training chars
_THAI_ONLY_ALLOWLIST = (                    # Thai consonants + vowels only (65)
    "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
    "ฤฦาิีึืุูเแโใไำ็่้๊๋์ํ๎"
)
_THAI_CONFUSION_MAP = {
    "ผ": ("ข", "พ", "ฆ"),
    "ข": ("ฆ", "ผ", "ม"),
    "ฆ": ("ข", "ม", "ผ"), 
    "ม": ("ข", "ฆ"),
    "พ": ("ผ",),
    "ฝ": ("ฟ", "ผ"),
    "ฟ": ("ฝ",),
    "บ": ("ป",),
    "ป": ("บ",),
    "ด": ("ต",),
    "ต": ("ด",),
    "ช": ("ซ", "ฃ", "ษ", "ศ", "ข"),
    "ซ": ("ช",),
    "ฃ": ("ช",),
    "ส": ("ศ", "ษ"),
    "ศ": ("ส", "ษ", "ช"),
    "ษ": ("ส", "ศ", "ช"),
    "ค": ("ฅ", "ถ"),
    "ฅ": ("ค",),
    "ถ": ("ค", "ก"),
    "ก": ("ถ",),
    "ท": ("ธ",),
    "ธ": ("ท",),
    "ร": ("ฤ", "ล"),
    "ฤ": ("ร", "ล"),
    "ล": ("ร", "ฤ"),
    "น": ("ม",),
    "ณ": ("ฌ",),
    "ฌ": ("ณ",),
    "ฎ": ("ฏ", "ภ"),
    "ฏ": ("ฎ",),
    "ภ": ("ฎ",),
    "ย": ("ล",),
    "ฬ": ("ฮ",),
    "ฮ": ("ฬ",),
    "ซ": ("ช",),

}
_THAI_CONFUSION_PENALTY_REDUCTION = {
    ("ข", "ฆ"): 0.04,
    ("ฆ", "ข"): 0.04,
    ("ข", "ม"): 0.03,
    ("ม", "ข"): 0.03,
    ("ฆ", "ม"): 0.03,
    ("ม", "ฆ"): 0.03,
    ("ผ", "ฆ"): 0.08,
    ("ฆ", "ผ"): 0.08,
    ("ร", "ธ"): 0.05,
    ("ธ", "ร"): 0.05,
    ("น", "ม"): 0.05,
    ("ม", "น"): 0.05,
    ("ฌ", "ณ"): 0.05,
    ("ณ", "ฌ"): 0.05,
    ("ต", "ด"): 0.05,
    ("ด", "ต"): 0.05,
    ("ถ", "ก"): 0.05,
    ("ก", "ถ"): 0.05,
    ("ถ", "ค"): 0.05,
    ("ค", "ถ"): 0.05,
    ("ฎ", "ภ"): 0.05,
    ("ภ", "ฎ"): 0.05,
    ("ช", "ษ"): 0.04,
    ("ษ", "ช"): 0.04,
}
_CONFUSABLE_CHARS = set("ขฆมผปบดตซชศษรธนฌณถกคฎภ")
_DIGIT_PREFIX_CONFUSION_MAP = {
    "0": ("ก", "ด", "อ"),
    "1": ("ด", "ก"),
    "4": ("ข", "น"),
    "6": ("บ", "ก"),
    "7": ("ก", "ช"),
    "9": ("ย", "ล"),
}

_DEFAULT_VARIANT_NAMES = (
    "gray",
    "clahe",
    "adaptive",
    "otsu",
    "upscale_x2",
    "upscale_adaptive_x2",
    "upscale_otsu_x2",
)
_DEFAULT_VARIANT_LIMIT = len(_DEFAULT_VARIANT_NAMES)
_DEFAULT_TOP_K = 3
_DEFAULT_CONSENSUS_MIN = 0.55
_DEFAULT_MARGIN_MIN = 0.16
_DEFAULT_DEBUG_CONFIDENCE_THRESHOLD = 0.62
_DEFAULT_PROVINCE_MIN_SCORE = 65.0


class DTRBRecognizer:
    """
    Direct DTRB TPS+ResNet+BiLSTM+Attn recognizer.

    Bypasses EasyOCR's model-loading machinery entirely — the .pth file is
    loaded straight with torch.load + model.load_state_dict, with automatic
    DataParallel "module." prefix stripping.

    Interface: .readtext(image, detail=1, allowlist=None)
    Returns the same shape as easyocr.Reader.readtext():
        [([[x1,y1],[x2,y1],[x2,y2],[x1,y2]], text, confidence), ...]

    The plate image is split top/bottom so the two text lines on a standard
    Thai plate (consonant prefix on top, digits on bottom) are returned as
    separate detections, keeping _group_tokens_to_lines / _select_plate_line
    working without any changes.
    """

    _IMG_H         = 32
    _IMG_W         = 100
    _BATCH_MAX_LEN = 25

    def __init__(self, model_path: Path, character: str, use_gpu: bool = False) -> None:
        dtrb_dir = os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark")
        if dtrb_dir not in sys.path:
            sys.path.insert(0, dtrb_dir)

        try:
            from model import Model as _DTRBModel   # noqa: PLC0415
            from utils import AttnLabelConverter    # noqa: PLC0415
        except ImportError as exc:
            raise ImportError(
                f"Cannot import DTRB model/utils from {dtrb_dir!r}. "
                "Ensure DTRB_DIR env var points to a cloned "
                "deep-text-recognition-benchmark repo."
            ) from exc

        opt = types.SimpleNamespace(
            Transformation    = "TPS",
            FeatureExtraction = "ResNet",
            SequenceModeling  = "BiLSTM",
            Prediction        = "Attn",
            input_channel     = 1,
            output_channel    = 512,    # ResNet backbone — fixed
            hidden_size       = 512,    # must match fine-tuned checkpoint
            num_fiducial      = 20,
            imgH              = self._IMG_H,
            imgW              = self._IMG_W,
            batch_max_length  = self._BATCH_MAX_LEN,
            character         = character,
            num_class         = len(character) + 2,  # +2 for [GO] and [s] tokens
        )

        model = _DTRBModel(opt)

        # Load checkpoint; strip DataParallel "module." prefix when present
        # (DTRB train.py wraps with nn.DataParallel → all keys are "module.*")
        state = torch.load(str(model_path), map_location="cpu", weights_only=False)
        if any(k.startswith("module.") for k in state):
            state = {k.partition("module.")[-1]: v for k, v in state.items()}
        model.load_state_dict(state, strict=True)

        device_str = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        self._device = torch.device(device_str)
        model = model.to(self._device)
        model.eval()

        self._model     = model
        self._opt       = opt
        self._converter = AttnLabelConverter(character)

        log.info(
            "[OCR] DTRBRecognizer ready: %s  (vocab=%d chars, device=%s)",
            model_path.name, len(character), device_str,
        )

    # ── Core inference ────────────────────────────────────────────────────────

    def _infer_band(self, gray: np.ndarray) -> Tuple[str, float]:
        """Run DTRB on one greyscale band. Returns (text, confidence)."""
        import torch.nn.functional as F  # local to avoid top-level circular import

        resized = cv2.resize(gray, (self._IMG_W, self._IMG_H),
                             interpolation=cv2.INTER_CUBIC)

        # Normalise [0,255] → [-1,+1], add batch and channel dimensions → [1,1,H,W]
        tensor = torch.FloatTensor(resized).unsqueeze(0).unsqueeze(0)
        tensor = (tensor / 127.5) - 1.0
        tensor = tensor.to(self._device)

        # Attn decoder: seed with [GO] token (index 0) for all positions
        text_for_pred = (
            torch.LongTensor(1, self._BATCH_MAX_LEN + 1)
            .fill_(0)
            .to(self._device)
        )

        with torch.no_grad():
            preds = self._model(tensor, text_for_pred, is_train=False)

        _, preds_index = preds.max(2)
        texts = self._converter.decode(preds_index, [self._BATCH_MAX_LEN])
        text  = texts[0] if texts else ""

        # Geometric mean of per-character max softmax probabilities
        pred_len = len(text)
        if pred_len > 0:
            prob     = F.softmax(preds, dim=2)
            max_prob, _ = prob.max(dim=2)
            confidence = float(max_prob[0, :pred_len].cumprod(dim=0)[-1].item())
        else:
            confidence = 0.0

        return text, confidence

    # ── EasyOCR-compatible readtext() ─────────────────────────────────────────

    def readtext(
        self,
        image: np.ndarray,
        detail: int = 1,
        allowlist: Optional[str] = None,
    ) -> List[Tuple[Any, str, float]]:
        """
        Mimic easyocr.Reader.readtext() output:
            [(bbox, text, confidence), ...]

        The image is split at the midpoint so that the two typical lines on a
        Thai plate (Thai-character prefix on top, digits on bottom) each get
        their own inference pass and are returned as separate detections.
        _group_tokens_to_lines then clusters them exactly as with EasyOCR.
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        h, w = gray.shape
        mid  = max(1, h // 2)
        bands = [
            (gray[:mid, :], 0,   mid),   # top half  → Thai consonant prefix
            (gray[mid:, :], mid, h),     # bottom half → digits
        ]

        results: List[Tuple[Any, str, float]] = []
        for band, y0, y1 in bands:
            if band.size == 0:
                continue
            text, conf = self._infer_band(band)
            if not text:
                continue
            # Apply allowlist filter for parity with EasyOCR behaviour
            if allowlist and not any(ch in allowlist for ch in text):
                continue
            bbox = [[0, y0], [w, y0], [w, y1], [0, y1]]
            results.append((bbox, text, conf))

        return results


@dataclass
class OCRResult:
    plate_text: str
    province: str
    confidence: float
    raw: Dict[str, Any]


class PlateOCR:
    def __init__(self) -> None:
        use_gpu = torch.cuda.is_available()

        if _CUSTOM_OCR_PTH.exists() and _CUSTOM_OCR_YAML.exists():
            log.info(
                "[OCR] Custom fine-tuned model found: %s  (%.1f MiB) — "
                "loading via DTRBRecognizer (bypasses EasyOCR loader).",
                _CUSTOM_OCR_PTH,
                _CUSTOM_OCR_PTH.stat().st_size / (1024 * 1024),
            )
            # Load character vocabulary from the YAML that was written by
            # finetune_easyocr.py at deploy time (character_list key).
            try:
                import yaml as _yaml  # noqa: PLC0415
                with open(_CUSTOM_OCR_YAML, encoding="utf-8") as _f:
                    _cfg = _yaml.safe_load(_f)
                _character = _cfg.get("character_list", "")
                if not _character:
                    raise ValueError("character_list is empty in YAML — re-run the fine-tuning pipeline")

                # ── Vocab-mismatch guard ──────────────────────────────────────
                # The Attn decoder maps each output index directly to
                # self.character[index].  If the YAML charset and the training
                # charset (_DTRB_CHARS) have diverged — even by a single
                # character or a reordering — every index decodes to the wrong
                # character, producing silent gibberish (e.g. "ฌข" → "3337").
                # We detect this here and refuse to load the custom model
                # instead of producing wrong output.
                if _character != _DTRB_CHARS:
                    raise ValueError(
                        f"[OCR] VOCAB MISMATCH: character_list in YAML has "
                        f"{len(_character)} chars but _DTRB_CHARS in ocr.py has "
                        f"{len(_DTRB_CHARS)} chars "
                        f"({'same length' if len(_character) == len(_DTRB_CHARS) else 'different length'}, "
                        f"content differs). "
                        "The .pth checkpoint was trained with a different vocabulary. "
                        "Fix: re-run mlops/ocr_finetune/finetune_easyocr.py to regenerate "
                        "a consistent ocr_th_custom.pth + ocr_th_custom.yaml pair, "
                        "then restart the worker container."
                    )

                _recognizer      = DTRBRecognizer(_CUSTOM_OCR_PTH, _character, use_gpu=use_gpu)
                self.reader      = _recognizer  # type: ignore[assignment]
                self.thai_reader = _recognizer  # same model for province-OCR fallback
            except Exception as _exc:
                log.error(
                    "[OCR] DTRBRecognizer failed to initialise (%s) — "
                    "falling back to standard EasyOCR Thai model.",
                    _exc, exc_info=True,
                )
                self.reader      = easyocr.Reader(["th", "en"], gpu=use_gpu, verbose=False)
                self.thai_reader = easyocr.Reader(["th"],        gpu=use_gpu, verbose=False)
        else:
            if _CUSTOM_OCR_PTH.exists() and not _CUSTOM_OCR_YAML.exists():
                log.warning(
                    "[OCR] Custom model found at %s but YAML config is missing — "
                    "falling back to standard EasyOCR Thai model.  "
                    "Re-run the fine-tuning pipeline to regenerate both files.",
                    _CUSTOM_OCR_PTH,
                )
            else:
                log.info(
                    "[OCR] No custom model at %s — using standard EasyOCR Thai model",
                    _CUSTOM_OCR_PTH,
                )
            self.reader = easyocr.Reader(["th", "en"], gpu=use_gpu, verbose=False)
            self.thai_reader = easyocr.Reader(["th"], gpu=use_gpu, verbose=False)

        # ── Province classifier (YOLOv8-cls) ─────────────────────────────────
        # When province_classifier.pt exists, the plate is split into a top band
        # (plate characters → EasyOCR) and a bottom band (province → YOLO-cls).
        # Falls back gracefully to fuzzy-match OCR when model is not deployed.
        self.province_classifier = ProvinceClassifier()
        if self.province_classifier.available:
            log.info(
                "[OCR] Province classifier active (%d classes) — "
                "plate will be split %.0f%%/%.0f%% for text/province.",
                self.province_classifier.num_classes,
                _PLATE_TEXT_FRAC * 100,
                _PROVINCE_BAND_FRAC * 100,
            )
        else:
            log.info("[OCR] Province classifier not available — using fuzzy OCR matching.")

        self.variant_names = self._load_variant_names()
        self.variant_limit = int(os.getenv("OCR_VARIANT_LIMIT", str(_DEFAULT_VARIANT_LIMIT)))

        self.top_k = int(os.getenv("OCR_TOP_K", str(_DEFAULT_TOP_K)))
        self.consensus_min = float(os.getenv("OCR_CONSENSUS_MIN", str(_DEFAULT_CONSENSUS_MIN)))
        self.margin_min = float(os.getenv("OCR_MARGIN_MIN", str(_DEFAULT_MARGIN_MIN)))
        self.debug_confidence_threshold = float(
            os.getenv("OCR_DEBUG_CONFIDENCE_THRESHOLD", str(_DEFAULT_DEBUG_CONFIDENCE_THRESHOLD))
        )
        self.province_min_score = float(os.getenv("OCR_PROVINCE_MIN_SCORE", str(_DEFAULT_PROVINCE_MIN_SCORE)))
        self.province_prior = load_province_prior(os.getenv("OCR_PROVINCE_PRIOR", ""))

    def _load_variant_names(self) -> List[str]:
        raw = os.getenv("OCR_VARIANTS", "")
        if not raw:
            return list(_DEFAULT_VARIANT_NAMES)
        names = [name.strip() for name in raw.split(",") if name.strip()]
        return names or list(_DEFAULT_VARIANT_NAMES)

    def read(self, crop_path: str) -> OCRResult:
        return self.read_plate(crop_path)

    def read_plate(self, crop_path: str, debug_dir: Optional[Path] = None, debug_id: Optional[str] = None) -> OCRResult:
        img = cv2.imread(crop_path)
        if img is None:
            raise RuntimeError(f"Cannot read crop: {crop_path}")

        # ── Image split ───────────────────────────────────────────────────────
        # When the province classifier is deployed, divide the plate into:
        #   • ocr_band      (top _PLATE_TEXT_FRAC, default 70%)
        #                   → EasyOCR reads plate characters without province
        #                      text bleeding into the transcript.
        #   • province_band (bottom _PROVINCE_BAND_FRAC, default 30%)
        #                   → YOLOv8-cls predicts province directly from the
        #                      visual shape/appearance of the province text.
        # When the classifier is NOT available (model not yet trained) we
        # keep the original behaviour: EasyOCR runs on the full plate and
        # province is extracted via RapidFuzz matching on the detected text.
        h, w = img.shape[:2]
        use_classifier = self.province_classifier.available
        # Initialise roi_province so the return dict is always valid regardless
        # of which branch (classifier vs fuzzy) executes below.
        roi_province: Dict[str, Any] = {}

        if use_classifier:
            split_y      = max(1, int(h * _PLATE_TEXT_FRAC))
            ocr_band     = img[:split_y, :]          # top ~70%
            province_band = img[split_y:, :]          # bottom ~30%
        else:
            ocr_band      = img
            province_band = None

        # ── Plate-text OCR variants ───────────────────────────────────────────
        variant_results: List[Dict[str, Any]] = []
        for variant_name, variant_img in self._build_variants(ocr_band):
            detections = self.reader.readtext(variant_img, detail=1, allowlist=_THAI_ALLOWLIST)
            candidate = self._evaluate_variant(variant_name, detections)
            variant_results.append(candidate)

        topline_variant = self._topline_roi_pass(ocr_band)
        if topline_variant:
            variant_results.append(topline_variant)

        aggregated = self._aggregate_plate_candidates(variant_results)
        best = aggregated["best"]

        # ── Province detection ────────────────────────────────────────────────
        if use_classifier and province_band is not None and province_band.size > 0:
            # Primary path: YOLO-cls on the pre-cropped province band.
            # No text recognition needed — the model reads visual patterns.
            cls_province, cls_conf = self.province_classifier.predict(province_band)
            cls_top_k = self.province_classifier.top_k(province_band, k=3)

            province_info = {
                "province":          cls_province,
                "candidates":        [
                    {"name": name, "score": round(conf * 100, 1)}
                    for name, conf in cls_top_k
                ] if cls_top_k else (
                    [{"name": cls_province, "score": round(cls_conf * 100, 1)}]
                    if cls_province else []
                ),
                "line_province":     cls_province,
                "line_province_score": round(cls_conf * 100, 1),
                "source":            "province_classifier",
            }
            final_province = cls_province
            log.debug(
                "[OCR] Province classifier: %r  conf=%.3f", cls_province, cls_conf
            )
        else:
            # Fallback path: OCR province ROI + RapidFuzz matching.
            roi_province  = self._province_roi_pass(img)
            line_province = self._province_line_pass(img)
            province_info = self._aggregate_province_candidates(
                variant_results,
                roi_province=roi_province,
                line_texts=line_province["texts"],
            )
            final_province = province_info["province"]

        flags: List[str] = []
        if best["consensus_ratio"] < self.consensus_min or best["margin_ratio"] < self.margin_min:
            flags.append("low_consensus")
        if self._has_confusable_char(best["text"]):
            flags.append("confusable_chars")
        if best["text"]:
            flags.append("plate_present")

        confidence = self._calibrate_confidence(best, flags)

        if confidence < 0.6:
            log.warning(
                "Low OCR confidence variants=%s candidates=%s",
                [v.get("variant") for v in variant_results],
                aggregated.get("candidates", [])[:3],
            )

        # ✅ เหลือ debug block แค่ครั้งเดียว (ของเดิมซ้ำ 2 ก้อน)
        debug_flags = self._should_debug(confidence, best, aggregated)
        debug_artifacts: Dict[str, Any] = {}
        if debug_flags and debug_dir:
            debug_artifacts = self._save_debug_artifacts(
                debug_dir=debug_dir,
                debug_id=debug_id or Path(crop_path).stem,
                image=img,
                variant_images=self._build_variants(img),
                aggregated=aggregated,
                province_info=province_info,
                flags=debug_flags,
            )

        display_text = self._format_plate_display(best["text"])
        plate_candidates = [
            {
                "text": self._format_plate_display(cand["text"]),
                "normalized_text": cand["text"],
                "score": cand["score"],
                "preprocess_id": "consensus",
            }
            for cand in aggregated["candidates"]
        ]

        return OCRResult(
            plate_text=display_text,
            province=final_province,
            confidence=confidence,
            raw={
                "chosen_variant": best.get("variant"),
                "lines": best.get("lines", []),
                "candidates": aggregated["candidates"],
                "variant_candidates": aggregated["variant_candidates"],
                "plate_text_normalized": best["text"],
                "line_province": province_info.get("line_province", ""),
                "line_province_score": province_info.get("line_province_score", 0.0),
                "roi_province": roi_province,
                "province_source": province_info.get("source", "ocr_fuzzy"),
                "plate_candidates": plate_candidates[: self.top_k],
                "province_candidates": province_info["candidates"][: self.top_k],
                "plate_suggestions": aggregated.get("suggestions", []),
                "consensus_metrics": {
                    "consensus_ratio": best["consensus_ratio"],
                    "margin_ratio": best["margin_ratio"],
                    "variant_count": aggregated["variant_count"],
                },
                "confidence_flags": flags,
                "debug_flags": debug_flags,
                "debug_artifacts": debug_artifacts,
            },
        )

    def _build_variants(self, image: np.ndarray) -> List[Tuple[str, np.ndarray]]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.8, tileGridSize=(8, 8)).apply(gray)
        adaptive = cv2.adaptiveThreshold(clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 3)
        otsu = cv2.threshold(clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        up2 = cv2.resize(clahe, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        up2_adaptive = cv2.resize(adaptive, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_NEAREST)
        up2_otsu = cv2.resize(otsu, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_NEAREST)

        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        lower_green = np.array([35, 40, 40])
        upper_green = np.array([85, 255, 255])
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        green_inv = cv2.bitwise_not(green_mask)

        up3 = cv2.resize(clahe, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)

        variants = [
            ("gray", gray),
            ("clahe", clahe),
            ("adaptive", adaptive),
            ("otsu", otsu),
            ("green_mask", green_inv),
            ("upscale_x2", up2),
            ("upscale_adaptive_x2", up2_adaptive),
            ("upscale_otsu_x2", up2_otsu),
            ("upscale_x3", up3),
        ]
        if self.variant_names:
            variants = [variant for variant in variants if variant[0] in self.variant_names]
        if self.variant_limit:
            variants = variants[: self.variant_limit]
        return variants

    def _evaluate_variant(
        self,
        variant_name: str,
        detections: Sequence[Tuple[Any, str, float]],
        score_boost: float = 0.0,
    ) -> Dict[str, Any]:
        lines, tokens = self._group_tokens_to_lines(detections)
        line_texts = ["".join(tok["text"] for tok in line) for line in lines]

        plate_line, plate_tokens = self._select_plate_line(lines)
        plate_candidates = self._plate_candidates(plate_line, tokens, plate_tokens)
        best_plate = plate_candidates[0] if plate_candidates else {"text": "", "score": 0.0, "confidence": 0.0}

        province_candidates_list = self._province_candidates_from_lines(line_texts)
        province = province_candidates_list[0]["name"] if province_candidates_list else ""
        province_score = province_candidates_list[0]["score"] if province_candidates_list else 0.0

        score = float(best_plate["score"]) + (0.08 if province else 0.0) + float(score_boost)

        return {
            "variant": variant_name,
            "plate_text": best_plate["text"],
            "confidence": float(best_plate["confidence"]),
            "score": float(score),
            "province": province,
            "line_province_score": float(province_score),
            "lines": line_texts,
            "candidates": plate_candidates,
            "province_candidates": province_candidates_list,
            "tokens": tokens,
        }

    def _select_plate_line(self, lines: List[List[Dict[str, Any]]]) -> Tuple[str, List[Dict[str, Any]]]:
        if not lines:
            return "", []

        best_line = lines[0]
        best_score = float("-inf")

        for line in lines:
            text = "".join(tok["text"] for tok in line)
            normalized = self._normalize_plate(text)
            if not normalized:
                continue
            confs = [float(tok["conf"]) for tok in line] or [0.0]
            base_conf = float(np.mean(confs))
            digit_bonus = 0.02 * sum(ch.isdigit() for ch in normalized)
            valid_bonus = 0.3 if is_valid_plate(normalized) else 0.0
            score = base_conf + digit_bonus + valid_bonus
            if score > best_score:
                best_score = score
                best_line = line

        return "".join(tok["text"] for tok in best_line), best_line

    def _plate_candidates(
        self,
        top_line: str,
        tokens: List[Dict[str, Any]],
        top_tokens: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        normalized = self._normalize_plate(top_line)
        if not normalized:
            return []

        confs = [float(t["conf"]) for t in tokens] or [0.0]
        base_conf = float(np.mean(confs))
        valid_bonus = 0.25 if is_valid_plate(normalized) else 0.0
        format_adjust = self._plate_format_adjustment(normalized)

        candidates = [{
            "name": "top_line",
            "text": normalized,
            "confidence": max(0.0, min(base_conf + valid_bonus + format_adjust, 1.0)),
            "score": base_conf + valid_bonus + format_adjust,
        }]

        for alt_text, swaps, reduction in self._expand_confusion_candidates(normalized):
            penalty = max(0.01, (0.06 * swaps) - reduction)
            alt_bonus = 0.1 if is_valid_plate(alt_text) else 0.0
            alt_format = self._plate_format_adjustment(alt_text)
            candidates.append({
                "name": f"confusion_swap_{swaps}",
                "text": alt_text,
                "confidence": max(0.0, min(base_conf + valid_bonus + alt_bonus + alt_format - penalty, 1.0)),
                "score": base_conf + valid_bonus + alt_bonus + alt_format - penalty,
            })

        if re.match(r"^[ก-ฮ]{1,2}\d{4}$", normalized):
            prefixed = f"1{normalized}"
            candidates.append({
                "name": "prefixed_digit",
                "text": prefixed,
                "confidence": max(0.0, min(base_conf + 0.1, 1.0)),
                "score": base_conf + (0.22 if is_valid_plate(prefixed) else 0.02),
            })

        if normalized and not normalized[0].isdigit():
            leading_digit = self._find_leading_digit(tokens, top_tokens)
            if leading_digit:
                prefixed = f"{leading_digit}{normalized}"
                if is_valid_plate(prefixed):
                    candidates.append({
                        "name": "leading_digit_token",
                        "text": prefixed,
                        "confidence": max(0.0, min(base_conf + 0.12, 1.0)),
                        "score": base_conf + 0.18,
                    })

        for alt_text, swaps in self._expand_digit_prefix_candidates(normalized):
            if not is_valid_plate(alt_text):
                continue
            penalty = 0.05 * swaps
            alt_format = self._plate_format_adjustment(alt_text)
            candidates.append({
                "name": f"digit_prefix_swap_{swaps}",
                "text": alt_text,
                "confidence": max(0.0, min(base_conf + 0.12 + alt_format - penalty, 1.0)),
                "score": base_conf + 0.18 + alt_format - penalty,
            })

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates

    def _topline_roi_pass(self, image: np.ndarray) -> Optional[Dict[str, Any]]:
        h, w = image.shape[:2]
        end = int(h * 0.55)
        roi = image[0:end, 0:w]
        if roi.size == 0:
            return None

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
        sharpen = cv2.filter2D(clahe, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32))
        adaptive = cv2.adaptiveThreshold(sharpen, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 3)
        up2 = cv2.resize(sharpen, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)

        variants = [
            ("roi_topline_gray", gray),
            ("roi_topline_clahe", clahe),
            ("roi_topline_sharpen", sharpen),
            ("roi_topline_adaptive", adaptive),
            ("roi_topline_upscale", up2),
        ]

        best_variant: Optional[Dict[str, Any]] = None
        for name, variant in variants:
            detections = self.reader.readtext(variant, detail=1, allowlist=_THAI_ALLOWLIST)
            candidate = self._evaluate_variant(name, detections, score_boost=0.12)
            if not best_variant or candidate["score"] > best_variant["score"]:
                best_variant = candidate

        return best_variant

    def _province_roi_pass(self, image: np.ndarray) -> Dict[str, Any]:
        h, w = image.shape[:2]
        start = int(h * 0.55)
        roi = image[start:h, 0:w]
        if roi.size == 0:
            return {"province": "", "score": 0.0, "variant": "", "texts": []}

        roi_threshold = max(50, int(self.province_min_score - 7))
        best = {"province": "", "score": 0.0, "variant": "", "texts": []}

        for name, variant in self._build_province_roi_variants(roi):
            detections = self.thai_reader.readtext(variant, detail=1, allowlist=_THAI_ONLY_ALLOWLIST)
            texts = [self._normalize_text(t) for _, t, c in detections if float(c or 0.0) >= 0.1]
            texts = [t for t in texts if t]
            if not texts:
                continue

            for text in ["".join(texts)] + texts:
                province, score = match_province(text, threshold=roi_threshold)
                province = normalize_province(province or text, threshold=roi_threshold)
                if province and score > best["score"]:
                    best = {"province": province, "score": float(score), "variant": name, "texts": texts}

        return best

    def _build_province_roi_variants(self, roi: np.ndarray) -> List[Tuple[str, np.ndarray]]:
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        up = cv2.resize(gray, None, fx=2.6, fy=2.6, interpolation=cv2.INTER_CUBIC)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(up)
        sharpen = cv2.filter2D(clahe, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32))
        adaptive = cv2.adaptiveThreshold(sharpen, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 3)
        return [("roi_upscale", up), ("roi_clahe_sharpen", sharpen), ("roi_adaptive", adaptive)]

    def _province_line_pass(self, image: np.ndarray) -> Dict[str, Any]:
        h, w = image.shape[:2]
        start = int(h * 0.58)
        roi = image[start:h, 0:w]
        if roi.size == 0:
            return {"texts": []}

        texts: List[str] = []
        for _, variant in self._build_province_roi_variants(roi):
            detections = self.thai_reader.readtext(variant, detail=1, allowlist=_THAI_ONLY_ALLOWLIST)
            for _, text, conf in detections:
                if float(conf or 0.0) < 0.1:
                    continue
                normalized = self._normalize_text(text)
                if normalized:
                    texts.append(normalized)

        merged = "".join(texts)
        if merged:
            texts.append(merged)

        return {"texts": texts}

    def _plate_format_adjustment(self, text: str) -> float:
        # Special plate types – give a moderate positive bump
        if re.match(r"^(TC|QC)\d{1,4}$", text, re.IGNORECASE):
            return 0.06
        if re.match(r"^\d{4,5}$", text):          # police / military pure-digit
            return 0.04
        if re.match(r"^[ทพอ]\d{2}\d{1,4}$", text):   # diplomat
            return 0.04
        # Standard Thai plates
        if re.match(r"^\d[ก-ฮ]{1,2}\d{1,4}$", text):
            return 0.08
        if re.match(r"^[ก-ฮ]{2}\d{1,4}$", text):
            return 0.08
        if re.match(r"^[ก-ฮ]{1,2}\d{1,4}$", text):
            return 0.02
        return -0.08

    def _format_plate_display(self, text: str) -> str:
        text = text or ""
        # TC / QC test-car plates: "TC3337" -> "TC 3337"
        match = re.match(r"^(TC|QC)(\d{1,4})$", text, re.IGNORECASE)
        if match:
            prefix, digits = match.groups()
            return f"{prefix.upper()} {digits}"
        # Standard digit-prefix format: "1กข1234" -> "1กข 1234"
        match = re.match(r"^(\d)([ก-ฮ]{1,2})(\d{1,4})$", text)
        if match:
            digit, prefix, digits = match.groups()
            return f"{digit}{prefix} {digits}"
        # Standard Thai prefix: "กข1234" -> "กข 1234"
        match = re.match(r"^([ก-ฮ]{1,2})(\d{1,4})$", text)
        if match:
            prefix, digits = match.groups()
            return f"{prefix} {digits}"
        return text

    def _province_candidates_from_lines(self, line_texts: List[str]) -> List[Dict[str, Any]]:
        bottom_line = line_texts[1] if len(line_texts) > 1 else ""
        merged = "".join(line_texts)

        candidates: List[Dict[str, Any]] = []
        for text in (bottom_line, merged):
            if not text:
                continue
            for name, score in province_candidates(text, limit=self.top_k, threshold=int(self.province_min_score)):
                candidates.append({
                    "name": normalize_province(name, threshold=int(self.province_min_score)),
                    "score": float(score),
                })

        deduped: Dict[str, float] = {}
        for item in candidates:
            if not item["name"]:
                continue
            if item["name"] not in deduped or item["score"] > deduped[item["name"]]:
                deduped[item["name"]] = item["score"]

        return [
            {"name": name, "score": score}
            for name, score in sorted(deduped.items(), key=lambda item: item[1], reverse=True)
        ]

    # ✅ FIX: consensus แบบ unique variant + ไม่นับ roi_* เข้า denominator + best_summary ไม่ซ้ำ key
    def _aggregate_plate_candidates(self, variant_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        base_variant_ids = {
            v.get("variant", "")
            for v in variant_results
            if v.get("variant", "") and not v.get("variant", "").startswith("roi_")
        }
        variant_count = max(len(base_variant_ids), 1)

        flat: List[Dict[str, Any]] = []
        for variant in variant_results:
            vid = variant.get("variant", "")
            for cand in (variant.get("candidates") or [])[: self.top_k]:
                flat.append({
                    "text": cand["text"],
                    "score": float(cand["score"]),
                    "confidence": float(cand["confidence"]),
                    "preprocess_id": vid,
                })

        aggregated: Dict[str, Dict[str, Any]] = {}
        for item in flat:
            text = item["text"]
            entry = aggregated.setdefault(
                text,
                {"text": text, "total_score": 0.0, "confidences": [], "variants": set()},
            )
            entry["total_score"] += item["score"]
            entry["confidences"].append(item["confidence"])
            entry["variants"].add(item["preprocess_id"])

        candidates: List[Dict[str, Any]] = []
        for entry in aggregated.values():
            avg_conf = float(np.mean(entry["confidences"])) if entry["confidences"] else 0.0
            base_votes = len(set(entry["variants"]) & base_variant_ids)
            consensus_ratio = base_votes / variant_count

            candidates.append({
                "text": entry["text"],
                "score": float(entry["total_score"]),
                "avg_conf": avg_conf,
                "count": int(base_votes),
                "consensus_ratio": float(consensus_ratio),
            })

        reranked = rerank_plate_candidates(
            candidates,
            variant_count=variant_count,
            margin_min=self.margin_min,
            consensus_min=self.consensus_min,
        )

        candidates = reranked.candidates
        best = reranked.best
        margin_ratio = reranked.margin_ratio

        best_variant = next(
            (
                v for v in sorted(variant_results, key=lambda x: x.get("score", 0.0), reverse=True)
                if normalize_plate_text(v.get("plate_text", "")) == best["text"]
            ),
            variant_results[0] if variant_results else {},
        )

        best_summary = {
            "text": best["text"],
            "score": best["score"],
            "avg_conf": best["avg_conf"],
            "consensus_ratio": best["consensus_ratio"],
            "margin_ratio": float(margin_ratio),
            "variant": best_variant.get("variant", ""),
            "lines": best_variant.get("lines", []),
        }

        return {
            "best": best_summary,
            "candidates": candidates,
            "variant_candidates": flat,
            "variant_count": variant_count,
            "suggestions": reranked.suggestions,
            "flags": reranked.flags,
        }

    def _aggregate_province_candidates(
        self,
        variant_results: List[Dict[str, Any]],
        roi_province: Dict[str, Any],
        line_texts: List[str],
    ) -> Dict[str, Any]:
        candidate_map: Dict[str, float] = {}
        for variant in variant_results:
            for item in variant.get("province_candidates", []):
                name = item["name"]
                score = float(item["score"])
                if not name:
                    continue
                if name not in candidate_map or score > candidate_map[name]:
                    candidate_map[name] = score

        fallback_candidates = [
            {"name": name, "score": score}
            for name, score in sorted(candidate_map.items(), key=lambda item: item[1], reverse=True)
        ]
        resolved = resolve_province(
            line_texts=line_texts,
            roi_province=roi_province,
            fallback_candidates=fallback_candidates,
            min_score=self.province_min_score,
            prior=self.province_prior,
        )

        return {
            "province": resolved.province,
            "candidates": resolved.candidates,
            "line_province": resolved.candidates[0]["name"] if resolved.candidates else "",
            "line_province_score": resolved.candidates[0]["score"] if resolved.candidates else 0.0,
            "source": resolved.source,
        }

    def _calibrate_confidence(self, best: Dict[str, Any], flags: List[str]) -> float:
        base_conf = max(0.0, min(float(best.get("avg_conf", 0.0)), 1.0))
        consensus_ratio = float(best.get("consensus_ratio") or 0.0)
        margin_ratio = float(best.get("margin_ratio") or 0.0)

        consensus_factor = 0.7 + 0.3 * min(1.0, consensus_ratio)
        margin_factor = 0.7 + 0.3 * min(1.0, margin_ratio * 2.0)
        confidence = base_conf * consensus_factor * margin_factor

        if "low_consensus" in flags:
            confidence *= 0.85
        if "confusable_chars" in flags:
            confidence *= 0.95

        from .validate import is_valid_plate
        if is_valid_plate(best.get("text", "")):
            confidence *= 1.08

        return max(0.0, min(confidence, 0.97))

    def _should_debug(self, confidence: float, best: Dict[str, Any], aggregated: Dict[str, Any]) -> List[str]:
        flags: List[str] = []
        if confidence < self.debug_confidence_threshold:
            flags.append("low_confidence")
        if best.get("consensus_ratio", 0.0) < self.consensus_min:
            flags.append("low_consensus")
        if self._has_confusable_char(best.get("text", "")):
            flags.append("confusable_chars")
        if len(aggregated.get("candidates", [])) > 1:
            second = aggregated["candidates"][1]
            if best.get("score", 0.0) and (best["score"] - second["score"]) / max(best["score"], 1e-6) < self.margin_min:
                flags.append("tight_margin")
        return flags

    def _save_debug_artifacts(
        self,
        debug_dir: Path,
        debug_id: str,
        image: np.ndarray,
        variant_images: List[Tuple[str, np.ndarray]],
        aggregated: Dict[str, Any],
        province_info: Dict[str, Any],
        flags: List[str],
    ) -> Dict[str, Any]:
        debug_root = Path(debug_dir) / debug_id
        debug_root.mkdir(parents=True, exist_ok=True)

        artifact_paths: Dict[str, str] = {}
        original_path = debug_root / "crop.png"
        cv2.imwrite(str(original_path), image)
        artifact_paths["crop"] = str(original_path)

        for name, variant in variant_images:
            path = debug_root / f"{name}.png"
            cv2.imwrite(str(path), variant)
            artifact_paths[name] = str(path)

        summary_path = debug_root / "ocr_summary.json"
        summary = {
            "flags": flags,
            "plate_candidates": aggregated.get("candidates", [])[: self.top_k],
            "province_candidates": province_info.get("candidates", [])[: self.top_k],
        }
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        artifact_paths["summary"] = str(summary_path)

        return {"dir": str(debug_root), "artifacts": artifact_paths}

    def _has_confusable_char(self, text: str) -> bool:
        return any(ch in _CONFUSABLE_CHARS for ch in text or "")

    def _group_tokens_to_lines(
        self,
        detections: Sequence[Tuple[Any, str, float]],
    ) -> Tuple[List[List[Dict[str, Any]]], List[Dict[str, Any]]]:
        tokens: List[Dict[str, Any]] = []
        for box, text, conf in detections:
            cleaned = self._normalize_text(text)
            if not cleaned:
                continue
            y = float(np.mean([pt[1] for pt in box]))
            x = float(np.mean([pt[0] for pt in box]))
            tokens.append({"text": cleaned, "conf": float(conf or 0.0), "x": x, "y": y})

        if not tokens:
            return [], []

        tokens.sort(key=lambda t: t["y"])
        ys = [t["y"] for t in tokens]
        threshold = max(8.0, (max(ys) - min(ys)) * 0.22)

        clusters: List[List[Dict[str, Any]]] = []
        for tok in tokens:
            if not clusters:
                clusters.append([tok])
                continue
            center = float(np.mean([x["y"] for x in clusters[-1]]))
            if abs(tok["y"] - center) <= threshold:
                clusters[-1].append(tok)
            else:
                clusters.append([tok])

        clusters = sorted(clusters, key=lambda c: np.mean([x["y"] for x in c]))[:2]
        for cluster in clusters:
            cluster.sort(key=lambda c: c["x"])

        return clusters, tokens

    def _normalize_text(self, text: str) -> str:
        norm = (text or "").translate(_THAI_DIGIT_MAP)
        norm = re.sub(r"[\s\-_.]", "", norm)
        norm = re.sub(r"[^0-9A-Za-zก-๙]", "", norm)
        return norm

    def _normalize_plate(self, text: str) -> str:
        norm = self._normalize_text(text)
        # If the raw text looks like a TC/QC test-car plate keep A-Z letters;
        # otherwise strip them so they don't corrupt standard Thai OCR results.
        if re.match(r"^(TC|QC)", norm, re.IGNORECASE):
            # Keep digits and ASCII letters only, uppercase prefix
            norm = re.sub(r"[^0-9A-Za-z]", "", norm).upper()
        else:
            norm = re.sub(r"[^0-9ก-๙]", "", norm)
        return norm

    def _expand_confusion_candidates(self, text: str) -> Iterable[Tuple[str, int, float]]:
        match = re.match(r"^([ก-ฮ]{1,2})(\d+)$", text)
        if not match:
            return []

        prefix, digits = match.groups()
        options: List[List[str]] = []
        for ch in prefix:
            alts = [ch]
            alts.extend(_THAI_CONFUSION_MAP.get(ch, ()))
            options.append(alts)

        variants: List[Tuple[str, int, float]] = []
        for choice in itertools.product(*options):
            swapped = sum(1 for orig, alt in zip(prefix, choice) if orig != alt)
            if swapped == 0:
                continue
            reduction = sum(
                _THAI_CONFUSION_PENALTY_REDUCTION.get((orig, alt), 0.0)
                for orig, alt in zip(prefix, choice)
                if orig != alt
            )
            variants.append(("".join(choice) + digits, swapped, reduction))

        seen = set()
        unique: List[Tuple[str, int, float]] = []
        for variant, swaps, reduction in variants:
            if variant in seen:
                continue
            seen.add(variant)
            unique.append((variant, swaps, reduction))

        return unique[:6]

    def _find_leading_digit(
        self,
        tokens: List[Dict[str, Any]],
        top_tokens: List[Dict[str, Any]],
    ) -> Optional[str]:
        if not tokens or not top_tokens:
            return None
        min_x = min(t["x"] for t in top_tokens)
        center_y = float(np.mean([t["y"] for t in top_tokens]))
        y_spread = max(6.0, np.std([t["y"] for t in top_tokens]) * 2.5)

        candidates = [
            t for t in tokens
            if t["text"].isdigit()
            and len(t["text"]) == 1
            and t["x"] < (min_x - 4.0)
            and abs(t["y"] - center_y) <= y_spread
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda t: t["conf"], reverse=True)
        return candidates[0]["text"]

    def _expand_digit_prefix_candidates(self, text: str) -> Iterable[Tuple[str, int]]:
        if not text:
            return []
        prefix_start = 1 if text[0].isdigit() else 0
        prefix = text[prefix_start:prefix_start + 2]
        if not prefix or not any(ch.isdigit() for ch in prefix):
            return []

        options: List[List[str]] = []
        swap_positions = 0
        for ch in prefix:
            if ch.isdigit() and ch in _DIGIT_PREFIX_CONFUSION_MAP:
                options.append(list(_DIGIT_PREFIX_CONFUSION_MAP[ch]))
                swap_positions += 1
            else:
                options.append([ch])

        variants: List[Tuple[str, int]] = []
        for choice in itertools.product(*options):
            if "".join(choice) == prefix:
                continue
            swaps = sum(1 for orig, alt in zip(prefix, choice) if orig != alt)
            fixed = text[:prefix_start] + "".join(choice) + text[prefix_start + len(prefix):]
            variants.append((fixed, swaps))

        seen = set()
        unique: List[Tuple[str, int]] = []
        for variant, swaps in variants:
            if variant in seen:
                continue
            seen.add(variant)
            unique.append((variant, swaps))
        return unique[:6]
