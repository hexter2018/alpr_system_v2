# worker/alpr_worker/tasks.py
import os
import time
import json
import hashlib
import shutil
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker
import cv2
import re
import logging
from .celery_app import celery_app
from .rtsp_control import should_stop  # worker/rtsp_control.py

from .inference.detector import PlateDetector
from .inference.ocr import PlateOCR  # ใช้ OCR / parser ที่คุณมีอยู่แล้ว
from .inference.master_lookup import assist_with_master
from .inference.validate import classify_plate_type
from .dt import now_bkk

log = logging.getLogger(__name__)


# ----------------------------
# Env
# ----------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://alpr:alpr@postgres:5432/alpr")
STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))
MASTER_CONF_THRESHOLD = float(os.getenv("MASTER_CONF_THRESHOLD", "0.95"))
FEEDBACK_EXPORT_LIMIT = int(os.getenv("FEEDBACK_EXPORT_LIMIT", "200"))
TRAINING_DIR = Path(os.getenv("TRAINING_DIR", str(STORAGE_DIR / "training")))

# Below this confidence the province returned by OCR is unreliable;
# we leave it blank and let the human reviewer fill it in manually.
PROVINCE_CONF_THRESHOLD = float(os.getenv("PROVINCE_CONF_THRESHOLD", "0.45"))

# RTSP defaults
DEFAULT_RTSP_FPS = float(os.getenv("RTSP_FPS", "2.0"))
DEFAULT_RECONNECT_SEC = float(os.getenv("RTSP_RECONNECT_SEC", "2.0"))

# RTSP exponential backoff parameters
_RTSP_BACKOFF_BASE = float(os.getenv("RTSP_BACKOFF_BASE", "2.0"))
_RTSP_BACKOFF_MAX  = float(os.getenv("RTSP_BACKOFF_MAX",  "120.0"))
_RTSP_BACKOFF_EXP  = float(os.getenv("RTSP_BACKOFF_EXP",  "2.0"))

# Telegram (worker-side — used by send_telegram_alert task)
_TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
_TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "original").mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "crops").mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "debug").mkdir(parents=True, exist_ok=True)
TRAINING_DIR.mkdir(parents=True, exist_ok=True)


# ----------------------------
# DB
# ----------------------------
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def now_utc():
    """Deprecated alias – returns a Bangkok-aware datetime."""
    return now_bkk()


# ----------------------------
# Singletons
# ----------------------------
_detector: Optional[PlateDetector] = None
_ocr: Optional[PlateOCR] = None


def get_detector() -> PlateDetector:
    global _detector
    if _detector is None:
        _detector = PlateDetector()
    return _detector


def get_ocr() -> PlateOCR:
    global _ocr
    if _ocr is None:
        _ocr = PlateOCR()
    return _ocr


