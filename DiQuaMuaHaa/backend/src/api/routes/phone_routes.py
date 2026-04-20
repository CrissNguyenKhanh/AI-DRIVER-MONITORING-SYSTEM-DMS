"""
Phone detection routes blueprint.
"""

from flask import Blueprint, jsonify, request

from services.prediction_service import predict_phone
from utils.image_processing import ensure_models_loaded
from core.exceptions import ModelNotLoadedException, ValidationException

phone_bp = Blueprint("phone", __name__)


@phone_bp.post("/api/phone/predict_from_frame")
def phone_predict_from_frame():
    """
    Detect phone usage from image.
    Body: { "image": "data:image/jpeg;base64,..." }
    """
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
        result = predict_phone(image_b64)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except ModelNotLoadedException as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
