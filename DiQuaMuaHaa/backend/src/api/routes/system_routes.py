"""
System routes blueprint.
Health check and ping endpoints.
"""

from flask import Blueprint, jsonify

from core.config import MYSQL_CONFIG, DATABASE_URL
from repositories.database import get_mysql_conn

system_bp = Blueprint("system", __name__)


@system_bp.get("/")
def index():
    """Root endpoint - list available endpoints."""
    return jsonify({
        "status": "ok",
        "message": "DMS Backend is running",
        "endpoints": [
            "POST /api/hand/predict_from_frame",
            "POST /api/landmark/predict_from_frame",
            "POST /api/identity/register",
            "POST /api/identity/verify",
            "GET  /api/identity/driver_profile",
            "POST /api/identity/request_decision",
            "GET  /api/identity/decision_status",
        ]
    })


@system_bp.get("/api/ping-db")
def ping_db():
    """Test database connection."""
    try:
        conn = get_mysql_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        return jsonify({
            "status": "ok",
            "message": "Database connected!",
            "host": MYSQL_CONFIG.get("host", "N/A"),
            "database": MYSQL_CONFIG.get("database", "N/A"),
        })
    except Exception as exc:
        return jsonify({
            "status": "error",
            "error": str(exc),
            "host": MYSQL_CONFIG.get("host", "N/A"),
            "database": MYSQL_CONFIG.get("database", "N/A"),
        }), 500