def norm_plate_text(s: str) -> str:
    if not s:
        return ""
    s = s.strip().upper()
    s = s.translate(str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789"))
    s = re.sub(r"[\s\-\.]", "", s)  # remove space/dash/dot
    return s

@celery_app.task(name="tasks.process_capture")
def process_capture(capture_id: int, image_path: str):
    log.info("🚀 TASK STARTED: capture_id=%s, image_path=%s", capture_id, image_path)
    img_path = Path(image_path)

    if not img_path.exists():
        return {"ok": False, "error": "image not found", "image_path": image_path}

    detector = get_detector()
    ocr = get_ocr()

    db = SessionLocal()
    try:
        # 1) detect + crop
        det = detector.detect_and_crop(str(img_path))
        crop_path = det.crop_path

        # 2) OCR
        o = ocr.read_plate(crop_path, debug_dir=STORAGE_DIR / "debug", debug_id=str(capture_id))
        plate_text = (o.plate_text or "").strip()
        province = (o.province or "").strip()
        conf = float(o.confidence or 0.0)
        raw = o.raw or {}

        plate_text_norm = norm_plate_text(plate_text)

        assisted = assist_with_master(db, plate_text, province, conf)
        plate_text = assisted["plate_text"]
        plate_text_norm = assisted["plate_text_norm"]
        province = assisted["province"]
        conf = float(assisted["confidence"])

        # ── Province confidence gate ──────────────────────────────────────
        # When OCR confidence is below the threshold the province prediction
        # is unreliable.  Clear it so the human reviewer fills it in rather
        # than persisting a wrong value (e.g. "สุราษฎร์ธานี" at 24 %).
        if conf < PROVINCE_CONF_THRESHOLD and province:
            log.info(
                "Skipping province auto-fill for capture_id=%s: "
                "confidence %.2f < threshold %.2f (was: %r)",
                capture_id, conf, PROVINCE_CONF_THRESHOLD, province,
            )
            province = ""

        # ── Classify plate type ───────────────────────────────────────────
        plate_type = classify_plate_type(plate_text_norm)

        if conf < 0.6:
            log.warning(
                "Low OCR confidence for capture_id=%s variant=%s candidates=%s",
                capture_id,
                raw.get("chosen_variant"),
                raw.get("candidates"),
            )


        # 3) INSERT detections (เก็บข้อมูล detection/crop/meta ที่นี่)
        # *** IMPORTANT: ต้องให้ตรงกับ schema ของ table detections ของคุณ ***
        # ถ้าชื่อ column ใน detections ไม่ตรง ให้รัน: \d detections แล้วผมจะปรับให้เป๊ะ
        sql_ins_det = text("""
            INSERT INTO detections (
                capture_id,
                crop_path,
                det_conf,
                bbox
            )
            VALUES (
                :capture_id,
                :crop_path,
                :det_conf,
                :bbox
            )
            RETURNING id
        """)

        detection_id = db.execute(sql_ins_det, {
            "capture_id": int(capture_id),
            "crop_path": str(crop_path),
            "det_conf": float(det.det_conf),
            "bbox": json.dumps(det.bbox or {}, ensure_ascii=False),  # bbox เป็น text
        }).scalar_one()

        # 4) INSERT plate_reads (ตาม schema จริง)
        sql_ins_read = text("""
            INSERT INTO plate_reads (
                detection_id,
                plate_text,
                plate_text_norm,
                province,
                plate_type,
                confidence,
                status,
                created_at
            )
            VALUES (
                :detection_id,
                :plate_text,
                :plate_text_norm,
                :province,
                :plate_type,
                :confidence,
                :status,
                :created_at
            )
            RETURNING id
        """)

        read_id = db.execute(sql_ins_read, {
            "detection_id": int(detection_id),
            "plate_text": (plate_text[:32] if plate_text else ""),
            "plate_text_norm": (plate_text_norm[:32] if plate_text_norm else ""),
            "province": (province[:64] if province else ""),
            "plate_type": plate_type,
            "confidence": conf,
            "status": "PENDING",  # enum readstatus
            "created_at": datetime.now(timezone.utc),
        }).scalar_one()

        db.commit()

        # 5) master logic (ใช้ plate_text_norm เป็น key จะนิ่งกว่า)
        if conf >= MASTER_CONF_THRESHOLD and plate_text_norm:
            sql_upsert_master = text("""
                INSERT INTO master_plates (
                    plate_text_norm,
                    display_text,
                    province,
                    confidence,
                    last_seen,
                    count_seen,
                    editable
                )
                VALUES (
                    :plate_text_norm,
                    :display_text,
                    :province,
                    :confidence,
                    :last_seen,
                    :count_seen,
                    :editable
                )
                ON CONFLICT (plate_text_norm)
                DO UPDATE SET
                    display_text = CASE
                        WHEN master_plates.display_text = '' AND EXCLUDED.display_text <> '' THEN EXCLUDED.display_text
                        ELSE master_plates.display_text
                    END,
                    province = CASE
                        WHEN EXCLUDED.province <> '' THEN EXCLUDED.province
                        ELSE master_plates.province
                    END,
                    confidence = GREATEST(master_plates.confidence, EXCLUDED.confidence),
                    last_seen = EXCLUDED.last_seen,
                    count_seen = master_plates.count_seen + 1
            """)
            db.execute(sql_upsert_master, {
                "plate_text_norm": plate_text_norm,
                "display_text": (plate_text[:32] if plate_text else plate_text_norm),
                "province": province,
                "confidence": conf,
                "last_seen": now_utc(),
                "count_seen": 1,
                "editable": True,
            })
            db.commit()

        # ── Watchlist check ───────────────────────────────────────────────────
        # After the read is stored, check if this plate is on the watchlist.
        # On a match: insert an Alert row and dispatch a Telegram notification
        # as a separate task so inference latency is not affected.
        watchlist_alert_id: Optional[int] = None
        watchlist_match_info: Dict[str, Any] = {}
        if plate_text_norm:
            try:
                sql_wl = text("""
                    SELECT w.id, w.list_type, w.alert_level, w.reason
                    FROM watchlist w
                    WHERE w.plate_text_norm = :norm
                      AND w.active = TRUE
                      AND (w.expires_at IS NULL OR w.expires_at > NOW())
                    LIMIT 1
                """)
                wl_row = db.execute(sql_wl, {"norm": plate_text_norm}).mappings().fetchone()
                if wl_row:
                    # Look up camera name for the alert message
                    cam_name_row = db.execute(
                        text("SELECT name FROM cameras WHERE camera_id = :cid LIMIT 1"),
                        {"cid": str(capture_id)},  # capture camera_id
                    ).fetchone()
                    # Get actual camera_id from capture row
                    cap_row = db.execute(
                        text("SELECT camera_id FROM captures WHERE id = :cid LIMIT 1"),
                        {"cid": int(capture_id)},
                    ).mappings().fetchone()
                    cap_camera_id = cap_row["camera_id"] if cap_row else None
                    cam_name_row2 = db.execute(
                        text("SELECT name FROM cameras WHERE camera_id = :cid LIMIT 1"),
                        {"cid": cap_camera_id or ""},
                    ).fetchone()
                    camera_name = cam_name_row2[0] if cam_name_row2 else (cap_camera_id or "Unknown")

                    sql_ins_alert = text("""
                        INSERT INTO alerts
                            (read_id, watchlist_id, camera_id, alert_level)
                        VALUES
                            (:read_id, :watchlist_id, :camera_id, :alert_level)
                        RETURNING id
                    """)
                    watchlist_alert_id = db.execute(sql_ins_alert, {
                        "read_id":      int(read_id),
                        "watchlist_id": int(wl_row["id"]),
                        "camera_id":    cap_camera_id,
                        "alert_level":  wl_row["alert_level"],
                    }).scalar_one()
                    db.commit()

                    watchlist_match_info = {
                        "list_type":   wl_row["list_type"],
                        "alert_level": wl_row["alert_level"],
                        "reason":      wl_row["reason"] or "",
                        "camera_name": camera_name,
                    }

                    # Dispatch Telegram notification as a separate Celery task
                    send_telegram_alert.delay(
                        alert_id=int(watchlist_alert_id),
                        read_id=int(read_id),
                        crop_path=str(crop_path),
                        plate_text=plate_text,
                        province=province,
                        camera_name=camera_name,
                        alert_level=wl_row["alert_level"],
                        list_type=wl_row["list_type"],
                        reason=wl_row["reason"] or "",
                    )
                    log.info(
                        "[watchlist] Match found for %r → %s alert (id=%d)",
                        plate_text_norm, wl_row["alert_level"], watchlist_alert_id,
                    )
            except Exception as wl_exc:
                log.error("[watchlist] Check failed: %s", wl_exc, exc_info=True)

        return {
            "ok": True,
            "capture_id": int(capture_id),
            "detection_id": int(detection_id),
            "read_id": int(read_id),
            "plate_text": plate_text,
            "plate_text_norm": plate_text_norm,
            "province": province,
            "plate_type": plate_type,
            "confidence": conf,
            "master_assisted": assisted.get("assisted", False),
            "crop_path": str(crop_path),
            "watchlist_alert_id": watchlist_alert_id,
            "watchlist_match": watchlist_match_info,
            "plate_candidates": raw.get("plate_candidates", []),
            "province_candidates": raw.get("province_candidates", []),
            "consensus_metrics": raw.get("consensus_metrics", {}),
            "confidence_flags": raw.get("confidence_flags", []),
            "debug_flags": raw.get("debug_flags", []),
            "debug_artifacts": raw.get("debug_artifacts", {}),
        }

    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e), "capture_id": capture_id, "image_path": image_path}
    finally:
        db.close()


