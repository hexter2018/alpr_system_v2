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

Architecture alignment with EasyOCR thai.pth
---------------------------------------------
EasyOCR's pretrained Thai model (thai.pth / th.pth) was trained with
hidden_size=512.  This means its BiLSTM layers have weight matrices shaped
[4*512, input] = [2048, *].

DTRB's --hidden_size default is 256, producing [4*256, input] = [1024, *]
matrices.  PyTorch's load_state_dict rejects *size* mismatches unconditionally
— strict=False only allows missing or extra keys, not dimension differences.
The result is a RuntimeError listing every SequenceModeling weight.

Fix: always pass --hidden_size 512 so DTRB constructs a model whose BiLSTM
dimensions match the pretrained checkpoint exactly.

If you switch to a different base model with a different hidden size, set the
OCR_HIDDEN_SIZE environment variable accordingly.

DTRB character filtering
-------------------------
By default DTRB applies re.search(f'[^{opt.character}]', label.lower()) to
every sample and discards any label containing out-of-vocabulary characters.
Because the regex operates on label.lower(), uppercase plate prefixes (TC, QC)
are downcased before matching.  Our charset already includes a-z, but edge
cases in regex compilation with multi-byte Thai characters can silently drop
valid samples, reducing a split to 0 and crashing the DataLoader.

Fix: pass --data_filtering_off.  Our labels are human-verified; the charset is
still passed via --character so the softmax output head is correctly sized.
"""
import argparse, logging, os, shutil, subprocess, sys
from pathlib import Path

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DTRB_DIR = Path(os.getenv("DTRB_DIR", "/opt/deep-text-recognition-benchmark"))
BASE_OCR_MODEL = Path(os.getenv(
    "BASE_OCR_MODEL",
    os.path.expanduser("~/.EasyOCR/model/th.pth"),
))
MODELS_DIR = Path(os.getenv("MODELS_DIR", "/models"))

# Must match the hidden_size used when the base model was originally trained.
# EasyOCR's official Thai model (thai.pth / th.pth) uses 512.
# Override via env var if you supply a custom base model trained with a
# different hidden size.
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
        # Latin uppercase A–Z: required for TC / QC test-car plate prefixes
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        # Latin lowercase a–z: DTRB applies the charset filter to label.lower(),
        # so uppercase chars are downcased before matching — a-z must be present.
        # Also covers any EasyOCR pre-normalisation lowercase emission.
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
    """Ensure the EasyOCR Thai recognition model exists, downloading if needed.

    Returns the resolved Path (which may differ in name from base_model_path
    if EasyOCR downloaded 'thai.pth' instead of 'th.pth'), or None on failure.
    """
    if base_model_path.exists():
        return base_model_path

    log.info(
        "[OCR] Base model not found at %s — downloading via EasyOCR...",
        base_model_path,
    )
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
                     base_model_path,
                     base_model_path.stat().st_size // (1024 * 1024))
            return base_model_path

        # EasyOCR may have saved the file as thai.pth instead of th.pth.
        # Exclude craft_mlt_25k.pth — that is the text detector, not the
        # recognition model, and has a completely different architecture.
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

    resolved_base_model = _ensure_base_model(BASE_OCR_MODEL)
    if resolved_base_model is None:
        log.error("[OCR] Base model unavailable — cannot fine-tune without pretrained weights.")
        return False
    log.info("[OCR] Using base model: %s", resolved_base_model)
    log.info("[OCR] hidden_size=%d (must match the architecture the base model was trained with)", OCR_HIDDEN_SIZE)

    # Write charset file for reference / debugging
    charset_path = output_path / "charset.txt"
    charset_path.write_text(THAI_CHARS, encoding="utf-8")
    log.info("Charset: %d characters  (Thai + digits + A-Z + a-z + space)", len(THAI_CHARS))

    num_iter  = epochs * 1000
    exp_name  = "th_finetune"
    dtrb_save_dir = output_path / "saved_models" / exp_name

    cmd = [
        "python", str(DTRB_DIR / "train.py"),
        "--train_data",      lmdb_train,
        "--valid_data",      lmdb_val,
        "--select_data",     "/",
        "--batch_ratio",     "1.0",
        "--Transformation",  "TPS",
        "--FeatureExtraction","ResNet",
        "--SequenceModeling","BiLSTM",
        "--Prediction",      "Attn",
        "--saved_model",     str(resolved_base_model),
        "--FT",              # fine-tune: loads weights with strict=False
        "--exp_name",        exp_name,
        "--num_iter",        str(num_iter),
        "--batch_size",      str(batch_size),
        "--workers",         "2",
        "--character",       THAI_CHARS,
        "--sensitive",
        "--imgH",            "32",
        "--imgW",            "100",
        "--lr",              "1e-4",
        # ── Architecture: must match the pretrained checkpoint ───────────────
        # EasyOCR thai.pth was trained with hidden_size=512.
        # DTRB default is 256, causing a RuntimeError on every BiLSTM weight
        # when load_state_dict is called (even with strict=False).
        "--hidden_size",     str(OCR_HIDDEN_SIZE),
        # ── Label length cap ─────────────────────────────────────────────────
        # Thai plates are short; 25 is safe and matches DTRB's default.
        # Made explicit here so it's visible and auditable.
        "--batch_max_length","25",
        # ── Disable character-set filter ─────────────────────────────────────
        # DTRB filters labels using re.search('[^charset]', label.lower()).
        # Because it lowercases first, uppercase TC/QC labels can be silently
        # dropped, collapsing a split to 0 samples → PyTorch num_samples=0.
        # Our labels are human-verified; filtering adds no value and breaks
        # edge-case plates.
        "--data_filtering_off",
    ]

    log.info("Starting fine-tuning: %d iters, batch=%d, hidden_size=%d",
             num_iter, batch_size, OCR_HIDDEN_SIZE)
    log.info("Output will be written to: %s", dtrb_save_dir)
    log.info("CMD: %s", " ".join(cmd))

    result = subprocess.run(
        cmd,
        cwd=str(output_path),   # DTRB writes saved_models/ relative to cwd
        env={**os.environ, "CUDA_VISIBLE_DEVICES": device},
    )

    if result.returncode != 0:
        log.error("Fine-tuning FAILED (rc=%d)", result.returncode)
        return False

    # DTRB saves best_accuracy.pth inside saved_models/{exp_name}/
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

    # Deploy to production path
    deploy_path = MODELS_DIR / "ocr_th_custom.pth"
    shutil.copy2(best_pt, deploy_path)
    log.info("✅ OCR model deployed: %s", deploy_path)

    # Touch sentinel → worker reload
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