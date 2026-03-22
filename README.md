# AI Driver Monitoring System (DMS)

A full-stack project for **driver state monitoring** using the webcam: face landmarks, hand pose, smoking cues, phone usage (including YOLO-based detection), and **optional driver identity verification** with owner approval via **Telegram**. The repository also includes a **separate medical-diagnosis demo** (login, statistics, AI-assisted records) that talks to a second Flask API.

---

## What this project does

| Area | Description |
|------|-------------|
| **Computer vision** | Frames from the browser are sent to a Flask API; **MediaPipe** extracts face/hand landmarks; **scikit-learn** models classify behaviors (e.g. smoking, phone, hand activity). |
| **Real-time phone detection** | **Socket.IO** event `phone_frame` runs **Ultralytics YOLO** when `phone_yolo.pt` is present under `DiQuaMuaHaa/backend/driver_training/models/`. |
| **Identity & security** | REST endpoints to **register** / **verify** driver face embeddings (MySQL). **Telegram** webhook and owner binding for approve/reject flows (`OwnerVerifyGate`, webhook in `api.py`). |
| **Training pipeline** | Scripts under `driver_training/` to collect landmarks, build CSVs, and train models (datasets and large artifacts are **not** committed; see [Local assets](#local-assets-not-in-git)). |
| **Medical demo (optional)** | `len.py` serves JWT-backed APIs on **port 5000** (`medical_diagnosis` DB) for login, statistics, and record flows used by some frontend routes. |

---

## Tech stack

- **Frontend:** React 19, Vite, React Router, Tailwind CSS, Socket.IO client, Recharts, Three.js (`DiQuaMuaHaa/frontend/demothuattoanpro/`)
- **Driver API:** Flask, Flask-CORS, PyMySQL, MediaPipe, OpenCV, NumPy, scikit-learn, joblib, Flask-SocketIO (`DiQuaMuaHaa/backend/data/api/api.py` — default **port 8000**)
- **Medical API:** Flask, SQLAlchemy, Flask-JWT-Extended (`DiQuaMuaHaa/backend/len.py` — **port 5000**)
- **Database:** MySQL (e.g. XAMPP): schemas such as `diquamuaha` (identity) and `medical_diagnosis` (medical demo)

---

## Repository layout

```
DiQuaMuaHaa/
├── backend/
│   ├── data/api/api.py          # DMS + identity + Telegram + Socket.IO (port 8000)
│   ├── len.py                   # Medical demo API (port 5000)
│   ├── requirements.txt
│   └── driver_training/         # Data collection & training scripts
│       ├── collect/
│       ├── train/
│       └── utils/
└── frontend/demothuattoanpro/   # React app (Vite)
```

---

## Prerequisites

- **Python 3.10+** (project paths reference 3.10 in places)
- **Node.js 18+** and npm
- **MySQL** (local or remote) and created databases as configured in code
- **Webcam** for live demos

---

## Environment variables (DMS API)

Configure via environment or a local `.env` (ensure `.env` is never committed). Examples used by `api.py`:

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret for webhook verification (use a random string; avoid Stripe-like `sk_live_` prefixes to reduce false positives from secret scanners) |
| `IDENTITY_SIM_THRESHOLD` | Face similarity threshold (default in code if unset) |
| `IDENTITY_MIN_REGISTER_SAMPLES` / `IDENTITY_MIN_VERIFY_SAMPLES` | Minimum samples for register/verify |
| `IDENTITY_DECISION_TIMEOUT_SEC` | Timeout for owner decision flow |

MySQL connection for identity features is configured in `MYSQL_CONFIG` inside `api.py` — adjust host, user, password, and database name for your environment.

---

## Local assets (not in Git)

The following are ignored or too large for GitHub; place them locally after training or download:

- `DiQuaMuaHaa/backend/driver_training/models/` — `.pkl`, `.pth`, `phone_yolo.pt`, etc.
- `DiQuaMuaHaa/backend/driver_training/dataset/`
- `DiQuaMuaHaa/backend/dataset/`
- `*.pt` weights (e.g. root `yolov8n.pt` if used)
- `driver_training/collect/data/landmarks_kaggle.csv` (exceeds GitHub file size limit if regenerated)

---

## Quick start

### 1. Backend — Driver monitoring API (port 8000)

```bash
cd DiQuaMuaHaa/backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
pip install flask-socketio ultralytics   # Socket.IO + YOLO (optional but recommended for phone YOLO)
cd data/api
python api.py
```

Server listens on **http://0.0.0.0:8000** (see `if __name__ == "__main__"` in `api.py`).

### 2. Backend — Medical demo API (port 5000, optional)

```bash
cd DiQuaMuaHaa/backend
# same venv as above
python len.py
```

Ensure MySQL database `medical_diagnosis` exists and matches `SQLALCHEMY_DATABASE_URI` in `len.py`.

### 3. Frontend

```bash
cd DiQuaMuaHaa/frontend/demothuattoanpro
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

---

## Useful HTTP endpoints (DMS — port 8000)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Health check |
| POST | `/api/landmark/predict` | Landmark / expression-related prediction |
| POST | `/api/landmark/predict_from_frame` | From base64 frame |
| POST | `/api/smoking/predict_from_frame` | Smoking classification from frame |
| POST | `/api/phone/predict_from_frame` | Phone (landmark model) |
| POST | `/api/phone/detect_from_frame` | Phone detection variant |
| POST | `/api/hand/predict` / `/api/hand/predict_from_frame` | Hand pose |
| POST | `/api/identity/register` | Register driver embedding |
| POST | `/api/identity/verify` | Verify driver |
| POST | `/api/identity/telegram/bind` | Bind Telegram to driver |
| POST | `/api/identity/request_decision` | Request owner decision |
| GET | `/api/identity/decision_status` | Poll decision status |
| POST | `/api/telegram/webhook` | Telegram webhook |

**Socket.IO events:** `phone_frame` → `phone_result`; `smoking_frame` → `smoking_result` (see `api.py` for payload shape).

---

## Frontend routes (high level)

| Path | Purpose |
|------|---------|
| `/` | Login (medical demo → port **5000**) |
| `/test5` | Face / driver monitoring UI (API **8000**) |
| `/test3` | Extended test dashboard (REST + Socket.IO **8000**) |
| `/test4` | Hand detection |
| `/verifypro` | Verify flow UI |
| `/admin`, `/spam`, `/test1`, `/test2` | Medical / statistics / diagnosis demos (**5000**) |

> **Note:** DMS features use **8000**; medical JWT app uses **5000**. For production, replace hardcoded `http://localhost:8000` / `5000` with environment-based base URLs.

---

## Training your own models

1. Use scripts in `DiQuaMuaHaa/backend/driver_training/collect/` to build datasets and CSVs.
2. Train with `driver_training/train/*.py` (landmarks, smoking, phone, hands, etc.).
3. Export or copy model files into `driver_training/models/` with the names expected in `api.py` (e.g. `landmark_model.pkl`, `phone_yolo.pt`).

---

## Security notes

- Never commit **API keys**, bot tokens, or webhook secrets. Use environment variables only.
- Change default **JWT** and database credentials in `len.py` before any public deployment.
- Keep **CORS** and **Telegram webhook** URLs restricted appropriately in production.

---

## License

Specify your license here (e.g. MIT) if you want the repo to be clearly reusable.

---

## Acknowledgments

Built with **MediaPipe**, **OpenCV**, **scikit-learn**, and optionally **Ultralytics YOLO**. Driver identity flows integrate **Telegram Bot API** and **MySQL**.
