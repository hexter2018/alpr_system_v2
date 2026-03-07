"""
Fine-tune EasyOCR Thai model using deep-text-recognition-benchmark

รันใน trainer-worker container:
    python -m mlops.ocr_finetune.finetune_easyocr \
        --lmdb-train /storage/ocr_training/lmdb/train \
        --lmdb-val   /storage/ocr_training/lmdb/val \
        --output     /storage/ocr_training/output \
        --epochs     10

หมายเหตุ:
    - ต้อง clone deep-text-recognition-benchmark ไว้ที่ /opt/deep-text-recognition-benchmark
    - base model: EasyOCR pretrained Thai (/root/.EasyOCR/model/th.pth หรือ custom)
    - output: best_accuracy.pth → deploy ไปที่ /models/ocr_th_custom.pth

WHY --sensitive IS NOT PASSED
------------------------------
DTRB's train.py contains this hardcoded block:

    if opt.sensitive:
        opt.character = string.printable[:-6]   # 94 ASCII printable chars

This unconditionally replaces opt.character with ASCII-only content,
silently discarding every Thai character we pass via --character.  The
--sensitive flag was originally designed for case-sensitive ASCII models
(ASTER benchmark); it is meaningless and destructive for Thai.

Fix: do NOT pass --sensitive.  Case sensitivity for our A-Z characters is
handled by including both uppercase and lowercase explicitly in THAI_CHARS.
The Dockerfile patches dataset.py for PyTorch 2.x compatibility; the
sensitive block in train.py is patched via sed in the same RUN layer
(see Dockerfile).

ARCHITECTURE ALIGNMENT WITH EasyOCR thai.pth
---------------------------------------------
EasyOCR's pretrained Thai model was trained with hidden_size=512.
DTRB defaults to 256, which causes a RuntimeError on every BiLSTM weight
even with strict=False (size mismatches are always fatal in load_state_dict).
We pass --hidden_size 512 to match the checkpoint exactly.
Override via OCR_HIDDEN_SIZE env var if you use a different base model.

DTRB CHARACTER FILTERING
-------------------------
DTRB filters samples whose label contains chars outside --character by running
re.search(f'[^{opt.character}]', label.lower()).  The .lower() means uppercase
plate prefixes (TC, QC) are downcased before matching — edge cases in the
compiled regex with multi-byte Thai chars can silently drop valid samples.
Our labels are human-verified.  We pass --data_filtering_off to skip this
step; --character is still passed so the softmax head is correctly sized.
"""
import argparse, logging, os, shutil, subprocess, sys
from pathlib import Path

