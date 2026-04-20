"""
Model loader service.
Handles loading of ML models (.pkl, .pt files).
This is a placeholder for E-Batch 2 - will be fully implemented in E-Batch 3.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Dict

# Import from core to avoid circular imports
from src.core.config import (
    BASE_DIR,
    MODEL_PATH,
    HAND_MODEL_PATH,
    SMOKING_MODEL_PATH,
    PHONE_MODEL_PATH,
    PHONE_YOLO_MODEL_PATH,
    get_model_globals,
    set_model_globals,
)

# Lazy imports
joblib = None


def _compat_joblib_load(path: Path) -> Any:
    """Load a joblib/pickle file."""
    global joblib
    if joblib is None:
        import joblib as _joblib
        joblib = _joblib
    return joblib.load(path)


# Training locks
_model_train_lock = threading.Lock()
_trained_fallback_landmark = False
_trained_fallback_hand = False
_training_landmark_in_progress = False
_training_hand_in_progress = False


def load_model() -> None:
    """Load landmark model (drowsy/yawning detection)."""
    g = get_model_globals()
    
    # Default state
    set_model_globals("artifact", None)
    set_model_globals("model", None)
    set_model_globals("idx_to_label", {})

    if not MODEL_PATH.exists():
        return

    try:
        artifact = _compat_joblib_load(MODEL_PATH)
    except Exception as exc:
        # Start fallback training in background
        from flask import current_app
        current_app.logger.warning("load_model failed (%s). Starting fallback training...", exc)
        
        def _train_landmark_bg() -> None:
            global _trained_fallback_landmark, _training_landmark_in_progress
            try:
                os.environ.setdefault("FAST_MODE", "1")
                os.environ.setdefault("SKIP_CV", "1")

                from driver_training.train.train_landmarks import train_landmark_model

                csv_path = BASE_DIR / "driver_training" / "collect" / "data" / "landmarks.csv"
                train_landmark_model(
                    csv_path=csv_path,
                    model_path=MODEL_PATH,
                    test_size=float(os.getenv("LANDMARK_TEST_SIZE", "0.2")),
                    random_state=int(os.getenv("LANDMARK_RANDOM_STATE", "42")),
                )
                with _model_train_lock:
                    _trained_fallback_landmark = True
            except Exception:
                from flask import current_app
                current_app.logger.exception("landmark fallback training failed")
            finally:
                with _model_train_lock:
                    _training_landmark_in_progress = False

        with _model_train_lock:
            global _training_landmark_in_progress
            if not _trained_fallback_landmark and not _training_landmark_in_progress:
                _training_landmark_in_progress = True
                threading.Thread(target=_train_landmark_bg, daemon=True).start()
        return

    if artifact is None:
        return

    set_model_globals("artifact", artifact)
    set_model_globals("model", artifact.get("model"))
    label_to_idx = artifact.get("label_to_idx", {})
    set_model_globals("idx_to_label", {v: k for k, v in label_to_idx.items()})


def load_hand_model() -> None:
    """Load hand gesture model."""
    g = get_model_globals()
    
    # Default state
    set_model_globals("hand_artifact", None)
    set_model_globals("hand_model", None)
    set_model_globals("hand_idx_to_label", {})
    set_model_globals("hand_vec_len", 126)

    if not HAND_MODEL_PATH.exists():
        return

    try:
        hand_artifact = _compat_joblib_load(HAND_MODEL_PATH)
    except Exception as exc:
        from flask import current_app
        current_app.logger.warning("load_hand_model failed (%s). Starting fallback training...", exc)

        def _train_hand_bg() -> None:
            global _trained_fallback_hand, _training_hand_in_progress
            try:
                os.environ.setdefault("FAST_MODE", "1")
                os.environ.setdefault("SKIP_CV", "1")

                from driver_training.train.train_hands import train_hand_model

                csv_path = BASE_DIR / "driver_training" / "collect" / "hand_dataset.csv"
                train_hand_model(
                    csv_path=csv_path,
                    model_path=HAND_MODEL_PATH,
                    test_size=float(os.getenv("HAND_TEST_SIZE", "0.15")),
                    random_state=int(os.getenv("HAND_RANDOM_STATE", "42")),
                )
                with _model_train_lock:
                    _trained_fallback_hand = True
            except Exception:
                from flask import current_app
                current_app.logger.exception("hand fallback training failed")
            finally:
                with _model_train_lock:
                    _training_hand_in_progress = False

        with _model_train_lock:
            global _training_hand_in_progress
            if not _trained_fallback_hand and not _training_hand_in_progress:
                _training_hand_in_progress = True
                threading.Thread(target=_train_hand_bg, daemon=True).start()
        return

    if hand_artifact is None:
        return

    set_model_globals("hand_artifact", hand_artifact)
    set_model_globals("hand_model", hand_artifact.get("model"))
    label_to_idx = hand_artifact.get("label_to_idx", {})
    set_model_globals("hand_idx_to_label", {v: k for k, v in label_to_idx.items()})
    
    try:
        vec_len = int(hand_artifact.get("vec_len", 126))
    except (TypeError, ValueError):
        vec_len = 126
    set_model_globals("hand_vec_len", vec_len)


def load_smoking_model() -> None:
    """Load smoking detection model."""
    g = get_model_globals()
    
    if not SMOKING_MODEL_PATH.exists():
        set_model_globals("smoking_artifact", None)
        set_model_globals("smoking_model", None)
        set_model_globals("smoking_idx_to_label", {})
        return

    smoking_artifact = _compat_joblib_load(SMOKING_MODEL_PATH)
    set_model_globals("smoking_artifact", smoking_artifact)
    set_model_globals("smoking_model", smoking_artifact.get("model"))
    label_to_idx = smoking_artifact.get("label_to_idx", {})
    set_model_globals("smoking_idx_to_label", {v: k for k, v in label_to_idx.items()})


def load_phone_model() -> None:
    """Load phone detection model (sklearn)."""
    g = get_model_globals()
    
    if not PHONE_MODEL_PATH.exists():
        set_model_globals("phone_artifact", None)
        set_model_globals("phone_model", None)
        set_model_globals("phone_idx_to_label", {})
        set_model_globals("phone_image_size", None)
        return

    phone_artifact = _compat_joblib_load(PHONE_MODEL_PATH)
    set_model_globals("phone_artifact", phone_artifact)
    set_model_globals("phone_model", phone_artifact.get("model"))
    label_to_idx = phone_artifact.get("label_to_idx", {})
    set_model_globals("phone_idx_to_label", {v: k for k, v in label_to_idx.items()})
    
    img_sz = phone_artifact.get("image_size")
    try:
        phone_image_size = int(img_sz) if img_sz is not None else None
    except (TypeError, ValueError):
        phone_image_size = None
    set_model_globals("phone_image_size", phone_image_size)


def load_phone_yolo_model() -> None:
    """Load phone detection YOLO model."""
    g = get_model_globals()
    yolo_available = g.get("yolo_available", False)
    
    if not PHONE_YOLO_MODEL_PATH.exists() or not yolo_available:
        set_model_globals("phone_yolo_model", None)
        return
    try:
        from ultralytics import YOLO
        phone_yolo_model = YOLO(str(PHONE_YOLO_MODEL_PATH))
        set_model_globals("phone_yolo_model", phone_yolo_model)
    except Exception:
        set_model_globals("phone_yolo_model", None)
