"""
Core configuration module.
Contains all environment variables, paths, and global settings.
Avoids circular imports by not importing from other project modules.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import pymysql

# Database drivers - optional
try:
    import psycopg2
    import psycopg2.extras
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

# Lazy imports (loaded on demand)
cv2 = None  # type: ignore[assignment]
joblib = None  # type: ignore[assignment]

# Flask app - will be initialized here to avoid circular imports
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins="*", supports_credentials=True)

# Max request size (25MB for base64 images)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024


# ═══════════════════════════════════════════════════════════════
# CORS Middleware
# ═══════════════════════════════════════════════════════════════
@app.after_request
def _cors_all_responses(response: Any):
    """Ensure CORS headers on all responses, even on errors."""
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With",
    )
    response.headers.setdefault(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    )
    return response


@app.errorhandler(413)
def too_large(_err):
    """Handle payload too large errors."""
    return jsonify({"error": "Request payload too large"}), 413


# ═══════════════════════════════════════════════════════════════
# Paths
# ═══════════════════════════════════════════════════════════════
BASE_DIR = Path(__file__).resolve().parents[2]  # .../backend

MODEL_PATH = BASE_DIR / "driver_training" / "models" / "landmark_model.pkl"
HAND_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "hand_model.pkl"
SMOKING_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "smoking_model.pkl"
PHONE_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_model.pkl"
PHONE_YOLO_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_yolo.pt"

# ═══════════════════════════════════════════════════════════════
# Database Configuration
# ═══════════════════════════════════════════════════════════════
DATABASE_URL = os.getenv("DATABASE_URL", "")

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "diquamuaha"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

# ═══════════════════════════════════════════════════════════════
# Identity Verification Settings
# ═══════════════════════════════════════════════════════════════
IDENTITY_SIM_THRESHOLD = float(os.getenv("IDENTITY_SIM_THRESHOLD", "0.975"))
IDENTITY_MIN_REGISTER_SAMPLES = int(os.getenv("IDENTITY_MIN_REGISTER_SAMPLES", "3"))
IDENTITY_MIN_VERIFY_SAMPLES = int(os.getenv("IDENTITY_MIN_VERIFY_SAMPLES", "2"))
IDENTITY_DECISION_TIMEOUT_SEC = int(os.getenv("IDENTITY_DECISION_TIMEOUT_SEC", "30"))

# ═══════════════════════════════════════════════════════════════
# Telegram Settings
# ═══════════════════════════════════════════════════════════════
TELEGRAM_BOT_TOKEN = os.getenv(
    "TELEGRAM_BOT_TOKEN", "8778925999:AAEvtjjjwulzUvGTC8ThTfvwOkJ7ALGuyoQ"
).strip()
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "Khanhdz123").strip()

# ═══════════════════════════════════════════════════════════════
# Prediction Settings
# ═══════════════════════════════════════════════════════════════
LANDMARK_AMBIGUOUS_MARGIN = float(os.getenv("LANDMARK_AMBIGUOUS_MARGIN", "0.12"))

# ═══════════════════════════════════════════════════════════════
# Model Global State (managed by model_loader_service)
# ═══════════════════════════════════════════════════════════════
# These will be populated when models are loaded
_model_globals: Dict[str, Any] = {
    "artifact": None,
    "model": None,
    "idx_to_label": {},
    "hand_artifact": None,
    "hand_model": None,
    "hand_idx_to_label": {},
    "hand_vec_len": 126,
    "smoking_artifact": None,
    "smoking_model": None,
    "smoking_idx_to_label": {},
    "phone_artifact": None,
    "phone_model": None,
    "phone_idx_to_label": {},
    "phone_image_size": None,
    "phone_yolo_model": None,
    "yolo_available": False,
}


def get_model_globals() -> Dict[str, Any]:
    """Get current model global state."""
    return _model_globals


def set_model_globals(key: str, value: Any) -> None:
    """Set a model global value."""
    _model_globals[key] = value


# Try importing YOLO (optional)
try:
    from ultralytics import YOLO  # type: ignore
    _model_globals["yolo_available"] = True
except Exception:
    _model_globals["yolo_available"] = False


# ═══════════════════════════════════════════════════════════════
# Database Connection Factory
# ═══════════════════════════════════════════════════════════════
def get_mysql_conn():
    """Kết nối database — tự động dùng PostgreSQL nếu có DATABASE_URL, fallback MySQL."""
    if DATABASE_URL and POSTGRES_AVAILABLE:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
        return conn
    return pymysql.connect(**MYSQL_CONFIG)
