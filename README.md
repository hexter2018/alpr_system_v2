<p align="center">
  <h1 align="center">🇹🇭 Thai ALPR System V2</h1>
  <p align="center">
    Production-ready Thai Automatic License Plate Recognition (ALPR) platform for high-throughput image processing, GPU-accelerated inference, and operational monitoring.
  </p>
  <p align="center">
    <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" />
    <img alt="React" src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=000" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" />
    <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white" />
    <img alt="Celery" src="https://img.shields.io/badge/Celery-37814A?logo=celery&logoColor=white" />
    <img alt="Redis" src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white" />
    <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" />
    <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" />
    <img alt="Nginx" src="https://img.shields.io/badge/Nginx-009639?logo=nginx&logoColor=white" />
    <img alt="TensorRT" src="https://img.shields.io/badge/TensorRT-76B900?logo=nvidia&logoColor=white" />
    <img alt="YOLOv8" src="https://img.shields.io/badge/YOLOv8-111827?logo=pytorch&logoColor=white" />
    <img alt="License: GPL-3.0" src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" />
  </p>
</p>

---

## ✨ What is this?

Thai ALPR System V2 is a Dockerized full-stack platform for processing **uploaded vehicle images**, detecting Thai license plates, performing OCR, and managing results through a modern operational dashboard.

It has evolved from a starter project into a modular, production-oriented architecture:

- **Backend API (FastAPI):** camera/master data, uploads, recognition records, orchestration
- **Inference Worker (Celery):** async ALPR inference with **YOLOv8 (PyTorch)** and **NVIDIA TensorRT** support
- **MLOps (`mlops/`):** automated retraining triggers, YOLO retraining, EasyOCR fine-tuning, deployment/promotion workflows
- **Frontend (React + Vite + Tailwind):** Real-time Dashboard, Master Data, Queue Monitoring, Reports
- **Infra (Docker Compose):** PostgreSQL, Redis, Nginx (+ optional ops UIs)

> ✅ Scope note: This repository focuses on **core ALPR processing and upload-based workflows**.

---

## 🧭 Table of Contents

