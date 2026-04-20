"""Data access layer for DMS backend."""

from .database import get_mysql_conn, DRIVING_ALERT_TYPES
from .identity_repository import (
    ensure_identity_tables,
    get_driver_identity,
    save_driver_identity,
    get_telegram_owner,
    save_telegram_owner,
    create_decision_request,
    get_pending_decision,
    update_decision_status,
)
from .driving_session_repository import (
    ensure_driving_session_tables,
    create_session,
    end_session,
    increment_alert_count,
    get_session_alerts,
)

__all__ = [
    "get_mysql_conn",
    "DRIVING_ALERT_TYPES",
    "ensure_identity_tables",
    "get_driver_identity",
    "save_driver_identity",
    "get_telegram_owner",
    "save_telegram_owner",
    "create_decision_request",
    "get_pending_decision",
    "update_decision_status",
    "ensure_driving_session_tables",
    "create_session",
    "end_session",
    "increment_alert_count",
    "get_session_alerts",
]
