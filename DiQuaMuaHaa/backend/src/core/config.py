"""Core configuration module for DMS Backend."""

import os
from pathlib import Path
import pymysql

# Base directory (project root: backend/)
BASE_DIR = Path(__file__).resolve().parents[2]  # .../backend

# Model paths
MODEL_PATH = BASE_DIR / "driver_training" / "models" / "landmark_model.pkl"
HAND_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "hand_model.pkl"
SMOKING_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "smoking_model.pkl"
PHONE_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_model.pkl"
PHONE_YOLO_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_yolo.pt"
PHONE_YOLO_ONNX_PATH = BASE_DIR / "driver_training" / "models" / "phone_yolo.onnx"

# MySQL config — đọc từ biến môi trường để tương thích Render / Cloud
MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "diquamuaha"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

# Identity verification constants
IDENTITY_SIM_THRESHOLD = float(os.getenv("IDENTITY_SIM_THRESHOLD", "0.975"))
IDENTITY_MIN_REGISTER_SAMPLES = int(os.getenv("IDENTITY_MIN_REGISTER_SAMPLES", "3"))
IDENTITY_MIN_VERIFY_SAMPLES = int(os.getenv("IDENTITY_MIN_VERIFY_SAMPLES", "2"))
IDENTITY_DECISION_TIMEOUT_SEC = int(os.getenv("IDENTITY_DECISION_TIMEOUT_SEC", "30"))

# Telegram configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8778925999:AAEvtjjjwulzUvGTC8ThTfvwOkJ7ALGuyoQ").strip()
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "Khanhdz123").strip()

__all__ = [
    "BASE_DIR",
    "MODEL_PATH",
    "HAND_MODEL_PATH",
    "SMOKING_MODEL_PATH",
    "PHONE_MODEL_PATH",
    "PHONE_YOLO_MODEL_PATH",
    "PHONE_YOLO_ONNX_PATH",
    "MYSQL_CONFIG",
    "IDENTITY_SIM_THRESHOLD",
    "IDENTITY_MIN_REGISTER_SAMPLES",
    "IDENTITY_MIN_VERIFY_SAMPLES",
    "IDENTITY_DECISION_TIMEOUT_SEC",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
]

