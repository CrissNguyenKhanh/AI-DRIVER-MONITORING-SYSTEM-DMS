"""Machine Learning Model Loader Service.

Handles loading and management of all ML models for DMS:
- Landmark model (face recognition)
- Hand gesture model
- Smoking detection model
n- Phone detection model (traditional ML + YOLO)
"""

from __future__ import annotations

import joblib
from pathlib import Path
from typing import Any, Dict

from src.core.config import (
    MODEL_PATH,
    HAND_MODEL_PATH,
    SMOKING_MODEL_PATH,
    PHONE_MODEL_PATH,
    PHONE_YOLO_MODEL_PATH,
    PHONE_YOLO_ONNX_PATH,
)

# Model artifacts and loaded models
artifact: Dict[str, Any] | None = None
model = None
idx_to_label: Dict[int, str] = {}

hand_artifact: Dict[str, Any] | None = None
hand_model = None
hand_idx_to_label: Dict[int, str] = {}
hand_vec_len: int = 126  # khớp artifact vec_len (63 = collect_hands normalize + dominant hand)

smoking_artifact: Dict[str, Any] | None = None
smoking_model = None
smoking_idx_to_label: Dict[int, str] = {}

phone_artifact: Dict[str, Any] | None = None
phone_model = None
phone_idx_to_label: Dict[int, str] = {}
phone_image_size: int | None = None

phone_yolo_model = None
phone_yolo_onnx = None

# YOLO availability check
try:
    from ultralytics import YOLO  # type: ignore
    YOLO_AVAILABLE = True
except Exception:
    YOLO_AVAILABLE = False


def load_model() -> None:
    """Load the main landmark model for face recognition."""
    global artifact, model, idx_to_label
    if not MODEL_PATH.exists():
        artifact = None
        model = None
        idx_to_label = {}
        return

    artifact = joblib.load(MODEL_PATH)
    model = artifact.get("model")
    label_to_idx = artifact.get("label_to_idx", {})
    idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_hand_model() -> None:
    """Load the hand gesture recognition model."""
    global hand_artifact, hand_model, hand_idx_to_label, hand_vec_len
    if not HAND_MODEL_PATH.exists():
        hand_artifact = None
        hand_model = None
        hand_idx_to_label = {}
        hand_vec_len = 126
        return

    hand_artifact = joblib.load(HAND_MODEL_PATH)
    hand_model = hand_artifact.get("model")
    label_to_idx = hand_artifact.get("label_to_idx", {})
    hand_idx_to_label = {v: k for k, v in label_to_idx.items()}
    try:
        hand_vec_len = int(hand_artifact.get("vec_len", 126))
    except (TypeError, ValueError):
        hand_vec_len = 126


def load_smoking_model() -> None:
    """Load the smoking detection model."""
    global smoking_artifact, smoking_model, smoking_idx_to_label
    if not SMOKING_MODEL_PATH.exists():
        smoking_artifact = None
        smoking_model = None
        smoking_idx_to_label = {}
        return

    smoking_artifact = joblib.load(SMOKING_MODEL_PATH)
    smoking_model = smoking_artifact.get("model")
    label_to_idx = smoking_artifact.get("label_to_idx", {})
    smoking_idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_phone_model() -> None:
    """Load the phone usage detection model (traditional ML)."""
    global phone_artifact, phone_model, phone_idx_to_label, phone_image_size
    if not PHONE_MODEL_PATH.exists():
        phone_artifact = None
        phone_model = None
        phone_idx_to_label = {}
        phone_image_size = None
        return

    try:
        phone_artifact = joblib.load(PHONE_MODEL_PATH)
        phone_model = phone_artifact.get("model")
        label_to_idx = phone_artifact.get("label_to_idx", {})
        phone_idx_to_label = {v: k for k, v in label_to_idx.items()}
        img_sz = phone_artifact.get("image_size")
        try:
            phone_image_size = int(img_sz) if img_sz is not None else None
        except (TypeError, ValueError):
            phone_image_size = None
    except Exception as e:
        print(f"[WARN] phone_model.pkl không load được (numpy/sklearn không tương thích): {e}")
        phone_artifact = None
        phone_model = None
        phone_idx_to_label = {}
        phone_image_size = None


def load_phone_yolo_model() -> None:
    """Load the phone YOLO model (ONNX preferred, fallback to PyTorch)."""
    global phone_yolo_model, phone_yolo_onnx
    
    # Ưu tiên ONNX nếu có (nhẹ và ổn định), fallback sang .pt
    if PHONE_YOLO_ONNX_PATH.exists():
        try:
            import onnxruntime as ort
            sess_opts = ort.SessionOptions()
            sess_opts.inter_op_num_threads = 1
            sess_opts.intra_op_num_threads = 1
            phone_yolo_onnx = ort.InferenceSession(
                str(PHONE_YOLO_ONNX_PATH),
                sess_options=sess_opts,
                providers=["CPUExecutionProvider"],
            )
            phone_yolo_model = None
            print("[INFO] phone_yolo.onnx loaded")
            return
        except Exception as e:
            print(f"[WARN] phone_yolo.onnx không load được: {e}")
            phone_yolo_onnx = None

    if not PHONE_YOLO_MODEL_PATH.exists() or not YOLO_AVAILABLE:
        phone_yolo_model = None
        return
    try:
        import torch as _torch
        _orig_load = _torch.load
        def _patched_load(f, *args, **kwargs):
            kwargs.setdefault("weights_only", False)
            return _orig_load(f, *args, **kwargs)
        _torch.load = _patched_load
        phone_yolo_model = YOLO(str(PHONE_YOLO_MODEL_PATH))
        _torch.load = _orig_load
    except Exception as e:
        print(f"[WARN] phone_yolo.pt không load được: {e}")
        phone_yolo_model = None


# Auto-load all models on module import
load_model()
load_hand_model()
load_smoking_model()
load_phone_model()
load_phone_yolo_model()

__all__ = [
    # Landmark model
    "artifact",
    "model",
    "idx_to_label",
    # Hand model
    "hand_artifact",
    "hand_model",
    "hand_idx_to_label",
    "hand_vec_len",
    # Smoking model
    "smoking_artifact",
    "smoking_model",
    "smoking_idx_to_label",
    # Phone model
    "phone_artifact",
    "phone_model",
    "phone_idx_to_label",
    "phone_image_size",
    # YOLO
    "phone_yolo_model",
    "phone_yolo_onnx",
    "YOLO_AVAILABLE",
    # Loader functions (for explicit reload)
    "load_model",
    "load_hand_model",
    "load_smoking_model",
    "load_phone_model",
    "load_phone_yolo_model",
]
