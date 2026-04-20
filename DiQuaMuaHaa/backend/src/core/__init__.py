"""Core configuration and exceptions module."""

from .config import (
    # App config
    app,
    BASE_DIR,
    DATABASE_URL,
    # Model paths
    MODEL_PATH,
    HAND_MODEL_PATH,
    SMOKING_MODEL_PATH,
    PHONE_MODEL_PATH,
    PHONE_YOLO_MODEL_PATH,
    # MySQL config
    MYSQL_CONFIG,
    POSTGRES_AVAILABLE,
    # Identity settings
    IDENTITY_SIM_THRESHOLD,
    IDENTITY_MIN_REGISTER_SAMPLES,
    IDENTITY_MIN_VERIFY_SAMPLES,
    IDENTITY_DECISION_TIMEOUT_SEC,
    # Telegram settings
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET,
    # Prediction settings
    LANDMARK_AMBIGUOUS_MARGIN,
    # Model globals (will be managed by services)
    get_model_globals,
    set_model_globals,
)

__all__ = [
    "app",
    "BASE_DIR",
    "DATABASE_URL",
    "MODEL_PATH",
    "HAND_MODEL_PATH",
    "SMOKING_MODEL_PATH",
    "PHONE_MODEL_PATH",
    "PHONE_YOLO_MODEL_PATH",
    "MYSQL_CONFIG",
    "POSTGRES_AVAILABLE",
    "IDENTITY_SIM_THRESHOLD",
    "IDENTITY_MIN_REGISTER_SAMPLES",
    "IDENTITY_MIN_VERIFY_SAMPLES",
    "IDENTITY_DECISION_TIMEOUT_SEC",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "LANDMARK_AMBIGUOUS_MARGIN",
    "get_model_globals",
    "set_model_globals",
]