@celery_app.task(name="tasks.export_feedback_samples")
def export_feedback_samples(limit: int = FEEDBACK_EXPORT_LIMIT):
    """
    Export MLPR feedback samples into a training manifest.
    - Copies crop images into TRAINING_DIR/images
    - Writes TRAINING_DIR/manifest.jsonl
    - Marks samples as used_in_train=True
    """
    images_dir = TRAINING_DIR / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = TRAINING_DIR / "manifest.jsonl"

    db = SessionLocal()
    try:
        sql_fetch = text("""
            SELECT id, crop_path, corrected_text, corrected_province
            FROM feedback_samples
            WHERE used_in_train = false
            ORDER BY created_at ASC
            LIMIT :limit
        """)
        rows = db.execute(sql_fetch, {"limit": int(limit)}).mappings().all()
        if not rows:
            return {"ok": True, "exported": 0}

        with manifest_path.open("a", encoding="utf-8") as f:
            for row in rows:
                src = Path(row["crop_path"])
                if not src.exists():
                    continue
                dst = images_dir / f"feedback_{row['id']}{src.suffix or '.jpg'}"
                if not dst.exists():
                    shutil.copy2(src, dst)
                record = {
                    "image": str(dst),
                    "plate_text": row["corrected_text"],
                    "province": row["corrected_province"],
                    "source": "MLPR",
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        sql_mark = text("""
            UPDATE feedback_samples
            SET used_in_train = true
            WHERE id = ANY(:ids)
        """)
        db.execute(sql_mark, {"ids": [int(r["id"]) for r in rows]})
        db.commit()
        return {"ok": True, "exported": len(rows), "manifest": str(manifest_path)}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


# ----------------------------
# Telegram alert task
# ----------------------------
@celery_app.task(
    name="tasks.send_telegram_alert",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def send_telegram_alert(
    self,
    *,
    alert_id: int,
    read_id: int,
    crop_path: str,
    plate_text: str,
    province: str,
    camera_name: str,
    alert_level: str,
    list_type: str,
    reason: str = "",
):
    """
    Send a Telegram photo alert for a watchlist match.
    Retries up to 3 times on network errors with 10-second delay.
    Marks alerts.telegram_sent = TRUE on success.
    """
    if not _TELEGRAM_BOT_TOKEN or not _TELEGRAM_CHAT_ID:
        log.debug("[telegram] Not configured — skipping alert id=%d", alert_id)
        return {"ok": False, "reason": "not_configured"}

    _EMOJI = {"LOW": "ℹ️", "MEDIUM": "⚠️", "HIGH": "🚨", "CRITICAL": "🔴"}
    _LABEL = {"BLACKLIST": "🚫 BLACKLIST", "WHITELIST": "✅ WHITELIST", "VIP": "⭐ VIP"}

    emoji      = _EMOJI.get(alert_level.upper(), "⚠️")
    list_label = _LABEL.get(list_type.upper(), list_type)
    province_s = f"\nจังหวัด: {province}" if province else ""
    reason_s   = f"\nหมายเหตุ: {reason}" if reason else ""

    caption = (
        f"{emoji} {list_label} MATCH\n"
        f"ทะเบียน: {plate_text}{province_s}\n"
        f"กล้อง: {camera_name}"
        f"{reason_s}\nRead ID: #{read_id}"
    )

    api_base = f"https://api.telegram.org/bot{_TELEGRAM_BOT_TOKEN}"
    try:
        crop_file = Path(crop_path)
        if crop_file.exists():
            with open(crop_file, "rb") as f:
                resp = requests.post(
                    f"{api_base}/sendPhoto",
                    data={"chat_id": _TELEGRAM_CHAT_ID, "caption": caption},
                    files={"photo": (crop_file.name, f, "image/jpeg")},
                    timeout=15,
                )
        else:
            resp = requests.post(
                f"{api_base}/sendMessage",
                json={"chat_id": _TELEGRAM_CHAT_ID, "text": caption},
                timeout=15,
            )

        if resp.status_code != 200:
            log.warning("[telegram] API %d: %s", resp.status_code, resp.text[:200])
            raise ValueError(f"Telegram API returned {resp.status_code}")

        # Mark telegram_sent in DB
        db = SessionLocal()
        try:
            db.execute(
                text("UPDATE alerts SET telegram_sent = TRUE WHERE id = :id"),
                {"id": alert_id},
            )
            db.commit()
        finally:
            db.close()

        log.info("[telegram] Alert sent for plate=%r alert_id=%d", plate_text, alert_id)
        return {"ok": True, "alert_id": alert_id}

    except Exception as exc:
        log.error("[telegram] Failed: %s — retrying", exc)
        raise self.retry(exc=exc)


# ----------------------------
# RTSP ingest task
# ----------------------------
@celery_app.task(name="tasks.rtsp_ingest")
def rtsp_ingest(camera_id: str, rtsp_url: str, fps: float = DEFAULT_RTSP_FPS, reconnect_sec: float = DEFAULT_RECONNECT_SEC):
    """
    Long-running RTSP ingest:
    - Reads stream via OpenCV FFmpeg backend
    - Samples frames at target fps
    - Saves frame -> inserts captures row -> enqueue process_capture
    - Stops when Redis stop flag is set (rtsp:stop:{camera_id} == 1)
    """

    fps = float(fps or DEFAULT_RTSP_FPS)
    interval = 1.0 / max(fps, 0.1)

    cap = None
    last_ts = 0.0
    _connect_attempt = 0   # for exponential backoff

    while True:
        # stop flag
        if should_stop(camera_id):
            if cap is not None:
                cap.release()
            return {"ok": True, "stopped": True, "camera_id": camera_id}

        # ── Open / reopen stream with exponential backoff ─────────────────
        if cap is None or not cap.isOpened():
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                wait = min(
                    _RTSP_BACKOFF_BASE * (_RTSP_BACKOFF_EXP ** _connect_attempt),
                    _RTSP_BACKOFF_MAX,
                )
                log.warning(
                    "[rtsp:%s] Cannot open stream — retry in %.0fs (attempt %d)",
                    camera_id, wait, _connect_attempt + 1,
                )
                time.sleep(wait)
                _connect_attempt += 1
                continue
            # Successful connection — reset backoff counter
            _connect_attempt = 0
            log.info("[rtsp:%s] Stream opened (backoff reset)", camera_id)

        ok, frame = cap.read()
        if not ok or frame is None:
            # Frame read failed — reconnect with backoff
            cap.release()
            cap = None
            wait = min(
                _RTSP_BACKOFF_BASE * (_RTSP_BACKOFF_EXP ** _connect_attempt),
                _RTSP_BACKOFF_MAX,
            )
            log.warning(
                "[rtsp:%s] Frame read failed — reconnect in %.0fs (attempt %d)",
                camera_id, wait, _connect_attempt + 1,
            )
            time.sleep(wait)
            _connect_attempt += 1
            continue

        now = time.time()
        if (now - last_ts) < interval:
            continue
        last_ts = now

        # save frame
        ts = now_bkk().strftime("%Y%m%d_%H%M%S_%f")
        out_path = STORAGE_DIR / "original" / f"rtsp_{camera_id}_{ts}.jpg"
        cv2.imwrite(str(out_path), frame)

        # insert capture
        db = SessionLocal()
        try:
            digest = sha256_file(out_path)

            sql_ins_cap = text("""
                INSERT INTO captures (
                    source,
                    camera_id,
                    captured_at,
                    original_path,
                    sha256
                )
                VALUES (
                    :source,
                    :camera_id,
                    :captured_at,
                    :original_path,
                    :sha256
                )
                RETURNING id
            """)

            cap_id = db.execute(sql_ins_cap, {
                "source": "RTSP",
                "camera_id": camera_id,
                "captured_at": now_utc(),
                "original_path": str(out_path),
                "sha256": digest,
            }).scalar_one()
            db.commit()

            # enqueue processing
            process_capture.delay(int(cap_id), str(out_path))

        except Exception:
            db.rollback()
        finally:
            db.close()
