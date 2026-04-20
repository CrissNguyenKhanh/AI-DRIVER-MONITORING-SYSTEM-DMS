"""
Prediction service module.
Handles ML model predictions for landmarks, hands, smoking, and phone detection.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from core.config import LANDMARK_AMBIGUOUS_MARGIN, get_model_globals
from core.exceptions import ModelNotLoadedException
from services.model_loader_service import load_model, load_hand_model, load_smoking_model, load_phone_model
from utils.image_processing import (
    ensure_models_loaded,
    image_base64_to_landmarks,
    image_base64_to_hand_landmarks,
    hands_to_feature_vector,
)


def predict_landmark(landmarks: List[float]) -> Dict[str, Any]:
    """
    Predict drowsiness/yawning from landmark vector.
    
    Args:
        landmarks: 1434-dim face landmark vector
        
    Returns:
        Dict with label, prob, scores
    """
    g = get_model_globals()
    model = g.get("model")
    idx_to_label = g.get("idx_to_label", {})
    
    if model is None or not idx_to_label:
        raise ModelNotLoadedException("Model chưa được load.")
    
    x = np.asarray(landmarks, dtype=np.float32).reshape(1, -1)
    
    pred_idx = int(model.predict(x)[0])
    
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(x)[0]
    else:
        proba = None
    
    label = idx_to_label.get(pred_idx, str(pred_idx))
    
    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[idx_to_label.get(i, str(i))] = float(p)
    
    top_prob = float(max(scores.values())) if scores else None
    
    # Handle ambiguous predictions (2-class dataset)
    if proba is not None and len(proba) >= 2:
        sorted_p = sorted(float(p) for p in proba)
        margin = sorted_p[-1] - sorted_p[-2]
        if margin < LANDMARK_AMBIGUOUS_MARGIN:
            label = "safe"
            top_prob = float(margin)
    
    return {
        "label": label,
        "prob": top_prob,
        "scores": scores,
    }


def predict_from_frame(image_b64: str) -> Dict[str, Any]:
    """
    Predict from base64 image (face landmarks → drowsiness).
    
    Returns:
        Dict with label, prob, scores (or no_face if no face detected)
    """
    ensure_models_loaded()
    
    vec = image_base64_to_landmarks(image_b64)
    if vec is None:
        return {
            "label": "no_face",
            "prob": None,
            "scores": {},
        }
    
    return predict_landmark(vec)


def predict_hand(landmarks: List[float]) -> Dict[str, Any]:
    """
    Predict hand gesture from landmark vector.
    
    Args:
        landmarks: 63-dim (normalized) or 126-dim (raw) vector
        
    Returns:
        Dict with label, prob, scores
    """
    g = get_model_globals()
    hand_model = g.get("hand_model")
    hand_idx_to_label = g.get("hand_idx_to_label", {})
    
    if hand_model is None or not hand_idx_to_label:
        raise ModelNotLoadedException("Hand model chưa được load.")
    
    x = np.asarray(landmarks, dtype=np.float32).reshape(1, -1)
    
    pred_idx = int(hand_model.predict(x)[0])
    
    if hasattr(hand_model, "predict_proba"):
        proba = hand_model.predict_proba(x)[0]
    else:
        proba = None
    
    label = hand_idx_to_label.get(pred_idx, str(pred_idx))
    
    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[hand_idx_to_label.get(i, str(i))] = float(p)
    
    return {
        "label": label,
        "prob": float(max(scores.values())) if scores else None,
        "scores": scores,
    }


def predict_hand_from_frame(image_b64: str) -> Dict[str, Any]:
    """
    Predict hand gesture from base64 image.
    
    Returns:
        Dict with label, prob, scores (or no_hand if no hand detected)
    """
    ensure_models_loaded()
    
    vec = image_base64_to_hand_landmarks(image_b64)
    if vec is None:
        return {
            "label": "no_hand",
            "prob": None,
            "scores": {},
        }
    
    return predict_hand(vec)


def predict_smoking(image_b64: str) -> Dict[str, Any]:
    """
    Predict smoking from face landmarks.
    
    Returns:
        Dict with label, prob, raw_label, scores
    """
    g = get_model_globals()
    smoking_model = g.get("smoking_model")
    smoking_idx_to_label = g.get("smoking_idx_to_label", {})
    
    if smoking_model is None or not smoking_idx_to_label:
        raise ModelNotLoadedException("Smoking model chưa được load.")
    
    vec = image_base64_to_landmarks(image_b64)
    if vec is None:
        return {
            "label": "no_face",
            "prob": 0,
            "raw_label": "no_face",
            "scores": {},
        }
    
    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)
    
    pred_idx = int(smoking_model.predict(x)[0])
    raw_label = smoking_idx_to_label.get(pred_idx, str(pred_idx))
    
    if hasattr(smoking_model, "predict_proba"):
        proba = smoking_model.predict_proba(x)[0]
    else:
        proba = None
    
    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[smoking_idx_to_label.get(i, str(i))] = float(p)
    
    best_prob = float(max(scores.values())) if scores else None
    
    # Hysteresis/threshold to reduce false positives
    SMOKING_HARD_THRESHOLD = 0.90
    label = raw_label
    if label == "smoking" and (best_prob is None or best_prob < SMOKING_HARD_THRESHOLD):
        label = "no_smoking"
    
    return {
        "label": label,
        "prob": best_prob or 0,
        "raw_label": raw_label,
        "scores": scores,
    }


def predict_phone(image_b64: str) -> Dict[str, Any]:
    """
    Predict phone usage from image (ML model version).
    
    Returns:
        Dict with label, prob, scores
    """
    g = get_model_globals()
    phone_model = g.get("phone_model")
    phone_idx_to_label = g.get("phone_idx_to_label", {})
    phone_image_size = g.get("phone_image_size")
    
    if phone_model is None or not phone_idx_to_label:
        raise ModelNotLoadedException("Phone model chưa được load.")
    
    # Import cv2 lazily
    import cv2
    
    raw = __import__('base64').b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    
    # Preprocess image
    if phone_image_size:
        img = cv2.resize(img, (phone_image_size, phone_image_size))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    vec = gray.flatten().astype(np.float32) / 255.0
    
    x = vec.reshape(1, -1)
    
    pred_idx = int(phone_model.predict(x)[0])
    
    if hasattr(phone_model, "predict_proba"):
        proba = phone_model.predict_proba(x)[0]
    else:
        proba = None
    
    label = phone_idx_to_label.get(pred_idx, str(pred_idx))
    
    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[phone_idx_to_label.get(i, str(i))] = float(p)
    
    return {
        "label": label,
        "prob": float(max(scores.values())) if scores else None,
        "scores": scores,
    }
