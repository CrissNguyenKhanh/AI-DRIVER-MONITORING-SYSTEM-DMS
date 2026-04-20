"""
Driving session repository module.
Handles all database operations for driving sessions and alerts.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from .database import get_mysql_conn, DRIVING_ALERT_TYPES


def ensure_driving_session_tables(cur) -> None:
    """Create driving session tables if they don't exist."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driving_sessions (
            id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            driver_id  VARCHAR(64) NULL,
            label      VARCHAR(128) NULL,
            started_at TIMESTAMP NOT NULL,
            ended_at   TIMESTAMP NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_driving_driver ON driving_sessions (driver_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_driving_started ON driving_sessions (started_at)")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driving_session_alerts (
            session_id BIGINT NOT NULL,
            alert_type VARCHAR(32) NOT NULL,
            count      INT NOT NULL DEFAULT 0,
            PRIMARY KEY (session_id, alert_type)
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dsa_session ON driving_session_alerts (session_id)")


def create_session(driver_id: Optional[str], label: Optional[str] = None) -> int:
    """
    Create a new driving session.
    Returns: session_id
    """
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_driving_session_tables(cur)
            cur.execute(
                """
                INSERT INTO driving_sessions (driver_id, label, started_at)
                VALUES (%s, %s, %s)
                """,
                (driver_id, label, now),
            )
            session_id = cur.lastrowid
        conn.commit()
        return session_id
    finally:
        conn.close()


def end_session(session_id: int) -> bool:
    """
    End a driving session.
    Returns: True if session was found and updated
    """
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE driving_sessions
                SET ended_at = %s
                WHERE id = %s AND ended_at IS NULL
                """,
                (now, session_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
        return updated
    finally:
        conn.close()


def get_session(session_id: int) -> Optional[Dict[str, Any]]:
    """Get session details by ID."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, driver_id, label, started_at, ended_at
                FROM driving_sessions
                WHERE id = %s
                """,
                (session_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "id": int(row["id"]),
                    "driver_id": row["driver_id"],
                    "label": row["label"],
                    "started_at": row["started_at"],
                    "ended_at": row["ended_at"],
                }
            return None
    finally:
        conn.close()


def increment_alert_count(session_id: int, alert_type: str) -> int:
    """
    Increment alert count for a session.
    Returns: new count
    Raises: ValueError if alert_type is invalid
    """
    if alert_type not in DRIVING_ALERT_TYPES:
        raise ValueError(f"Invalid alert_type: {alert_type}")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO driving_session_alerts (session_id, alert_type, count)
                VALUES (%s, %s, 1)
                ON DUPLICATE KEY UPDATE count = count + 1
                """,
                (session_id, alert_type),
            )
            # Get updated count
            cur.execute(
                """
                SELECT count FROM driving_session_alerts
                WHERE session_id = %s AND alert_type = %s
                """,
                (session_id, alert_type),
            )
            row = cur.fetchone()
            new_count = row["count"] if row else 1
        conn.commit()
        return new_count
    finally:
        conn.close()


def get_session_alerts(session_id: int) -> List[Dict[str, Any]]:
    """Get all alerts for a session."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT alert_type, count
                FROM driving_session_alerts
                WHERE session_id = %s
                """,
                (session_id,),
            )
            rows = cur.fetchall()
            return [
                {"alert_type": row["alert_type"], "count": row["count"]}
                for row in rows
            ]
    finally:
        conn.close()


def get_active_session(driver_id: str) -> Optional[Dict[str, Any]]:
    """Get active (not ended) session for driver."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, driver_id, label, started_at
                FROM driving_sessions
                WHERE driver_id = %s AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
                """,
                (driver_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "id": int(row["id"]),
                    "driver_id": row["driver_id"],
                    "label": row["label"],
                    "started_at": row["started_at"],
                }
            return None
    finally:
        conn.close()
