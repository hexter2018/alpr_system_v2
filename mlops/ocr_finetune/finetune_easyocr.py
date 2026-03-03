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

# Thai charset (พยัญชนะ + สระ + ตัวเลข + ตัวอักษรทะเบียน)
THAI_CHARS = (
    "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"
    "ฤฦาิีึืุูเแโใไำ็่้๊๋์ํ๎"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    " "
)


def finetune(lmdb_train: str, lmdb_val: str, output_dir: str,
             epochs: int = 10, batch_size: int = 64, device: str = "0"):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    if not DTRB_DIR.exists():
        log.error("deep-text-recognition-benchmark not found at %s", DTRB_DIR)
        log.error("Run: git clone https://github.com/clovaai/deep-text-recognition-benchmark %s", DTRB_DIR)
        return False

    if not BASE_OCR_MODEL.exists():
        log.error("Base OCR model not found: %s", BASE_OCR_MODEL)
        return False

    # สร้าง charset file
    charset_path = output_path / "charset.txt"
    charset_path.write_text(THAI_CHARS, encoding="utf-8")
    log.info("Charset: %d characters", len(THAI_CHARS))

    # คำนวณ iter จาก epochs (approximate)
    num_iter = epochs * 1000  # ~1000 iters per epoch

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
        "--saved_model", str(BASE_OCR_MODEL),  # fine-tune จาก pretrained
        "--exp_name", "th_finetune",
        "--num_iter", str(num_iter),
        "--batch_size", str(batch_size),
        "--workers", "2",
        "--gpu", device,
        "--character", THAI_CHARS,
        "--sensitive",
        "--imgH", "32",
        "--imgW", "100",
        "--output_dir", str(output_path),
        # Fine-tuning settings: LR เล็กลง
        "--lr", "1e-4",
        "--scheduler",
    ]

    log.info("Starting fine-tuning: %d iters, batch=%d", num_iter, batch_size)
    log.info("CMD: %s", " ".join(cmd))

    result = subprocess.run(
        cmd, cwd=str(DTRB_DIR),
        env={**os.environ, "CUDA_VISIBLE_DEVICES": device},
    )

    if result.returncode != 0:
        log.error("Fine-tuning FAILED (rc=%d)", result.returncode)
        return False

    # หา best model
    best_pt = output_path / "best_accuracy.pth"
    if not best_pt.exists():
        # Fallback: หา .pth ที่มีในโฟลเดอร์
        pts = sorted(output_path.glob("*.pth"))
        if pts:
            best_pt = pts[-1]
            log.warning("best_accuracy.pth not found, using: %s", best_pt)
        else:
            log.error("No .pth model found in %s", output_path)
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