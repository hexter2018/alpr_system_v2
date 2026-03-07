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

# ─────────────────────────────────────────────────────────────────────────────
# OCR character vocabulary
#
# The charset must cover every character that can legally appear on a Thai
# licence plate, including special plate categories introduced in v2:
#
#   STANDARD  – Thai consonants + vowel marks + Arabic digits
#   TEST_CAR  – English uppercase prefix  TC / QC  (e.g. "TC 3337")
#               Lowercase a-z is also included because EasyOCR may emit lower-
#               case glyphs before the post-processing normalisation step
#               converts them to uppercase.  Without a-z in the vocabulary the
#               model produces OOV (out-of-vocabulary) tokens for these chars,
#               which then propagate as ??? in the fine-tuned weights.
#   POLICE    – pure-digit plates (already covered by 0-9)
#   DIPLOMAT  – Thai-prefix plates (already covered by Thai consonants)
#
# Character ordering follows the deep-text-recognition-benchmark convention:
# the model's softmax head maps output positions to this ordered string.
# Duplicate characters would shift the mapping and corrupt predictions, so
# _build_charset() deduplicates while preserving order.
# ─────────────────────────────────────────────────────────────────────────────

def _build_charset() -> str:
    """Return a deduplicated, ordered character vocabulary string.

    Preserves insertion order so the softmax index mapping is deterministic
    across runs.  Logs a warning if any duplicates were found (which would
    indicate a bug in the raw constant below).
    """
    raw = (
        # Thai consonants
        "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
        # Thai vowel marks, tone marks, and special signs
        "ฤฦาิีึืุูเแโใไำ็่้๊๋์ํ๎"
        # Arabic digits (covers STANDARD, POLICE, TEST_CAR digit suffixes)
        "0123456789"
        # Latin uppercase A–Z: required for TC / QC test-car plate prefixes
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        # Latin lowercase a–z: EasyOCR may emit lowercase before normalisation;
        # including these prevents OOV errors during fine-tuning on TC/QC samples
        "abcdefghijklmnopqrstuvwxyz"
        # Space: used as separator in formatted plates (e.g. "TC 3337", "กข 1234")
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


# EasyOCR also downloads the CRAFT text-detector (craft_mlt_25k.pth) into the
# same model directory.  We must exclude it when searching for the recognition
# model because it is a different architecture and cannot be used for fine-tuning.
_CRAFT_MODEL_NAME = "craft_mlt_25k.pth"


def _ensure_base_model(base_model_path: Path) -> "Path | None":
    """Ensure the EasyOCR Thai recognition model exists, downloading if needed.

    EasyOCR keeps its pretrained weights in ``~/.EasyOCR/model/``.  On a fresh
    container this directory is empty.  ``easyocr.Reader(['th'])`` is the
    canonical way to trigger the download — it resolves the URL, verifies the
    checksum, and unzips into the expected location automatically.

    The file name changed between EasyOCR releases:
      • older  → th.pth
      • newer  → thai.pth

    Returns the resolved Path to the recognition model, or None on failure.
    The returned path must be used as --saved_model so that fine-tuning starts
    from the correct file regardless of which naming convention is in use.
    """
    # Fast path: expected name exists.
    if base_model_path.exists():
        return base_model_path

    log.info(
        "[OCR] Base model not found at %s — downloading via EasyOCR (this may take a minute)...",
        base_model_path,
    )
    try:
        import easyocr  # type: ignore

        # gpu=False avoids initialising CUDA just for a weight download.
        # model_storage_directory ensures the file lands in the Docker-volume
        # backed directory so the download persists across container restarts.
        model_dir = base_model_path.parent
        model_dir.mkdir(parents=True, exist_ok=True)
        easyocr.Reader(
            ["th"],
            gpu=False,
            download_enabled=True,
            model_storage_directory=str(model_dir),
        )

        # Check exact name first.
        if base_model_path.exists():
            log.info("[OCR] ✅ Base model ready: %s  (%d MiB)",
                     base_model_path,
                     base_model_path.stat().st_size // (1024 * 1024))
            return base_model_path

        # EasyOCR may have used a different name (e.g. thai.pth vs th.pth).
        # Exclude craft_mlt_25k.pth — that is the text *detector*, not the
        # recognition model, and has a completely different architecture.
        candidates = [
            p for p in sorted(model_dir.glob("*.pth"))
            if p.name != _CRAFT_MODEL_NAME
        ]
        if candidates:
            resolved = candidates[0]  # prefer alphabetically first recognition model
            log.warning(
                "[OCR] Expected '%s' but found '%s' — using that as the base recognition model.",
                base_model_path.name,
                resolved.name,
            )
            return resolved

        log.error("[OCR] EasyOCR download finished but no recognition .pth found in %s", model_dir)
        return None

    except Exception as exc:
        log.error("[OCR] Failed to auto-download base model: %s", exc, exc_info=True)
        log.error(
            "[OCR] Fix: run  easyocr.Reader(['th'])  inside the trainer-worker container, "
            "or set BASE_OCR_MODEL env var to an existing .pth file."
        )
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

    # Write charset file for the training script
    charset_path = output_path / "charset.txt"
    charset_path.write_text(THAI_CHARS, encoding="utf-8")
    log.info(
        "Charset: %d characters  (Thai=%d, digits=10, A-Z=26, a-z=26, space=1)",
        len(THAI_CHARS),
        len(THAI_CHARS) - 10 - 26 - 26 - 1,  # rough Thai char count
    )

    # คำนวณ iter จาก epochs (approximate)
    num_iter = epochs * 1000  # ~1000 iters per epoch

    # DTRB always writes to:  {cwd}/saved_models/{exp_name}/
    # We set cwd=output_path so the run's artefacts land under our storage dir.
    exp_name = "th_finetune"
    dtrb_save_dir = output_path / "saved_models" / exp_name

    cmd = [
        "python", str(DTRB_DIR / "train.py"),
        "--train_data", lmdb_train,
        "--valid_data", lmdb_val,
        "--select_data", "/",
        "--batch_ratio", "1.0",
        "--Transformation", "TPS",
        "--FeatureExtraction", "ResNet",
        "--SequenceModeling", "BiLSTM",
        "--Prediction", "Attn",
        "--saved_model", str(resolved_base_model),
        "--FT",          # ← Fine-Tune flag: loads saved_model with strict=False so the
                         #   output-layer shape mismatch (128 chars vs pretrained size) is OK
        "--exp_name", exp_name,
        "--num_iter", str(num_iter),
        "--batch_size", str(batch_size),
        "--workers", "2",
        # GPU is selected via CUDA_VISIBLE_DEVICES (set in env below);
        # DTRB has no --gpu flag.
        "--character", THAI_CHARS,
        "--sensitive",
        "--imgH", "32",
        "--imgW", "100",
        "--lr", "1e-4",
        # Note: --scheduler and --output_dir are NOT valid DTRB arguments.
    ]

    log.info("Starting fine-tuning: %d iters, batch=%d", num_iter, batch_size)
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
        # Fallback: any .pth inside the exp directory
        pts = sorted(dtrb_save_dir.glob("*.pth"))
        if not pts:
            # Wider search: sometimes DTRB saves directly in saved_models/
            pts = sorted((output_path / "saved_models").glob("**/*.pth"))
        if pts:
            best_pt = pts[-1]
            log.warning("best_accuracy.pth not found, using: %s", best_pt)
        else:
            log.error("No .pth model found under %s", dtrb_save_dir)
            return False

    # Copy ไปที่ production path
    deploy_path = MODELS_DIR / "ocr_th_custom.pth"
    shutil.copy2(best_pt, deploy_path)
    log.info("✅ OCR model deployed: %s", deploy_path)

    # Touch sentinel → worker reload (จะ pick up OCR_CUSTOM_MODEL_PATH ใหม่)
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
