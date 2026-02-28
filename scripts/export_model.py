"""
Export YOLOv8 best.pt → ONNX / TensorRT และ Deploy ไปยัง models/
==================================================================
รันหลังจากเทรนเสร็จแล้ว:

  # Export เป็น ONNX (ใช้ได้ทุก hardware)
  python scripts/export_model.py --weights runs/train/vehicle_detector_XXXXX/weights/best.pt --format onnx

  # Export เป็น TensorRT (ต้องมี GPU + TensorRT ติดตั้ง)
  python scripts/export_model.py --weights runs/train/vehicle_detector_XXXXX/weights/best.pt --format engine

  # Export แล้ว deploy ไปยัง models/ อัตโนมัติ
  python scripts/export_model.py --weights runs/train/vehicle_detector_XXXXX/weights/best.pt --format onnx --deploy
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

MODELS_DIR = Path("./models")
DOCKER_COMPOSE_PATH = Path("./docker-compose.yml")


def validate_model(weights_path: Path) -> bool:
    """ทดสอบโมเดลก่อน export"""
    try:
        from ultralytics import YOLO
        import numpy as np

        log.info(f"🔍 ทดสอบโมเดล: {weights_path}")
        model = YOLO(str(weights_path))

        # ทดสอบด้วย dummy image
        dummy = np.zeros((640, 640, 3), dtype="uint8")
        results = model.predict(dummy, verbose=False, conf=0.25, classes=[0])

        log.info(f"   ✅ โมเดลทำงานปกติ")
        log.info(f"   Classes: {model.names}")
        log.info(f"   Input size: {model.overrides.get('imgsz', 640)}")
        return True

    except Exception as e:
        log.error(f"❌ โมเดลมีปัญหา: {e}")
        return False


def export_onnx(weights_path: Path, imgsz: int = 640, opset: int = 17,
                simplify: bool = True, dynamic: bool = False) -> Path:
    """
    Export best.pt → ONNX
    ONNX ใช้ได้ทุก hardware ไม่ต้องการ GPU
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        log.error("❌ ไม่พบ ultralytics — pip install ultralytics")
        sys.exit(1)

    log.info("📦 Export → ONNX")
    log.info(f"   imgsz={imgsz}, opset={opset}, simplify={simplify}")

    model = YOLO(str(weights_path))
    export_path = model.export(
        format="onnx",
        imgsz=imgsz,
        opset=opset,
        simplify=simplify,
        dynamic=dynamic,
        half=False,         # FP32 (ปลอดภัยกว่า FP16 บน CPU)
    )

    onnx_file = Path(str(weights_path).replace(".pt", ".onnx"))
    if not onnx_file.exists():
        # ค้นหาไฟล์ .onnx ที่ export
        onnx_file = Path(export_path) if export_path else None

    if onnx_file and onnx_file.exists():
        log.info(f"   ✅ ONNX: {onnx_file} ({onnx_file.stat().st_size / 1e6:.1f} MB)")
        return onnx_file
    else:
        log.error("❌ ไม่พบไฟล์ ONNX หลัง export")
        return None


def export_tensorrt(weights_path: Path, imgsz: int = 640,
                    half: bool = True, batch: int = 1,
                    workspace: int = 4) -> Path:
    """
    Export best.pt → TensorRT (.engine)
    ต้องการ: NVIDIA GPU + TensorRT ติดตั้ง (มักมาพร้อม CUDA)
    เร็วกว่า ONNX 3-5x บน GPU
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        log.error("❌ ไม่พบ ultralytics — pip install ultralytics")
        sys.exit(1)

    log.info("⚡ Export → TensorRT (.engine)")
    log.info(f"   imgsz={imgsz}, half={half}, batch={batch}, workspace={workspace}GB")
    log.info("   (อาจใช้เวลา 5-15 นาที...)")

    model = YOLO(str(weights_path))
    export_path = model.export(
        format="engine",
        imgsz=imgsz,
        half=half,           # FP16 (เร็วกว่า, ต้องการ GPU ที่รองรับ)
        batch=batch,
        workspace=workspace,
        simplify=True,
        verbose=True,
    )

    engine_file = Path(str(weights_path).replace(".pt", ".engine"))
    if not engine_file.exists():
        engine_file = Path(export_path) if export_path else None

    if engine_file and engine_file.exists():
        log.info(f"   ✅ TensorRT: {engine_file} ({engine_file.stat().st_size / 1e6:.1f} MB)")
        return engine_file
    else:
        log.error("❌ ไม่พบไฟล์ .engine หลัง export")
        return None


def deploy_model(model_file: Path, target_name: str = None,
                 update_compose: bool = True) -> bool:
    """
    Copy โมเดลไปยัง models/ และอัปเดต docker-compose.yml
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    suffix = model_file.suffix  # .pt, .onnx, .engine

    if target_name is None:
        # สร้างชื่อ backup ก่อนทับ
        target_name = f"vehicle_detector{suffix}"

    dest = MODELS_DIR / target_name
    backup_name = f"vehicle_detector_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}{suffix}"
    backup = MODELS_DIR / backup_name

    # Backup โมเดลเก่า (ถ้ามี)
    if dest.exists():
        shutil.copy2(dest, backup)
        log.info(f"   💾 Backup: {backup}")

    # Copy โมเดลใหม่
    shutil.copy2(model_file, dest)
    log.info(f"   ✅ Deploy: {dest}")

    # อัปเดต VEHICLE_MODEL_PATH ใน docker-compose.yml
    if update_compose and DOCKER_COMPOSE_PATH.exists():
        _update_docker_compose(dest)

    return True


