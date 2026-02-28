"""
Fine-tune YOLOv8n สำหรับตรวจจับรถยนต์ 4 ล้อ จากกล้องหน้างานจริง
===================================================================
รัน: python scripts/train_vehicle_detector.py

ก่อนรัน ต้องมี:
  1. ติดตั้ง ultralytics: pip install ultralytics
  2. เตรียม dataset ในโครงสร้างนี้:
       dataset/
         images/train/*.jpg   (ภาพเทรน)
         images/val/*.jpg     (ภาพ validate)
         labels/train/*.txt   (label YOLO format)
         labels/val/*.txt
  3. แก้ DATA_YAML_PATH ให้ถูกต้อง

ขั้นตอน Labeling (ก่อนเทรน):
  Option A) Roboflow (แนะนำ — ฟรีและง่ายที่สุด):
    1. ไปที่ https://roboflow.com → สร้าง Project ใหม่
    2. Upload ภาพที่สกัดได้จาก extract_frames.py
    3. ตีกรอบรถทุกคันในทุกภาพ (class 0: car)
    4. Export เป็น "YOLOv8" format → Download ZIP
    5. แตก ZIP วางใน dataset/

  Option B) LabelImg (offline):
    pip install labelImg
    labelImg dataset/images/train dataset/labels/train
    (เลือก YOLO format, กำหนด class = car)

  Option C) CVAT (self-hosted/cloud):
    https://cvat.ai → upload → annotate → export YOLO format
"""

import os
import sys
import shutil
import argparse
import logging
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ─── CONFIG ──────────────────────────────────────────────────────────────────
# แก้ path เหล่านี้ให้ตรงกับระบบของคุณ

# Path ไปยัง data.yaml
DATA_YAML_PATH = "./scripts/training/data.yaml"

# Pre-trained weights (จะดาวน์โหลดอัตโนมัติถ้าไม่มี)
PRETRAINED_WEIGHTS = "yolov8n.pt"

# โฟลเดอร์เก็บผลเทรน
RUNS_DIR = "./runs/train"

# ─── TRAINING PARAMS ─────────────────────────────────────────────────────────

TRAINING_CONFIG = {
    "epochs": 100,           # จำนวนรอบเทรน (50 = เร็วพอใช้, 100 = ดีกว่า, 150 = ดีมาก)
    "imgsz": 640,            # ขนาดภาพ (640 = มาตรฐาน YOLOv8)
    "batch": 16,             # ลดเหลือ 8 ถ้า RAM/VRAM ไม่พอ
    "patience": 20,          # หยุดก่อนถ้า val/mAP ไม่ดีขึ้นใน 20 epochs (early stopping)
    "save_period": 10,       # บันทึก checkpoint ทุก 10 epochs
    "workers": 4,            # จำนวน CPU threads (ลดเหลือ 2 ถ้าช้า)
    "cache": "ram",          # cache ภาพใน RAM เพื่อความเร็ว ("disk" ถ้า RAM ไม่พอ)
    "optimizer": "AdamW",    # optimizer
    "lr0": 0.001,            # learning rate เริ่มต้น
    "lrf": 0.01,             # learning rate ปลาย (lrf * lr0)
    "warmup_epochs": 3,      # ramp-up epochs
    "close_mosaic": 10,      # ปิด mosaic augmentation ช่วง 10 epochs สุดท้าย
    "augment": True,         # เปิด augmentation (flip, hsv, mosaic ฯลฯ)
    "hsv_h": 0.015,          # hue augmentation
    "hsv_s": 0.7,            # saturation augmentation
    "hsv_v": 0.4,            # value/brightness augmentation (สำคัญสำหรับกลางคืน)
    "degrees": 5.0,          # rotation (เล็กน้อย — กล้องมักนิ่ง)
    "translate": 0.1,        # translation
    "scale": 0.5,            # scale
    "fliplr": 0.5,           # horizontal flip
    "mosaic": 1.0,           # mosaic probability
    "mixup": 0.1,            # mixup probability
    "conf": 0.001,           # confidence threshold ตอน val
    "iou": 0.6,              # IoU threshold ตอน val
    "single_cls": True,      # บอกว่ามีแค่ 1 class (สำคัญ!)
    "verbose": True,
}