- [🏗️ System Overview](#️-system-overview)
- [🧩 Project Structure](#-project-structure)
- [🚀 Quick Start (Docker-first)](#-quick-start-docker-first)
- [⚡ Inference Modes (PyTorch vs TensorRT)](#-inference-modes-pytorch-vs-tensorrt)
- [🧠 MLOps & Training Pipeline](#-mlops--training-pipeline)
- [🧾 API Examples](#-api-examples)
- [🧰 Local Development](#-local-development)
- [🔒 Production Hardening Checklist](#-production-hardening-checklist)
- [📄 License](#-license)

---

## 🏗️ System Overview

### Architecture at a Glance

```mermaid
flowchart LR
  U[Operator Client] -->|Upload images| FE[Frontend React Vite]
  FE -->|REST API| API[FastAPI Backend]
  API -->|Enqueue tasks| R[(Redis Broker)]
  R -->|Consume tasks| W[Celery Worker Inference]
  W -->|Write results| PG[(PostgreSQL)]
  W -->|Store artifacts| ST[(Storage Volume)]
  API -->|Query results| PG
  FE -->|Reports and monitoring| API

  subgraph MLOPS[mlops pipeline]
    BEAT[Celery Beat Scheduler] -->|Trigger retrain checks| TR[Trainer Worker]
    TR -->|Publish models| MD[(Models Volume)]
    TR -->|Training artifacts| ST
  end

  W -->|Load models| MD
  API -->|Metadata and paths| ST
```

### High-Level Data Flow (Upload-Based)

1. **User uploads image(s)** via the frontend.
2. **Backend validates and stores** images, then enqueues inference jobs.
3. **Celery worker executes ALPR pipeline**:
   - detection (YOLOv8 PyTorch or TensorRT)
   - crop + preprocessing
   - OCR + post-processing
4. **Results are persisted** (PostgreSQL + storage paths).
5. **Dashboard displays** real-time status, queue monitoring, and reports.

---

## 🧩 Project Structure

<details>
<summary><strong>Click to expand tree view</strong></summary>

```text
alpr_system_v2/
├─ backend/                         # FastAPI application
│  ├─ app/
│  │  ├─ api/                       # REST endpoints (cameras, uploads, results, reports)
│  │  ├─ core/                      # settings, config, shared utilities
│  │  ├─ db/                        # database session / models / migrations hooks
│  │  ├─ schemas/                   # Pydantic request/response schemas
│  │  ├─ services/                  # business logic (queueing, orchestration)
│  │  └─ main.py                    # FastAPI entrypoint
│  ├─ alembic/                      # DB migrations
│  ├─ requirements.txt
│  └─ Dockerfile
│
├─ worker/                          # Celery inference workers (ALPR)
│  ├─ worker/
│  │  ├─ celery_app.py              # Celery app config
│  │  ├─ tasks/                     # Inference task handlers
│  │  ├─ detectors/                 # YOLOv8 / TensorRT detector adapters
│  │  ├─ ocr/                       # OCR pipeline and post-processing
│  │  └─ utils/                     # image/logging/helpers
│  ├─ requirements.txt
│  └─ Dockerfile
│
├─ mlops/                           # MLOps training + deployment pipeline
│  ├─ mlops/
│  │  ├─ celery_app.py              # Training Celery app + beat scheduler
│  │  ├─ tasks/                     # retrain/fine-tune/deploy tasks
│  │  └─ pipelines/                 # training workflow helpers
│  ├─ requirements.txt
│  └─ Dockerfile
│
├─ frontend/                        # React + Vite + Tailwind dashboard
│  ├─ src/
│  │  ├─ pages/                     # Dashboard / MasterData / Queue / Reports
│  │  ├─ components/
│  │  └─ services/                  # API client modules
│  ├─ package.json
│  └─ Dockerfile
│
├─ nginx/
│  └─ nginx.conf                    # reverse proxy for frontend + backend API
│
├─ models/                          # deployed model assets (YOLO/TensorRT/OCR)
├─ storage/                         # uploads, crops, outputs, training artifacts
├─ docker-compose.yml               # stack orchestration
└─ README.md
```

</details>

---

## 🚀 Quick Start (Docker-first)

### Prerequisites

- Docker Engine + Docker Compose plugin
- (Optional, for GPU/TensorRT) NVIDIA driver + NVIDIA Container Toolkit

### Initialize Volumes

```bash
mkdir -p storage models
```

Place your deployed model assets in `models/` (e.g., YOLO weights and/or TensorRT engines, plus OCR assets as applicable).

### Build & Start

```bash
docker compose up --build -d
```

### Useful Endpoints

| Service | URL |
|---|---|
| Nginx entrypoint | `http://localhost` |
| Backend API | `http://localhost:8000` |
| Swagger UI | `http://localhost:8000/docs` |
| Flower (Celery monitoring) | `http://localhost:5555` |
| Redis Commander | `http://localhost:8081` |

### Stop

```bash
docker compose down
```

### Reset (Destructive)

```bash
docker compose down -v
```

> [!TIP]
> If you want multiple GPU workers, scale the worker service (subject to GPU capacity and queue throughput):
>
> ```bash
> docker compose up -d --scale worker-gpu-1=2
> ```

---

## ⚡ Inference Modes (PyTorch vs TensorRT)

The worker supports two production-ready inference backends:

### ✅ YOLOv8 (PyTorch)

- Best for quick iteration and development
- Flexible for debugging and rapid model updates

### 🚀 NVIDIA TensorRT

- Best for **high-throughput, low-latency** production GPU inference
- Ideal when you need maximum FPS and predictable performance

> [!NOTE]
> TensorRT execution is controlled via environment variables in the worker container. Typical knobs include FP16 enablement, workspace size, and input resolution.

---

## 🧠 MLOps & Training Pipeline

The `mlops/` directory introduces a production-oriented workflow for continuous model improvement.

### What it does

- **YOLOv8 retraining** from new labeled data
- **EasyOCR fine-tuning** for Thai plate edge cases
- **Quality gates** (metrics-based promotion)
- **Model deployment/promotion** into the shared `models/` directory

### Runtime Components

- **Trainer Worker (`trainer-worker`)**
  - Runs training tasks from a dedicated queue (recommended **concurrency=1**)
  - Produces artifacts and candidate models
- **Scheduler (`celery-beat`)**
  - Periodically checks for retraining triggers (e.g., new data volume / drift signals)

### Recommended Promotion Flow

1. Collect verified training samples (from `storage/` or an exported dataset).
2. Trigger **YOLO retraining** and/or **OCR fine-tuning**.
3. Evaluate metrics (e.g., detection mAP, OCR accuracy).
4. Compare against baseline and minimum improvement thresholds.
5. Promote the winning model into `models/` (keep rollback-safe previous versions).

### Suggested Model Versioning Pattern

```text
models/
├─ yolo/
│  ├─ best_20260303.pt
│  ├─ best_20260303.engine
│  └─ current -> best_20260303.engine
├─ ocr/
│  ├─ easyocr_th_v3/
│  └─ current -> easyocr_th_v3/
└─ manifest.json
```

> [!TIP]
> Keep an `archive/` folder (or tags) to make rollback instant.

---

## 🧾 API Examples

> Endpoints below demonstrate typical V2 patterns. Adjust paths/fields if your router names differ.

### 1) List Cameras

```bash
curl -X GET "http://localhost:8000/api/cameras"
```

### 2) Upload Image(s) for ALPR

**Single image** (multipart):

```bash
curl -X POST "http://localhost:8000/api/uploads/images" \
  -H "Accept: application/json" \
  -F "camera_id=cam-upload-01" \
  -F "files=@./samples/car_001.jpg"
```

**Multiple images**:

```bash
curl -X POST "http://localhost:8000/api/uploads/images" \
  -H "Accept: application/json" \
  -F "camera_id=cam-upload-01" \
  -F "files=@./samples/car_001.jpg" \
  -F "files=@./samples/car_002.jpg" \
  -F "files=@./samples/car_003.jpg"
```

### 3) Fetch Results

**Recent results**:

```bash
curl -X GET "http://localhost:8000/api/results?limit=20"
```

**Get by ID**:

```bash
curl -X GET "http://localhost:8000/api/results/<result_id>"
```

---

## 🧰 Local Development

Use this when you want to run one component locally while keeping infra services in Docker.

### 1) Start PostgreSQL + Redis only

```bash
docker compose up -d postgres redis
```

### 2) Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Apply DB migrations
alembic upgrade head

# Run API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Example environment variables:

```bash
export DATABASE_URL="postgresql+psycopg2://alpr:alpr@localhost:5432/alpr"
export REDIS_URL="redis://localhost:6379/0"
export STORAGE_DIR="$(pwd)/../storage"
export CORS_ORIGINS="http://localhost:5173"
```

### 3) Worker (Celery Inference)

```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL="postgresql+psycopg2://alpr:alpr@localhost:5432/alpr"
export REDIS_URL="redis://localhost:6379/0"
export STORAGE_DIR="$(pwd)/../storage"
export MODEL_PATH="$(pwd)/../models/yolo/current"

# Optional TensorRT knobs
export TRT_FP16=1
export TRT_WORKSPACE=4096
export TRT_INPUT_W=640
export TRT_INPUT_H=640

celery -A worker.celery_app worker -l info
```

### 4) Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Configure API base URL (example):

```bash
export VITE_API_BASE="http://localhost:8000/api"
```

---

## 🔒 Production Hardening Checklist

Before production rollout, review and implement:

- [ ] Replace default DB credentials; restrict Redis exposure
- [ ] Restrict Flower / Redis Commander access (internal network or auth)
- [ ] Enforce HTTPS at Nginx / upstream load balancer
- [ ] Add API authentication/authorization (admin/operator roles)
- [ ] Centralize logs + structured logging (JSON)
- [ ] Add retention policies for uploads/crops and training artifacts
- [ ] Back up PostgreSQL and version model artifacts
- [ ] Keep rollback-ready models and a deployment manifest

---

## 🤝 Contributing

1. Create a feature branch
2. Implement + test changes
3. Update docs if behavior changes (API/routes/models)
4. Open a PR with clear notes (especially for model/queue changes)

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

- ✅ You may use, modify, and distribute this software
- ✅ Commercial use is permitted
- ⚠️ If you distribute modified versions, you must also provide corresponding source code under **GPL-3.0**
- ⚠️ Derivative works must remain under a **GPL-3.0-compatible** license

See the `LICENSE` file in the repository for the full license text.

> [!NOTE]
> If this system is integrated into a larger distributed product, review GPL-3.0 obligations with your legal/compliance team before release.

