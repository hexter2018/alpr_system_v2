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

DTRB character filtering
------------------------
By default DTRB filters out any sample whose label contains a character not in
--character, using the regex [^{opt.character}] against label.lower().  For
Thai licence plates this is dangerous for two reasons:

  1. Our charset is intentionally broad (Thai + digits + A-Z + a-z + space),
     but label.lower() converts uppercase TC/QC prefixes to lowercase, and the
     regex is applied to the *lowercased* label.  A mismatch between the case
     used in the label and the charset causes valid samples to be silently
     dropped — reducing the effective dataset size to 0 in the val split,
     which makes PyTorch crash with num_samples=0.

  2. Human-verified labels have already been checked by a reviewer.  A second
     character-based filter adds no quality benefit and actively removes
     legitimate edge-case plates (test cars, diplomat plates, etc.).

Fix: pass --data_filtering_off to disable the DTRB character filter entirely.
The charset is still passed via --character so the model's output vocabulary is
correct; we just skip the filtering step that would drop valid samples.

Additionally, Thai licence plates are short (≤ ~10 chars including space), but
DTRB's default --batch_max_length is 25.  Labels longer than this are also
filtered.  We explicitly set --batch_max_length 25 to make this visible and
ensure it never silently drops any plate label.
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
# ─────────────────────────────────────────────────────────────────────────────

def _build_charset() -> str:
    raw = (
        # Thai consonants
        "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
        # Thai vowel marks, tone marks, and special signs
        "ฤฦาิีึืุูเแโใไำ็่้๊๋์ํ๎"
        # Arabic digits
        "0123456789"
        # Latin uppercase A–Z: required for TC / QC test-car plate prefixes
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        # Latin lowercase a–z: EasyOCR may emit lowercase before normalisation;
        # also required because DTRB applies the charset filter to label.lower(),
        # so uppercase labels are downcased before matching — without a-z in the
        # charset the filter would drop every label that contains A-Z.
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

_CRAFT_MODEL_NAME = "craft_mlt_25k.pth"


def _ensure_base_model(base_model_path: Path) -> "Path | None":
    """Ensure the EasyOCR Thai recognition model exists, downloading if needed."""
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

        candidates = [
            p for p in sorted(model_dir.glob("*.pth"))
            if p.name != _CRAFT_MODEL_NAME
        ]
        if candidates:
            resolved = candidates[0]
            log.warning(
                "[OCR] Expected '%s' but found '%s' — using that as base recognition model.",
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
        return False

    resolved_base_model = _ensure_base_model(BASE_OCR_MODEL)
    if resolved_base_model is None:
        log.error("[OCR] Base model unavailable — cannot fine-tune without pretrained weights.")
        return False
    log.info("[OCR] Using base model: %s", resolved_base_model)

    charset_path = output_path / "charset.txt"
    charset_path.write_text(THAI_CHARS, encoding="utf-8")
    log.info(
        "Charset: %d characters  (Thai + digits + A-Z + a-z + space)",
        len(THAI_CHARS),
    )

    num_iter = epochs * 1000
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
        "--FT",
        "--exp_name", exp_name,
        "--num_iter", str(num_iter),
        "--batch_size", str(batch_size),
        "--workers", "2",
        "--character", THAI_CHARS,
        "--sensitive",
        "--imgH", "32",
        "--imgW", "100",
        "--lr", "1e-4",
        "--batch_max_length", "25",   # explicit: labels longer than this would be filtered
        # ── Key fix ──────────────────────────────────────────────────────────
        # Disable DTRB's character-set filter.  Without this flag, DTRB calls
        #   re.search(f'[^{opt.character}]', label.lower())
        # on every sample.  Because the regex is applied to label.lower(), any
        # uppercase character in a label (e.g. "TC 3337") is lowercased first —
        # if lowercase equivalents are not in the charset the sample is dropped.
        # Our labels are human-verified; we do not need a second filter pass.
        # The --character flag is still passed so the model's softmax vocabulary
        # is sized correctly; we just skip the filtering step.
        "--data_filtering_off",
    ]

    log.info("Starting fine-tuning: %d iters, batch=%d", num_iter, batch_size)
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