import yaml as _yaml  # PyYAML — already in mlops/requirements.txt

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DTRB_DIR = Path(os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark"))
BASE_OCR_MODEL = Path(os.getenv(
    "BASE_OCR_MODEL",
    os.path.expanduser("~/.EasyOCR/model/th.pth"),
))
MODELS_DIR = Path(os.getenv("MODELS_DIR", "/models"))

# Must match the hidden_size used when the base model was originally trained.
# EasyOCR's official Thai model (thai.pth / th.pth) was trained with 512.
OCR_HIDDEN_SIZE = int(os.getenv("OCR_HIDDEN_SIZE", "512"))

_CRAFT_MODEL_NAME = "craft_mlt_25k.pth"


# ─────────────────────────────────────────────────────────────────────────────
# OCR character vocabulary
# ─────────────────────────────────────────────────────────────────────────────

def _build_charset() -> str:
    """Return a deduplicated, ordered character vocabulary string."""
    raw = (
        # Thai consonants
        "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
        # Thai vowel marks, tone marks, and special signs
        "ฤฦาิีึืุูเแโใไำ็่้๊๋์ํ๎"
        # Arabic digits
        "0123456789"
        # Latin uppercase A–Z: required for TC / QC test-car plate prefixes.
        # We do NOT rely on --sensitive for case handling — see module docstring.
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        # Latin lowercase a–z: DTRB applies the charset filter to label.lower(),
        # so uppercase chars are downcased before matching.  a-z must be present
        # to avoid OOV errors even though --data_filtering_off is set, because
        # the Attn decoder's output vocabulary is built from this string.
        "abcdefghijklmnopqrstuvwxyz"
        # Space: separator in formatted plates (e.g. "TC 3337", "กข 1234")
        " "
    )
    seen: set = set()
    deduped: list = []
    for ch in raw:
        if ch not in seen:
            seen.add(ch)
            deduped.append(ch)

    dupes = len(raw) - len(deduped)
    if dupes:
        log.warning("THAI_CHARS had %d duplicate character(s) — deduplicated.", dupes)

    return "".join(deduped)


THAI_CHARS: str = _build_charset()


def _ensure_base_model(base_model_path: Path) -> "Path | None":
    """Ensure the EasyOCR Thai recognition model exists, downloading if needed."""
    if base_model_path.exists():
        return base_model_path

    log.info("[OCR] Base model not found at %s — downloading via EasyOCR...", base_model_path)
    try:
        import easyocr  # type: ignore

        model_dir = base_model_path.parent
        model_dir.mkdir(parents=True, exist_ok=True)
        easyocr.Reader(
            ["th"],
            gpu=False,
            download_enabled=True,
            model_storage_directory=str(model_dir),
        )

        if base_model_path.exists():
            log.info("[OCR] ✅ Base model ready: %s  (%d MiB)",
                     base_model_path, base_model_path.stat().st_size // (1024 * 1024))
            return base_model_path

        # EasyOCR may have saved the file as thai.pth instead of th.pth
        candidates = [
            p for p in sorted(model_dir.glob("*.pth"))
            if p.name != _CRAFT_MODEL_NAME
        ]
        if candidates:
            resolved = candidates[0]
            log.warning(
                "[OCR] Expected '%s' but found '%s' — using as base recognition model.",
                base_model_path.name, resolved.name,
            )
            return resolved

        log.error("[OCR] EasyOCR download finished but no recognition .pth found in %s", model_dir)
        return None

    except Exception as exc:
        log.error("[OCR] Failed to auto-download base model: %s", exc, exc_info=True)
        return None


def finetune(lmdb_train: str, lmdb_val: str, output_dir: str,
             epochs: int = 10, batch_size: int = 64, device: str = "0"):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    if not DTRB_DIR.exists():
        log.error("deep-text-recognition-benchmark not found at %s", DTRB_DIR)
        log.error("Run: git clone https://github.com/clovaai/deep-text-recognition-benchmark %s", DTRB_DIR)
        return False

    # ── Prefer the previously fine-tuned custom model for incremental training ──
    # When a custom model already exists (e.g. from the last fine-tuning run),
    # use it as the starting checkpoint so each training session builds on the
    # accumulated improvements rather than reverting to the base thai.pth.
    custom_model = MODELS_DIR / "ocr_th_custom.pth"
    if custom_model.exists():
        resolved_base_model: "Path | None" = custom_model
        log.info(
            "[OCR] Incremental training: using previously fine-tuned model as base: %s",
            resolved_base_model,
        )
    else:
        resolved_base_model = _ensure_base_model(BASE_OCR_MODEL)
        if resolved_base_model is None:
            log.error("[OCR] Base model unavailable — cannot fine-tune without pretrained weights.")
            return False
        log.info("[OCR] Using base model: %s", resolved_base_model)

    log.info("[OCR] hidden_size=%d", OCR_HIDDEN_SIZE)

    charset_path = output_path / "charset.txt"
    charset_path.write_text(THAI_CHARS, encoding="utf-8")
    log.info("Charset: %d characters  (Thai + digits + A-Z + a-z + space)", len(THAI_CHARS))

    num_iter      = epochs * 1000
    exp_name      = "th_finetune"
    dtrb_save_dir = output_path / "saved_models" / exp_name

    cmd = [
        "python", str(DTRB_DIR / "train.py"),
        "--train_data",       lmdb_train,
        "--valid_data",       lmdb_val,
        "--select_data",      "/",
        "--batch_ratio",      "1.0",
        "--Transformation",   "TPS",
        "--FeatureExtraction","ResNet",
        "--SequenceModeling", "BiLSTM",
        "--Prediction",       "Attn",
        "--saved_model",      str(resolved_base_model),
        "--FT",
        "--exp_name",         exp_name,
        "--num_iter",         str(num_iter),
        "--batch_size",       str(batch_size),
        "--workers",          "2",
        "--character",        THAI_CHARS,
        # ── DO NOT pass --sensitive ──────────────────────────────────────────
        # DTRB's train.py hardcodes:
        #   if opt.sensitive: opt.character = string.printable[:-6]
        # This silently replaces our entire Thai charset with 94 ASCII chars.
        # Case sensitivity for A-Z is handled by including both cases in
        # THAI_CHARS above.  The Dockerfile patches this line via sed so it
        # becomes a no-op; but we also omit the flag here as a second defence.
        # ────────────────────────────────────────────────────────────────────
        "--imgH",             "32",
        "--imgW",             "100",
        "--adam",             # Adam optimizer — requires lr ~1e-4 (Adadelta default of lr=1.0
                             #   makes Adam diverge; conversely Adadelta needs lr=1.0 not 1e-4).
                             #   Adam converges significantly faster for fine-tuning tasks.
        "--lr",               "1e-4",
        "--hidden_size",      str(OCR_HIDDEN_SIZE),
        "--batch_max_length", "25",
        "--data_filtering_off",
    ]

    log.info("Starting fine-tuning: %d iters, batch=%d, hidden_size=%d",
             num_iter, batch_size, OCR_HIDDEN_SIZE)
    log.info("Output will be written to: %s", dtrb_save_dir)
    log.info("CMD: %s", " ".join(cmd))

    result = subprocess.run(
        cmd,
        cwd=str(output_path),
        env={**os.environ, "CUDA_VISIBLE_DEVICES": device},
    )

    if result.returncode != 0:
        log.error("Fine-tuning FAILED (rc=%d)", result.returncode)
        return False

    best_pt = dtrb_save_dir / "best_accuracy.pth"
    if not best_pt.exists():
        pts = sorted(dtrb_save_dir.glob("*.pth"))
        if not pts:
            pts = sorted((output_path / "saved_models").glob("**/*.pth"))
        if pts:
            best_pt = pts[-1]
            log.warning("best_accuracy.pth not found, using: %s", best_pt)
        else:
            log.error("No .pth model found under %s", dtrb_save_dir)
            return False

    deploy_path = MODELS_DIR / "ocr_th_custom.pth"
    shutil.copy2(best_pt, deploy_path)
    log.info("✅ OCR model deployed: %s", deploy_path)

    # ── Write EasyOCR YAML config so workers can load the model ──────────────
    # EasyOCR 1.7.x reads {user_network_directory}/{recog_network}.yaml to
    # determine network architecture.  Without this file the Reader ignores the
    # custom .pth entirely and falls back to built-in models.
    #
    # ALL keys below are required by easyocr.py — missing any one causes a
    # bare KeyError crash (no fallback, no helpful message):
    #
    #   imgH            recog_config['imgH']  — input image height (px)
    #   imgW            recog_config['imgW']  — input image width  (px)
    #   lang_list       recog_config['lang_list']
    #                   → Languages this custom model supports.  Must be a
    #                     superset of the lang_list passed to Reader().
    #                     We use ['th', 'en'] so both Reader(["th","en"]) and
    #                     Reader(["th"]) calls in ocr.py succeed from one file.
    #   character_list  Full vocabulary string; len() → Attn head output size.
    #                   Key name is 'character_list' in EasyOCR 1.7.x (NOT 'character').
    #                   Use allow_unicode=True so Thai chars write as-is.
    #   network_params  Architecture dict consumed by the model builder:
    #     input_channel   1  (greyscale)
    #     output_channel  ResNet backbone output channels — always 512 for
    #                     DTRB ResNet; NOT the same as hidden_size.
    #     hidden_size     BiLSTM hidden dim — must match thai.pth checkpoint.
    _OCR_RESNET_OUTPUT_CHANNEL = 512  # fixed for DTRB ResNet — never changes
    yaml_path = MODELS_DIR / "ocr_th_custom.yaml"
    yaml_doc = _yaml.dump(
        {
            "imgH": 32,
            "imgW": 100,
            "lang_list": ["th", "en"],  # superset of both Reader() call sites
            "character_list": THAI_CHARS,  # EasyOCR 1.7.x key name (NOT 'character')
            "network_params": {
                "input_channel":  1,
                "output_channel": _OCR_RESNET_OUTPUT_CHANNEL,
                "hidden_size":    OCR_HIDDEN_SIZE,
            },
        },
        allow_unicode=True,   # write Thai chars verbatim, not \uXXXX
        default_flow_style=False,
        sort_keys=False,
    )
    yaml_path.write_text(yaml_doc, encoding="utf-8")
    log.info(
        "[OCR] YAML config written: %s  (output_channel=%d, hidden_size=%d, vocab=%d chars)",
        yaml_path, _OCR_RESNET_OUTPUT_CHANNEL, OCR_HIDDEN_SIZE, len(THAI_CHARS),
    )

    # ── Write ocr_th_custom.py architecture stub ──────────────────────────────
    # EasyOCR 1.7.x custom model loading calls:
    #   sys.path.insert(0, user_network_directory)
    #   model_pkg = importlib.import_module('ocr_th_custom')   ← needs this .py
    #   model = model_pkg.Model(input_channel, output_channel, hidden_size, num_class)
    #
    # Our weights use the DTRB TPS+ResNet+BiLSTM+Attn architecture — the same
    # as EasyOCR's built-in generation2 — so we simply re-export that Model.
    # The fallback chain handles different EasyOCR packaging layouts.
    py_path = MODELS_DIR / "ocr_th_custom.py"
    py_path.write_text(
        '"""\n'
        'ocr_th_custom.py — EasyOCR user_network_directory architecture stub.\n'
        'Re-exports EasyOCR generation2 (DTRB TPS+ResNet+BiLSTM+Attn) Model.\n'
        '"""\n'
        "try:\n"
        "    from easyocr.model import Model\n"
        "except ImportError:\n"
        "    try:\n"
        "        from easyocr.model.vgg_model import Model\n"
        "    except ImportError:\n"
        "        import os, sys as _sys\n"
        '        _dtrb = os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark")\n'
        "        if _dtrb not in _sys.path:\n"
        "            _sys.path.insert(0, _dtrb)\n"
        "        from model import Model\n"
        '\n__all__ = ["Model"]\n',
        encoding="utf-8",
    )
    log.info("[OCR] Architecture stub written: %s", py_path)

    sentinel = MODELS_DIR / "reload.sentinel"
    sentinel.touch()
    log.info("Sentinel touched → worker will reload OCR model")

    return True


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Fine-tune EasyOCR Thai model")
    p.add_argument("--lmdb-train", required=True)
    p.add_argument("--lmdb-val",   required=True)
    p.add_argument("--output",     default="/storage/ocr_training/output")
    p.add_argument("--epochs",     type=int, default=10)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--device",     default="0")
    args = p.parse_args()

    ok = finetune(
        lmdb_train=args.lmdb_train,
        lmdb_val=args.lmdb_val,
        output_dir=args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        device=args.device,
    )
    sys.exit(0 if ok else 1)