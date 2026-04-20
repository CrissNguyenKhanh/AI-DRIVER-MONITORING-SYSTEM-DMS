"""
WebSocket event handlers for DMS.
Handles real-time phone detection and smoking detection via Socket.IO.
"""

from __future__ import annotations

import base64
from typing import Any, Dict, List

import numpy as np
from flask_socketio import SocketIO, emit

from core.config import app, get_model_globals
from utils.image_processing import ensure_face_mesh_loaded, image_base64_to_landmarks

# Initialize SocketIO with the Flask app
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")


@socketio.on("phone_frame")
def handle_phone_frame(data: Dict[str, Any]) -> None:
    """
    Client sends: { "image": "data:image/jpeg;base64,..." }
    Server emits: { "boxes": [...] } or { "error": "..." }
    
    Uses YOLO model for phone detection.
    """
    g = get_model_globals()
    phone_yolo_model = g.get("phone_yolo_model")
    
    if phone_yolo_model is None:
        emit("phone_result", {"boxes": [], "error": "YOLO model not loaded"})
        return

    image_b64 = data.get("image", "")
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    try:
        # Import cv2 lazily
        import cv2
        
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            emit("phone_result", {"boxes": []})
            return

        results = phone_yolo_model(img, conf=0.55, iou=0.5, verbose=False)[0]
        boxes_out: List[Dict[str, Any]] = []
        if results.boxes is not None and len(results.boxes) > 0:
            xywhn = results.boxes.xywhn.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            clss = results.boxes.cls.cpu().numpy().astype(int)
            names = results.names
            for (cx, cy, w, h), c, cls_idx in zip(xywhn, confs, clss):
                label = (
                    str(names.get(int(cls_idx), int(cls_idx)))
                    if isinstance(names, dict)
                    else str(int(cls_idx))
                )
                boxes_out.append(
                    {
                        "label": label,
                        "x": float(cx),
                        "y": float(cy),
                        "w": float(w),
                        "h": float(h),
                        "prob": float(c),
                    }
                )

        emit("phone_result", {"boxes": boxes_out})
    except Exception as exc:
        emit("phone_result", {"boxes": [], "error": str(exc)})
        return

    # Important: phone_frame should ONLY run phone inference.
    return


@socketio.on("smoking_frame")
def handle_smoking_frame(data: Dict[str, Any]) -> None:
    """
    Client sends: { "image": "data:image/jpeg;base64,..." }
    Server emits: { "label": "...", "prob": <float>, "raw_label": "..." }
    
    Uses smoking detection model (currently disabled for debugging).
    """
    # Temporarily disabled for phone detection debugging
    emit("smoking_result", {"label": "no_smoking", "prob": 0, "raw_label": "no_smoking"})
    return
    
    # Original implementation (disabled):
    """
    g = get_model_globals()
    smoking_model = g.get("smoking_model")
    smoking_idx_to_label = g.get("smoking_idx_to_label", {})
    
    if smoking_model is None or not smoking_idx_to_label:
        emit(
            "smoking_result", {"label": "no_model", "prob": 0, "raw_label": "no_model"}
        )
        return

    image_b64 = data.get("image", "")
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    if not image_b64:
        emit("smoking_result", {"label": "no_face", "prob": 0, "raw_label": "no_face"})
        return

    try:
        ensure_face_mesh_loaded()
        vec = image_base64_to_landmarks(image_b64)
    except Exception as exc:
        emit("smoking_result", {"label": "error", "prob": 0, "raw_label": str(exc)})
        return

    if vec is None:
        emit("smoking_result", {"label": "no_face", "prob": 0, "raw_label": "no_face"})
        return

    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

    try:
        pred_idx = int(smoking_model.predict(x)[0])
        raw_label = smoking_idx_to_label.get(pred_idx, str(pred_idx))

        if hasattr(smoking_model, "predict_proba"):
            proba = smoking_model.predict_proba(x)[0]
        else:
            proba = None
    except Exception as exc:
        emit("smoking_result", {"label": "error", "prob": 0, "raw_label": str(exc)})
        return

    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[smoking_idx_to_label.get(i, str(i))] = float(p)

    best_prob = float(max(scores.values())) if scores else None

    # Hysteresis/threshold to reduce false-positives
    SMOKING_HARD_THRESHOLD = 0.90
    label = raw_label
    if label == "smoking" and (best_prob is None or best_prob < SMOKING_HARD_THRESHOLD):
        label = "no_smoking"

    emit(
        "smoking_result",
        {
            "label": label,
            "prob": best_prob or 0,
            "raw_label": raw_label,
        },
    )
    """