def check_dataset(data_yaml: Path) -> bool:
    """ตรวจสอบว่า dataset พร้อมสำหรับเทรนหรือยัง"""
    import yaml

    if not data_yaml.exists():
        log.error(f"❌ ไม่พบ data.yaml: {data_yaml}")
        return False

    with open(data_yaml) as f:
        cfg = yaml.safe_load(f)

    dataset_root = Path(cfg.get("path", "."))
    if not dataset_root.is_absolute():
        dataset_root = data_yaml.parent / dataset_root

    train_img = dataset_root / cfg.get("train", "images/train")
    val_img = dataset_root / cfg.get("val", "images/val")
    train_lbl = Path(str(train_img).replace("images", "labels"))
    val_lbl = Path(str(val_img).replace("images", "labels"))

    log.info("📂 ตรวจสอบ Dataset:")
    issues = []

    for name, path in [("train/images", train_img), ("val/images", val_img),
                        ("train/labels", train_lbl), ("val/labels", val_lbl)]:
        if not path.exists():
            issues.append(f"   ❌ {name}: {path} — ไม่พบโฟลเดอร์")
        else:
            files = list(path.glob("*.*"))
            log.info(f"   ✅ {name}: {len(files)} ไฟล์")

    if issues:
        for issue in issues:
            log.error(issue)
        return False

    # ตรวจสอบว่า label มีพอ
    train_labels = list(train_lbl.glob("*.txt"))
    val_labels = list(val_lbl.glob("*.txt"))

    if len(train_labels) < 50:
        log.warning(f"⚠️ ภาพ train ({len(train_labels)}) น้อยเกินไป — แนะนำ ≥ 200 ภาพ")
    if len(val_labels) < 20:
        log.warning(f"⚠️ ภาพ val ({len(val_labels)}) น้อยเกินไป — แนะนำ ≥ 50 ภาพ")

    log.info(f"\n   สรุป: Train={len(train_labels)} ภาพ, Val={len(val_labels)} ภาพ")
    return True


