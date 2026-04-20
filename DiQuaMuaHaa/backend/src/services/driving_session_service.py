"""
Driving session service module.
Handles driving session lifecycle and alert tracking.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from src.repositories.driving_session_repository import (
    create_session as repo_create_session,
    end_session as repo_end_session,
    increment_alert_count as repo_increment_alert_count,
    get_session_alerts as repo_get_session_alerts,
    get_session as repo_get_session,
    get_active_session as repo_get_active_session,
)
from src.repositories.database import DRIVING_ALERT_TYPES
from src.core.exceptions import ValidationException


def start_session(driver_id: Optional[str], label: Optional[str] = None) -> Dict[str, Any]:
    """
    Start a new driving session.
    
    Returns:
        Dict with session_id, driver_id, label, started_at
    """
    session_id = repo_create_session(driver_id, label)
    
    return {
        "status": "ok",
        "session_id": session_id,
        "driver_id": driver_id,
        "label": label,
    }


def end_session(session_id: int) -> Dict[str, Any]:
    """
    End a driving session.
    
    Returns:
        Dict with status, session_id, ended
    """
    ended = repo_end_session(session_id)
    
    return {
        "status": "ok" if ended else "error",
        "session_id": session_id,
        "ended": ended,
        "message": "Session ended" if ended else "Session not found or already ended",
    }


def record_alert(session_id: int, alert_type: str, delta: int = 1) -> Dict[str, Any]:
    """
    Record an alert for a session.
    
    Args:
        session_id: Session ID
        alert_type: Type of alert (phone, smoking, drowsy, etc.)
        delta: Increment amount (default 1)
        
    Returns:
        Dict with status, session_id, alert_type, new_count
    """
    if alert_type not in DRIVING_ALERT_TYPES:
        raise ValidationException(f"alert_type phải là một trong: {DRIVING_ALERT_TYPES}")
    
    new_count = repo_increment_alert_count(session_id, alert_type)
    
    return {
        "status": "ok",
        "session_id": session_id,
        "alert_type": alert_type,
        "new_count": new_count,
    }


def get_session_summary(session_id: int) -> Optional[Dict[str, Any]]:
    """
    Get session details with alert summary.
    
    Returns:
        Dict with session info and alerts, or None if not found
    """
    session = repo_get_session(session_id)
    if session is None:
        return None
    
    alerts = repo_get_session_alerts(session_id)
    
    return {
        "id": session["id"],
        "driver_id": session["driver_id"],
        "label": session["label"],
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "alerts": alerts,
        "total_alerts": sum(a["count"] for a in alerts),
    }


def get_driver_active_session(driver_id: str) -> Optional[Dict[str, Any]]:
    """Get active (not ended) session for driver."""
    return repo_get_active_session(driver_id)


def format_session_list(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Format session list for API response."""
    return [
        {
            "id": s["id"],
            "driver_id": s["driver_id"],
            "label": s["label"],
            "started_at": _format_datetime(s["started_at"]),
            "ended_at": _format_datetime(s["ended_at"]) if s.get("ended_at") else None,
        }
        for s in sessions
    ]


def _format_datetime(v: Any) -> Optional[str]:
    """Format datetime to ISO string."""
    if v is None:
        return None
    from datetime import datetime
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)
