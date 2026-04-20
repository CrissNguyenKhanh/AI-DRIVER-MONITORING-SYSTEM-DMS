"""
Identity routes blueprint.
Face registration, verification, and owner decision endpoints.
"""

from flask import Blueprint, jsonify, request

from services.identity_service import (
    register_driver_identity,
    verify_driver_identity,
    get_driver_profile,
    bind_telegram_owner,
    request_identity_decision,
    get_identity_decision_status,
    process_identity_decision,
)
from utils.image_processing import extract_images_from_payload
from core.exceptions import IdentityVerificationException, ValidationException
from core.config import IDENTITY_MIN_REGISTER_SAMPLES, IDENTITY_DECISION_TIMEOUT_SEC

identity_bp = Blueprint("identity", __name__)


@identity_bp.post("/api/identity/register")
def identity_register():
    """
    Register driver identity with face images.
    Body: { "driver_id": "...", "name": "...", "image": "..." or "images": [...] }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    driver_id = str(payload.get("driver_id", "")).strip()
    name = str(payload.get("name", "")).strip()
    
    try:
        images = extract_images_from_payload(payload)
        result = register_driver_identity(
            driver_id=driver_id,
            name=name,
            images=images,
            min_samples=IDENTITY_MIN_REGISTER_SAMPLES,
        )
        return jsonify(result)
    except IdentityVerificationException as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@identity_bp.post("/api/identity/verify")
def identity_verify():
    """
    Verify driver identity against registered profile.
    Body: { "driver_id": "...", "image": "..." or "images": [...] }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    driver_id = str(payload.get("driver_id", "")).strip()
    
    try:
        images = extract_images_from_payload(payload)
        result = verify_driver_identity(
            driver_id=driver_id,
            images=images,
        )
        return jsonify(result)
    except IdentityVerificationException as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@identity_bp.get("/api/identity/driver_profile")
def driver_profile():
    """Get driver profile (name, image, created_at)."""
    driver_id = str(request.args.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu driver_id."}), 400
    
    profile = get_driver_profile(driver_id)
    if profile is None:
        return jsonify({"error": "Không tìm thấy driver_id trong hệ thống."}), 404
    
    return jsonify(profile)


@identity_bp.post("/api/identity/bind_telegram")
def bind_telegram():
    """
    Bind Telegram chat_id to driver.
    Body: { "driver_id": "...", "chat_id": 123456, "user_id": 789012 }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    driver_id = str(payload.get("driver_id", "")).strip()
    chat_id = payload.get("chat_id")
    user_id = payload.get("user_id")
    
    if not chat_id:
        return jsonify({"error": "Thiếu 'chat_id'."}), 400
    
    try:
        result = bind_telegram_owner(driver_id, int(chat_id), user_id)
        return jsonify(result)
    except IdentityVerificationException as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@identity_bp.post("/api/identity/request_decision")
def request_decision():
    """
    Request owner decision when identity verification fails.
    Body: {
        "driver_id": "...",
        "reason": "...",
        "similarity": 0.85,
        "threshold": 0.975,
        "timeout_sec": 30
    }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    driver_id = str(payload.get("driver_id", "")).strip()
    reason = str(payload.get("reason", "unknown")).strip()
    similarity = payload.get("similarity", 0.0)
    threshold = payload.get("threshold", 0.975)
    timeout_sec = int(payload.get("timeout_sec", IDENTITY_DECISION_TIMEOUT_SEC))
    
    try:
        result = request_identity_decision(
            driver_id=driver_id,
            reason=reason,
            similarity=float(similarity),
            threshold=float(threshold),
            timeout_sec=timeout_sec,
        )
        return jsonify(result)
    except IdentityVerificationException as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@identity_bp.get("/api/identity/decision_status")
def decision_status():
    """Get decision status by request_id."""
    request_id_raw = request.args.get("request_id", "").strip()
    if not request_id_raw:
        return jsonify({"error": "Thiếu query 'request_id'."}), 400
    
    try:
        request_id = int(request_id_raw)
    except ValueError:
        return jsonify({"error": "request_id phải là số nguyên."}), 400
    
    status = get_identity_decision_status(request_id)
    if status is None:
        return jsonify({"error": "Không tìm thấy request_id."}), 404
    
    return jsonify(status)


@identity_bp.post("/api/identity/process_decision")
def process_decision():
    """
    Process owner's decision (accept/reject).
    Body: { "request_id": 123, "decision": "accept", "decided_by_chat_id": 456 }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValidationException("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400
    
    request_id = payload.get("request_id")
    decision = payload.get("decision")
    decided_by_chat_id = payload.get("decided_by_chat_id")
    
    if not request_id or not decision:
        return jsonify({"error": "Thiếu 'request_id' hoặc 'decision'."}), 400
    
    if decision not in ("accept", "reject"):
        return jsonify({"error": "decision phải là 'accept' hoặc 'reject'."}), 400
    
    try:
        result = process_identity_decision(
            request_id=int(request_id),
            decision=decision,
            decided_by_chat_id=int(decided_by_chat_id) if decided_by_chat_id else None,
        )
        return jsonify(result)
    except IdentityVerificationException as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