def _update_docker_compose(model_path: Path):
    """อัปเดต VEHICLE_MODEL_PATH ใน docker-compose.yml"""
    try:
        content = DOCKER_COMPOSE_PATH.read_text(encoding="utf-8")
        filename = model_path.name
        docker_path = f"/models/{filename}"

        # แทนที่ VEHICLE_MODEL_PATH ทุกบรรทัด
        import re
        new_content = re.sub(
            r"(VEHICLE_MODEL_PATH:\s*).*",
            f"\\1{docker_path}",
            content
        )

        if new_content != content:
            DOCKER_COMPOSE_PATH.write_text(new_content, encoding="utf-8")
            log.info(f"   ✅ docker-compose.yml อัปเดต VEHICLE_MODEL_PATH={docker_path}")
        else:
            log.warning("   ⚠️ ไม่พบ VEHICLE_MODEL_PATH ใน docker-compose.yml")

    except Exception as e:
        log.error(f"   ❌ ไม่สามารถอัปเดต docker-compose.yml: {e}")


def test_deployed_model(model_path: Path):
    """ทดสอบโมเดลที่ deploy แล้ว"""
    try:
        from ultralytics import YOLO
        import numpy as np
        import time

        log.info(f"\n🧪 ทดสอบโมเดลที่ deploy: {model_path}")
        model = YOLO(str(model_path))

        dummy = np.random.randint(0, 255, (640, 640, 3), dtype="uint8")

        # Warmup
        for _ in range(3):
            model.predict(dummy, verbose=False, conf=0.25, classes=[0])

        # Benchmark
        times = []
        for _ in range(10):
            t0 = time.perf_counter()
            model.predict(dummy, verbose=False, conf=0.25, classes=[0])
            times.append((time.perf_counter() - t0) * 1000)

        avg_ms = sum(times) / len(times)
        log.info(f"   ✅ Inference: {avg_ms:.1f}ms / frame ({1000/avg_ms:.0f} FPS max)")
        log.info(f"   Classes: {model.names}")

    except Exception as e:
        log.error(f"   ❌ ทดสอบล้มเหลว: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Export YOLOv8 weights และ Deploy ไปยัง models/",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument("--weights", required=True,
                        help="Path ไปยัง best.pt (จาก runs/train/.../weights/best.pt)")
    parser.add_argument("--format", choices=["onnx", "engine", "pt"],
                        default="onnx",
                        help="รูปแบบ export: onnx=CPU/GPU ทั่วไป, engine=TensorRT GPU เร็วสุด")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="ขนาดภาพ (ต้องเท่ากับตอนเทรน)")
    parser.add_argument("--deploy", action="store_true",
                        help="Copy โมเดลไปยัง models/ อัตโนมัติ")
    parser.add_argument("--deploy-name", default=None,
                        help="ชื่อไฟล์ปลายทาง เช่น vehicle_detector.onnx")
    parser.add_argument("--validate", action="store_true", default=True,
                        help="ทดสอบโมเดลก่อน export")
    parser.add_argument("--no-validate", action="store_false", dest="validate")
    parser.add_argument("--test-after-deploy", action="store_true",
                        help="ทดสอบโมเดลหลัง deploy")
    # TensorRT options
    parser.add_argument("--half", action="store_true", default=True,
                        help="TensorRT FP16 (เร็วกว่า, ต้องการ GPU)")
    parser.add_argument("--workspace", type=int, default=4,
                        help="TensorRT workspace (GB)")

    args = parser.parse_args()

    weights_path = Path(args.weights)

    if not weights_path.exists():
        log.error(f"❌ ไม่พบไฟล์ weights: {weights_path}")
        sys.exit(1)

    log.info("=" * 60)
    log.info("🚀 Export และ Deploy YOLOv8 Vehicle Detector")
    log.info("=" * 60)
    log.info(f"  Weights : {weights_path}")
    log.info(f"  Format  : {args.format}")
    log.info(f"  imgsz   : {args.imgsz}")
    log.info("=" * 60)

    # Validate ก่อน
    if args.validate:
        if not validate_model(weights_path):
            log.error("❌ โมเดลมีปัญหา — หยุด export")
            sys.exit(1)

    # Export
    exported_file = None

    if args.format == "pt":
        exported_file = weights_path
        log.info("   ใช้ไฟล์ .pt โดยตรง (ไม่ต้อง export)")

    elif args.format == "onnx":
        exported_file = export_onnx(weights_path, imgsz=args.imgsz)

    elif args.format == "engine":
        exported_file = export_tensorrt(
            weights_path,
            imgsz=args.imgsz,
            half=args.half,
            workspace=args.workspace,
        )

    if exported_file is None:
        log.error("❌ Export ล้มเหลว")
        sys.exit(1)

    log.info(f"\n✅ Export สำเร็จ: {exported_file}")

    # Deploy
    if args.deploy:
        log.info("\n📤 Deploy ไปยัง models/...")
        success = deploy_model(exported_file, target_name=args.deploy_name)

        if success and args.test_after_deploy:
            deploy_name = args.deploy_name or f"vehicle_detector{exported_file.suffix}"
            test_deployed_model(MODELS_DIR / deploy_name)

        log.info("\n🎉 เสร็จสมบูรณ์!")
        log.info("   ขั้นตอนถัดไป:")
        log.info("   docker compose up -d --build backend")
    else:
        log.info("\n💡 ถ้าพอใจกับโมเดล รัน:")
        log.info(f"   python scripts/export_model.py --weights {weights_path} "
                 f"--format {args.format} --deploy")
        log.info("   แล้ว: docker compose up -d --build backend")


if __name__ == "__main__":
    main()
