# Fine-tune YOLOv8 สำหรับ Vehicle Detection (ALPR System)

## ทำไมต้อง Fine-tune?

โมเดลสำเร็จรูป `yolov8n.pt` เทรนด้วย COCO Dataset ซึ่งมีภาพหลากหลายมาก
สภาพแวดล้อมจริงของเรา (มุมกล้องกดลง, กลางคืน, แสงไฟหน้ารถ) แตกต่างจาก COCO
→ Fine-tune ด้วยภาพจากกล้องตัวนั้นจริงๆ จะแม่นกว่ามาก

---

## ขั้นตอนทั้งหมด

### Step 1: สกัดภาพจากกล้อง RTSP

```bash
# จาก RTSP Stream โดยตรง (แนะนำ — ได้ภาพจากสภาพแวดล้อมจริง)
python scripts/extract_frames.py \
  --source rtsp://admin:password@192.168.1.100:554/stream1 \
  --output dataset/images/raw \
  --interval 1.5 \
  --duration 300 \
  --prefix morning

# เก็บช่วงกลางคืนด้วย (สำคัญ!)
python scripts/extract_frames.py \
  --source rtsp://admin:password@192.168.1.100:554/stream1 \
  --output dataset/images/raw \
  --interval 1.5 \
  --duration 300 \
  --prefix night

# จากไฟล์วิดีโอที่บันทึกไว้
python scripts/extract_frames.py \
  --source ./recordings/ \
  --output dataset/images/raw \
  --interval 1.0
```

**เป้าหมาย:** 300-500 ภาพ คละเวลา เช้า/บ่าย/กลางคืน

---

### Step 2: Label ภาพ (ตีกรอบรถ)

#### Option A: Roboflow (แนะนำมากที่สุด — ฟรี)

1. ไปที่ https://app.roboflow.com → สร้าง Project ใหม่
2. เลือก **Object Detection**
3. Upload ภาพจาก `dataset/images/raw/`
4. ตีกรอบรถทุกคัน class = `car`
5. Export → Format: **YOLOv8** → Download ZIP
6. แตก ZIP → วางไว้ที่ `dataset/`

```
dataset/
├── images/
│   ├── train/
│   └── val/
└── labels/
    ├── train/
    └── val/
```

#### Option B: LabelImg (Offline)

```bash
pip install labelImg
labelImg dataset/images/raw  dataset/labels/raw
# เลือก Format: YOLO, Class: car
```

แล้วรัน split:
```bash
python scripts/train_vehicle_detector.py split \
  --raw-dir dataset/raw \
  --output-dir dataset
```

---

### Step 3: เทรนโมเดล

```bash
# ตรวจสอบ dataset ก่อน
python scripts/train_vehicle_detector.py check \
  --data scripts/training/data.yaml

# เทรน (GPU) — ~30-60 นาที
python scripts/train_vehicle_detector.py train \
  --data scripts/training/data.yaml \
  --epochs 100 \
  --device 0

# เทรน (CPU) — ช้ากว่า ใช้ epochs น้อยลง
python scripts/train_vehicle_detector.py train \
  --data scripts/training/data.yaml \
  --epochs 50 \
  --device cpu \
  --batch 8
```

**ผลที่ได้:** `runs/train/vehicle_detector_YYYYMMDD_HHMM/weights/best.pt`

---

### Step 4: Export และ Deploy

```bash
# Export เป็น ONNX (ใช้ CPU/GPU)
python scripts/export_model.py \
  --weights runs/train/vehicle_detector_XXXXX/weights/best.pt \
  --format onnx \
  --deploy

# หรือ Export เป็น TensorRT (GPU เท่านั้น, เร็วกว่า 3-5x)
python scripts/export_model.py \
  --weights runs/train/vehicle_detector_XXXXX/weights/best.pt \
  --format engine \
  --deploy
```

สคริปต์จะอัปเดต `docker-compose.yml` ให้อัตโนมัติ

---

### Step 5: Rebuild และ Test

```bash
# Rebuild backend
docker compose up -d --build backend

# ดู logs
docker compose logs -f backend | grep -E "Custom|COCO|classes|vehicle"
```

ถ้าโมเดลถูกโหลดถูกต้องจะเห็น:
```
🚗 Custom single-class model (nc=1) → classes=[0] (car)
```

---

## ค่า mAP ที่ดี

| ค่า | ความหมาย |
|-----|----------|
| mAP50 < 0.70 | ไม่ดี — ต้องเพิ่มภาพหรือ label ใหม่ |
| mAP50 0.70-0.85 | ใช้ได้ |
| mAP50 > 0.85 | ดีมาก ✅ |
| mAP50 > 0.90 | ยอดเยี่ยม 🎉 |

---

## Tips

- **ยิ่งภาพหลากหลายยิ่งดี**: รวมช่วงเวลา กลางวัน/กลางคืน, ฝน, หมอก
- **Label ให้ครบ**: อย่าลืม label รถที่อยู่ไกล หรือถูกบัง บางส่วน
- **อย่า label สิ่งที่ไม่ใช่รถ**: ป้าย, คน, รถจักรยาน → ทำให้ False Positive สูง
- **ใช้ Augmentation**: hsv_v=0.4 ช่วยให้โมเดลทนต่อแสงมืด/สว่าง
- **เทรนบน GPU เสมอ** ถ้าเป็นไปได้ (เร็วกว่า CPU 10-50x)
