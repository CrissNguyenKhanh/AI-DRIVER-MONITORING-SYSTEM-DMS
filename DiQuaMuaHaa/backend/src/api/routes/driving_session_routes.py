"""
Driving session routes blueprint.
Handles driving session lifecycle and alerts.
"""

from flask import Blueprint, jsonify, request

from src.services.driving_session_service import (
    start_session,
    end_session,
    record_alert,
    get_session_summary,
)
from src.core.exceptions import ValidationException

driving_session_bp = Blueprint("driving_session", __name__)


@driving_session_bp.post("/api/driving/session/start")
def driving_session_start():
    """Start a new driving session."""
    try:
        payload = request.get_json(silent=True) or {}
        driver_id = (payload.get("driver_id") or "").strip() or None
        label = (payload.get("label") or "").strip() or None
        
        result = start_session(driver_id, label)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@driving_session_bp.post("/api/driving/session/end")
def driving_session_end():
    """End a driving session."""
    try:
        payload = request.get_json(silent=True) or {}
        session_id = payload.get("session_id")
        
        if not session_id:
            return jsonify({"error": "Thiếu 'session_id'."}), 400
        
        result = end_session(int(session_id))
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@driving_session_bp.post("/api/driving/session/alert")
def driving_session_alert():
    """Record an alert for a session."""
    try:
        payload = request.get_json(silent=True) or {}
        session_id = payload.get("session_id")
        alert_type = payload.get("alert_type")
        delta = int(payload.get("delta", 1))
        
        if not session_id or not alert_type:
            return jsonify({"error": "Thiếu 'session_id' hoặc 'alert_type'."}), 400
        
        result = record_alert(int(session_id), alert_type, delta)
        return jsonify(result)
    except ValidationException as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@driving_session_bp.get("/api/driving/session/<int:session_id>")
def driving_session_detail(session_id):
    """Get session details with alerts."""
    try:
        result = get_session_summary(session_id)
        if result is None:
            return jsonify({"error": "Session not found."}), 404
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
