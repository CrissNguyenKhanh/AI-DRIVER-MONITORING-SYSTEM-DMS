"""Purpose-bound, one-time server authorization grant contracts."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping

from data.auth import parse_database_datetime


START_DRIVING_SESSION = "start_driving_session"
IDENTITY_INITIAL_ENROLL = "identity_initial_enroll"
IDENTITY_REPLACE = "identity_replace"
ALLOWED_PURPOSES = frozenset(
    {START_DRIVING_SESSION, IDENTITY_INITIAL_ENROLL, IDENTITY_REPLACE}
)
CHALLENGE_STATUSES = frozenset(
    {"pending", "approved", "rejected", "expired", "revoked"}
)


def validate_grant_row(
    row: Mapping[str, Any] | None,
    *,
    driver_id: str,
    auth_session_hash: str | None,
    purpose: str,
    now: datetime | None = None,
) -> str | None:
    """Return a stable denial code, or ``None`` when a grant may be consumed."""
    if row is None:
        return "invalid_grant"
    if row.get("revoked_at") is not None:
        return "grant_revoked"
    if row.get("consumed_at") is not None:
        return "grant_replayed"
    if str(row.get("driver_id") or "") != driver_id:
        return "grant_driver_mismatch"
    if not auth_session_hash or str(row.get("auth_session_hash") or "") != auth_session_hash:
        return "grant_session_mismatch"
    if str(row.get("purpose") or "") != purpose:
        return "grant_purpose_mismatch"
    try:
        if parse_database_datetime(row.get("expires_at")) <= (now or datetime.utcnow()):
            return "grant_expired"
    except (TypeError, ValueError):
        return "invalid_grant"
    return None


def challenge_expired(row: Mapping[str, Any], *, now: datetime | None = None) -> bool:
    try:
        return parse_database_datetime(row.get("expires_at")) <= (now or datetime.utcnow())
    except (TypeError, ValueError):
        return True
