"""
Extract Frames from RTSP Stream or Video Files for YOLOv8 Fine-tuning
======================================================================
ใช้สกัดภาพนิ่งจากกล้อง RTSP หรือไฟล์วิดีโอ เพื่อสร้าง Dataset สำหรับ Fine-tune YOLOv8

Usage:
  # จาก RTSP Stream (แนะนำ)
  python extract_frames.py --source rtsp://admin:pass@192.168.1.100:554/stream1 --output dataset/images/raw --interval 2.0 --duration 300

  # จากไฟล์วิดีโอ
  python extract_frames.py --source ./recordings/morning.mp4 --output dataset/images/raw --interval 1.0

  # หลายไฟล์พร้อมกัน (batch)
  python extract_frames.py --source ./recordings/ --output dataset/images/raw --interval 1.5
"""

import cv2
import os
import time
import argparse
import hashlib
import logging
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def compute_frame_hash(frame) -> str:
    """คำนวณ hash ของภาพ เพื่อป้องกันบันทึกภาพซ้ำ"""
    import numpy as np
    # ย่อภาพก่อน hash เพื่อความเร็ว
    small = cv2.resize(frame, (64, 36))
    return hashlib.md5(small.tobytes()).hexdigest()


def extract_from_source(source: str, output_dir: Path, interval_sec: float,
                         duration_sec: float = 0, prefix: str = "frame",
                         min_brightness: int = 20, dedup: bool = True) -> int:
    """
    สกัดภาพจาก source (RTSP URL หรือไฟล์วิดีโอ)

    Args:
        source: RTSP URL หรือ path ไฟล์วิดีโอ
        output_dir: โฟลเดอร์บันทึกภาพ
        interval_sec: ช่วงห่างระหว่างภาพ (วินาที)
        duration_sec: จับภาพนานแค่ไหน (0 = ทั้งหมด)
        prefix: ชื่อขึ้นต้นของไฟล์
        min_brightness: ค่าความสว่างขั้นต่ำ (กรองภาพมืดเกิน)
        dedup: กรองภาพซ้ำด้วย hash

    Returns:
        จำนวนภาพที่บันทึก
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    is_rtsp = str(source).startswith("rtsp://") or str(source).startswith("rtmp://")

    if is_rtsp:
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"
        log.info(f"🎥 เชื่อมต่อ RTSP: {source}")
    else:
        log.info(f"📹 อ่านวิดีโอ: {source}")

    cap = cv2.VideoCapture(str(source), cv2.CAP_FFMPEG if is_rtsp else cv2.CAP_ANY)

    if not cap.isOpened():
        log.error(f"❌ ไม่สามารถเปิด source: {source}")
        return 0

    # ดึงข้อมูลวิดีโอ
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if not is_rtsp else 0

    log.info(f"   ขนาดภาพ: {width}x{height}, FPS: {fps:.1f}")
    if total_frames > 0:
        total_sec = total_frames / fps
        log.info(f"   ความยาววิดีโอ: {total_sec:.0f} วินาที ({total_frames} frames)")

    # คำนวณ frame interval
    frame_interval = max(1, int(fps * interval_sec))
    log.info(f"   บันทึกทุก {interval_sec:.1f}s ({frame_interval} frames)")

    saved_count = 0
    frame_idx = 0
    start_time = time.time()
    seen_hashes = set()

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            # ตรวจสอบเวลา
            if duration_sec > 0:
                elapsed = time.time() - start_time
                if elapsed >= duration_sec:
                    log.info(f"⏱️ ครบเวลา {duration_sec:.0f}s")
                    break

            # บันทึกทุก frame_interval frames
            if frame_idx % frame_interval == 0:

                # กรองภาพมืดเกิน (เช่น กล้องปิด)
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                brightness = gray.mean()
                if brightness < min_brightness:
                    log.debug(f"   ข้ามภาพมืด (brightness={brightness:.0f})")
                    frame_idx += 1
                    continue

                # กรองภาพซ้ำ
                if dedup:
                    fhash = compute_frame_hash(frame)
                    if fhash in seen_hashes:
                        log.debug(f"   ข้ามภาพซ้ำ (hash={fhash[:8]})")
                        frame_idx += 1
                        continue
                    seen_hashes.add(fhash)

                # บันทึกภาพ
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:21]
                filename = f"{prefix}_{timestamp}_{frame_idx:06d}.jpg"
                filepath = output_dir / filename

                # บันทึกด้วย quality สูง
                cv2.imwrite(str(filepath), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                saved_count += 1

                if saved_count % 50 == 0:
                    log.info(f"   📸 บันทึกแล้ว {saved_count} ภาพ...")

            frame_idx += 1

    finally:
        cap.release()

    log.info(f"✅ บันทึกทั้งหมด {saved_count} ภาพ → {output_dir}")
    return saved_count


def main():
    parser = argparse.ArgumentParser(
        description="สกัดภาพจาก RTSP Stream / วิดีโอ สำหรับ Fine-tune YOLOv8",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument("--source", required=True,
                        help="RTSP URL, ไฟล์วิดีโอ (.mp4/.avi) หรือโฟลเดอร์วิดีโอ")
    parser.add_argument("--output", default="dataset/images/raw",
                        help="โฟลเดอร์ปลายทาง")
    parser.add_argument("--interval", type=float, default=1.5,
                        help="บันทึกภาพทุกกี่วินาที (ยิ่งน้อย = ภาพเยอะ = เทรนแม่นขึ้น)")
    parser.add_argument("--duration", type=float, default=0,
                        help="จับภาพนานแค่ไหน (วินาที) 0=ทั้งหมด")
    parser.add_argument("--prefix", default="cam",
                        help="ชื่อขึ้นต้นของไฟล์ภาพ เช่น cam01, night, morning")
    parser.add_argument("--min-brightness", type=int, default=20,
                        help="ความสว่างขั้นต่ำ (0-255) กรองภาพมืดออก")
    parser.add_argument("--no-dedup", action="store_true",
                        help="ปิดการกรองภาพซ้ำ")
    parser.add_argument("--target", type=int, default=500,
                        help="จำนวนภาพเป้าหมาย (จะหยุดเมื่อได้ครบ)")

    args = parser.parse_args()

    source_path = Path(args.source)
    output_dir = Path(args.output)

    # ถ้า source เป็นโฟลเดอร์ → batch ทุกไฟล์วิดีโอในโฟลเดอร์
    if source_path.is_dir():
        video_exts = {".mp4", ".avi", ".mkv", ".mov", ".ts", ".m4v"}
        video_files = [f for f in source_path.rglob("*") if f.suffix.lower() in video_exts]

        if not video_files:
            log.error(f"❌ ไม่พบไฟล์วิดีโอใน {source_path}")
            return

        log.info(f"📂 พบ {len(video_files)} ไฟล์วิดีโอ")
        total = 0

        for video_file in sorted(video_files):
            log.info(f"\n─── {video_file.name} ───")
            prefix = video_file.stem
            count = extract_from_source(
                source=str(video_file),
                output_dir=output_dir,
                interval_sec=args.interval,
                duration_sec=args.duration,
                prefix=prefix,
                min_brightness=args.min_brightness,
                dedup=not args.no_dedup
            )
            total += count
            if total >= args.target:
                log.info(f"🎯 ได้ครบ {total} ภาพแล้ว (เป้าหมาย {args.target})")
                break

        log.info(f"\n🎉 รวมทั้งหมด: {total} ภาพ → {output_dir}")

    else:
        # Single source (RTSP หรือไฟล์เดียว)
        extract_from_source(
            source=str(args.source),
            output_dir=output_dir,
            interval_sec=args.interval,
            duration_sec=args.duration,
            prefix=args.prefix,
            min_brightness=args.min_brightness,
            dedup=not args.no_dedup
        )


if __name__ == "__main__":
    main()