def split_dataset(raw_dir: Path, output_dir: Path,
                  train_ratio: float = 0.80, val_ratio: float = 0.15):
    """
    แบ่ง Dataset จาก raw images ที่มี label แล้ว → train/val/test
    ใช้หลังจาก label ภาพเสร็จแล้ว

    raw_dir ต้องมีโครงสร้าง:
      raw_dir/images/*.jpg
      raw_dir/labels/*.txt  (YOLO format)
    """
    import random
    import yaml

    img_dir = raw_dir / "images"
    lbl_dir = raw_dir / "labels"

    images = sorted(img_dir.glob("*.jpg")) + sorted(img_dir.glob("*.png"))
    log.info(f"📦 พบ {len(images)} ภาพใน {img_dir}")

    # ตรวจสอบว่ามี label ครบ
    images_with_labels = [img for img in images if (lbl_dir / (img.stem + ".txt")).exists()]
    log.info(f"   มี label: {len(images_with_labels)}/{len(images)} ภาพ")

    if len(images_with_labels) < 10:
        log.error("❌ ภาพที่มี label น้อยเกินไป — ต้อง label ก่อน!")
        return

    random.seed(42)
    random.shuffle(images_with_labels)

    n = len(images_with_labels)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    splits = {
        "train": images_with_labels[:n_train],
        "val": images_with_labels[n_train:n_train + n_val],
        "test": images_with_labels[n_train + n_val:],
    }

    for split_name, split_imgs in splits.items():
        out_img = output_dir / "images" / split_name
        out_lbl = output_dir / "labels" / split_name
        out_img.mkdir(parents=True, exist_ok=True)
        out_lbl.mkdir(parents=True, exist_ok=True)

        for img_path in split_imgs:
            lbl_path = lbl_dir / (img_path.stem + ".txt")
            shutil.copy2(img_path, out_img / img_path.name)
            if lbl_path.exists():
                shutil.copy2(lbl_path, out_lbl / lbl_path.name)

        log.info(f"   {split_name}: {len(split_imgs)} ภาพ → {out_img}")

    # อัปเดต data.yaml
    yaml_path = output_dir / "data.yaml"
    data_cfg = {
        "path": str(output_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": 1,
        "names": {0: "car"},
    }
    with open(yaml_path, "w") as f:
        yaml.dump(data_cfg, f, default_flow_style=False, allow_unicode=True)

    log.info(f"\n✅ แบ่ง Dataset เสร็จ → {output_dir}")
    log.info(f"   data.yaml: {yaml_path}")
    return yaml_path


def train(data_yaml: str, weights: str, run_name: str = None, **overrides):
    """รัน YOLOv8 Fine-tuning"""
    try:
        from ultralytics import YOLO
    except ImportError:
        log.error("❌ ไม่พบ ultralytics — ติดตั้งด้วย: pip install ultralytics")
        sys.exit(1)

    if run_name is None:
        run_name = datetime.now().strftime("vehicle_detector_%Y%m%d_%H%M")

    log.info("=" * 60)
    log.info("🚀 เริ่ม Fine-tune YOLOv8 สำหรับ Vehicle Detection")
    log.info("=" * 60)
    log.info(f"  Weights    : {weights}")
    log.info(f"  Data YAML  : {data_yaml}")
    log.info(f"  Run name   : {run_name}")
    log.info(f"  Epochs     : {overrides.get('epochs', TRAINING_CONFIG['epochs'])}")
    log.info(f"  Image size : {overrides.get('imgsz', TRAINING_CONFIG['imgsz'])}")
    log.info(f"  Batch size : {overrides.get('batch', TRAINING_CONFIG['batch'])}")
    log.info("=" * 60)

    # โหลด model
    model = YOLO(weights)

    # รวม config
    train_args = {**TRAINING_CONFIG, **overrides}
    train_args["data"] = data_yaml
    train_args["name"] = run_name
    train_args["project"] = RUNS_DIR

    # เทรน!
    results = model.train(**train_args)

    # แสดงผลลัพธ์
    log.info("\n" + "=" * 60)
    log.info("🎉 เทรนเสร็จสิ้น!")
    log.info("=" * 60)

    best_pt = Path(RUNS_DIR) / run_name / "weights" / "best.pt"
    last_pt = Path(RUNS_DIR) / run_name / "weights" / "last.pt"

    if best_pt.exists():
        log.info(f"  ✅ Best weights : {best_pt}")
        log.info(f"  📊 Metrics :")
        try:
            metrics = results.results_dict
            log.info(f"     mAP50   = {metrics.get('metrics/mAP50(B)', 0):.4f}")
            log.info(f"     mAP50-95= {metrics.get('metrics/mAP50-95(B)', 0):.4f}")
            log.info(f"     Precision= {metrics.get('metrics/precision(B)', 0):.4f}")
            log.info(f"     Recall   = {metrics.get('metrics/recall(B)', 0):.4f}")
        except Exception:
            pass

    log.info(f"\n  ขั้นตอนถัดไป:")
    log.info(f"  1. ตรวจสอบผล: runs/train/{run_name}/")
    log.info(f"  2. Export โมเดล: python scripts/export_model.py --weights {best_pt}")

    return results, best_pt


def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune YOLOv8n สำหรับ Vehicle Detection",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    subparsers = parser.add_subparsers(dest="command")

    # คำสั่ง: split (แบ่ง dataset)
    split_parser = subparsers.add_parser("split", help="แบ่ง raw dataset → train/val/test")
    split_parser.add_argument("--raw-dir", default="./dataset/raw",
                              help="โฟลเดอร์ภาพ raw (ต้องมี images/ และ labels/)")
    split_parser.add_argument("--output-dir", default="./dataset",
                              help="โฟลเดอร์ output")
    split_parser.add_argument("--train-ratio", type=float, default=0.80)
    split_parser.add_argument("--val-ratio", type=float, default=0.15)

    # คำสั่ง: train
    train_parser = subparsers.add_parser("train", help="เทรนโมเดล")
    train_parser.add_argument("--data", default=DATA_YAML_PATH,
                              help="path ไปยัง data.yaml")
    train_parser.add_argument("--weights", default=PRETRAINED_WEIGHTS,
                              help="Pre-trained weights (.pt)")
    train_parser.add_argument("--epochs", type=int, default=TRAINING_CONFIG["epochs"])
    train_parser.add_argument("--batch", type=int, default=TRAINING_CONFIG["batch"])
    train_parser.add_argument("--imgsz", type=int, default=TRAINING_CONFIG["imgsz"])
    train_parser.add_argument("--name", default=None,
                              help="ชื่อ run (default: vehicle_detector_YYYYMMDD_HHMM)")
    train_parser.add_argument("--device", default="",
                              help="อุปกรณ์: 0=GPU0, cpu, 0,1=multi-GPU (ว่าง=auto)")

    # คำสั่ง: check (ตรวจ dataset)
    check_parser = subparsers.add_parser("check", help="ตรวจสอบ dataset ก่อนเทรน")
    check_parser.add_argument("--data", default=DATA_YAML_PATH)

    args = parser.parse_args()

    if args.command == "split":
        split_dataset(
            raw_dir=Path(args.raw_dir),
            output_dir=Path(args.output_dir),
            train_ratio=args.train_ratio,
            val_ratio=args.val_ratio,
        )

    elif args.command == "check":
        ok = check_dataset(Path(args.data))
        if ok:
            log.info("✅ Dataset พร้อมสำหรับเทรน")
        else:
            log.error("❌ กรุณาแก้ปัญหาด้านบนก่อนเทรน")

    elif args.command == "train":
        # ตรวจสอบ dataset ก่อน
        if not check_dataset(Path(args.data)):
            log.error("❌ Dataset ไม่พร้อม — หยุดการเทรน")
            sys.exit(1)

        overrides = {
            "epochs": args.epochs,
            "batch": args.batch,
            "imgsz": args.imgsz,
        }
        if args.device:
            overrides["device"] = args.device

        train(
            data_yaml=args.data,
            weights=args.weights,
            run_name=args.name,
            **overrides,
        )

    else:
        parser.print_help()
        print("\n💡 ตัวอย่างการใช้งาน:")
        print("  # 1. ตรวจสอบ dataset:")
        print("  python scripts/train_vehicle_detector.py check --data scripts/training/data.yaml")
        print()
        print("  # 2. แบ่ง dataset (ถ้ายังไม่ได้แบ่ง):")
        print("  python scripts/train_vehicle_detector.py split --raw-dir ./dataset/raw")
        print()
        print("  # 3. เทรน (ใช้ GPU):")
        print("  python scripts/train_vehicle_detector.py train --data scripts/training/data.yaml --device 0")
        print()
        print("  # 4. เทรน (ใช้ CPU - ช้ากว่า):")
        print("  python scripts/train_vehicle_detector.py train --data scripts/training/data.yaml --device cpu --epochs 50")


if __name__ == "__main__":
    main()
