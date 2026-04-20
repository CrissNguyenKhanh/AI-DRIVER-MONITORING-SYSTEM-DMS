"""
DMS routes blueprint.
Landmark and hand prediction endpoints.
"""

from flask import Blueprint, jsonify, request

from src.services.prediction_service import (
    predict_landmark,
    predict_from_frame,
    predict_hand,
    predict_hand_from_frame,
)
from src.utils.image_processing import ensure_models_loaded
from src.core.exceptions import ModelNotLoadedException, ValidationException

dms_bp = Blueprint("dms", __name__)


@dms_bp.post("/api/landmark/predict")
def landmark_predict():
    """
    Predict from landmark vector directly.
    Body: { "landmarks": [x, y, z, ...] }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    if "landmarks" not in payload:
        return jsonify({"error": "Thiếu trường 'landmarks' trong JSON body."}), 400
    
    landmarks = payload["landmarks"]
    if not isinstance(landmarks, list):
        return jsonify({"error": "'landmarks' phải là một mảng số."}), 400
    
    try:
        vec = [float(v) for v in landmarks]
    except (TypeError, ValueError):
        return jsonify({"error": "'landmarks' chứa phần tử không phải số."}), 400
    
    try:
        ensure_models_loaded()
        result = predict_landmark(vec)
        return jsonify(result)
    except ModelNotLoadedException as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500


@dms_bp.post("/api/landmark/predict_from_frame")
def landmark_predict_from_frame():
    """
    Predict from base64 image.
    Body: { "image": "data:image/jpeg;base64,..." }
    """
    import traceback
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    image_b64 = payload.get("image")
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400
    
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]
    
    try:
        ensure_models_loaded()
        result = predict_from_frame(image_b64)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except ModelNotLoadedException as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        print(f"[ERROR] landmark_predict_from_frame: {exc}")
        print(traceback.format_exc())
        return jsonify({"error": str(exc), "traceback": traceback.format_exc()}), 500


@dms_bp.post("/api/hand/predict")
def hand_predict():
    """
    Predict hand gesture from landmark vector.
    Body: { "landmarks": [x, y, z, ...] }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    if "landmarks" not in payload:
        return jsonify({"error": "Thiếu trường 'landmarks' trong JSON body."}), 400
    
    landmarks = payload["landmarks"]
    if not isinstance(landmarks, list):
        return jsonify({"error": "'landmarks' phải là một mảng số."}), 400
    
    try:
        vec = [float(v) for v in landmarks]
    except (TypeError, ValueError):
        return jsonify({"error": "'landmarks' chứa phần tử không phải số."}), 400
    
    try:
        ensure_models_loaded()
        result = predict_hand(vec)
        return jsonify(result)
    except ModelNotLoadedException as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500


@dms_bp.post("/api/hand/predict_from_frame")
def hand_predict_from_frame():
    """
    Predict hand gesture from base64 image.
    Body: { "image": "data:image/jpeg;base64,..." }
    """
    import traceback
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    image_b64 = payload.get("image")
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400
    
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]
    
    try:
        ensure_models_loaded()
        result = predict_hand_from_frame(image_b64)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except ModelNotLoadedException as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        print(f"[ERROR] hand_predict_from_frame: {exc}")
        print(traceback.format_exc())
        return jsonify({"error": str(exc), "traceback": traceback.format_exc()}), 500
