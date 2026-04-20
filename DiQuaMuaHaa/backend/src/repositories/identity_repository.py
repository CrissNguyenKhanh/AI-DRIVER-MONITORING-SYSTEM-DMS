"""
Identity repository module.
Handles all database operations for driver identity, telegram owners, and decision requests.
"""

from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from .database import get_mysql_conn


def ensure_identity_tables(cur) -> None:
    """Create identity-related tables if they don't exist."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driver_identity (
            driver_id      VARCHAR(64) PRIMARY KEY,
            name           VARCHAR(255),
            embedding_json TEXT NOT NULL,
            image_base64   TEXT,
            created_at     TIMESTAMP NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driver_telegram_owner (
            driver_id         VARCHAR(64) PRIMARY KEY,
            telegram_chat_id  BIGINT NOT NULL,
            telegram_user_id  BIGINT NULL,
            created_at        TIMESTAMP NOT NULL,
            updated_at        TIMESTAMP NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS identity_decision_requests (
            request_id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            driver_id            VARCHAR(64) NOT NULL,
            status               VARCHAR(16) NOT NULL,
            reason               VARCHAR(64) NULL,
            similarity           DOUBLE PRECISION NULL,
            threshold            DOUBLE PRECISION NULL,
            requested_at         TIMESTAMP NOT NULL,
            expires_at           TIMESTAMP NOT NULL,
            decided_at           TIMESTAMP NULL,
            decided_by_chat_id   BIGINT NULL,
            telegram_chat_id     BIGINT NULL,
            telegram_message_id  BIGINT NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_identity_driver ON identity_decision_requests (driver_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_identity_status ON identity_decision_requests (status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_identity_expires ON identity_decision_requests (expires_at)")


def get_driver_identity(driver_id: str) -> Optional[Dict[str, Any]]:
    """Get driver identity by driver_id."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT embedding_json, name, image_base64, created_at
                FROM driver_identity WHERE driver_id = %s
                """,
                (driver_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "embedding_json": row["embedding_json"],
                    "name": row["name"],
                    "image_base64": row["image_base64"],
                    "created_at": row["created_at"],
                }
            return None
    finally:
        conn.close()


def save_driver_identity(
    driver_id: str,
    name: str,
    embedding_json: str,
    image_base64: str,
    created_at: str,
) -> None:
    """Save or update driver identity."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_identity_tables(cur)
            cur.execute(
                """
                INSERT INTO driver_identity (driver_id, name, embedding_json, image_base64, created_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    embedding_json = VALUES(embedding_json),
                    image_base64 = VALUES(image_base64),
                    created_at = VALUES(created_at)
                """,
                (driver_id, name, embedding_json, image_base64, created_at),
            )
        conn.commit()
    finally:
        conn.close()


def get_telegram_owner(driver_id: str) -> Optional[Dict[str, Any]]:
    """Get telegram owner info by driver_id."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT driver_id, name, image_base64, created_at
                FROM driver_identity WHERE driver_id = %s
                """,
                (driver_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "driver_id": row["driver_id"],
                    "name": row["name"],
                    "image_base64": row["image_base64"],
                    "created_at": row["created_at"],
                }
            return None
    finally:
        conn.close()


def save_telegram_owner(
    driver_id: str,
    chat_id: int,
    user_id: Optional[int] = None,
) -> None:
    """Save or update telegram owner binding."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_identity_tables(cur)
            cur.execute(
                """
                INSERT INTO driver_telegram_owner
                    (driver_id, telegram_chat_id, telegram_user_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    telegram_chat_id = VALUES(telegram_chat_id),
                    telegram_user_id = VALUES(telegram_user_id),
                    updated_at = VALUES(updated_at)
                """,
                (driver_id, chat_id, user_id, now, now),
            )
        conn.commit()
    finally:
        conn.close()


def get_pending_decision(driver_id: str) -> Optional[Dict[str, Any]]:
    """Get pending decision request for driver."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT request_id, expires_at
                FROM identity_decision_requests
                WHERE driver_id = %s AND status = 'pending'
                ORDER BY request_id DESC
                LIMIT 1
                """,
                (driver_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "request_id": int(row["request_id"]),
                    "expires_at": row["expires_at"],
                }
            return None
    finally:
        conn.close()


def create_decision_request(
    driver_id: str,
    reason: str,
    similarity: float,
    threshold: float,
    timeout_sec: int = 30,
) -> Tuple[int, int]:
    """
    Create a new identity decision request.
    Returns: (request_id, chat_id)
    Raises: ValueError if no telegram owner found for driver
    """
    now = datetime.utcnow()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    expires = (now + __import__('datetime').timedelta(seconds=timeout_sec)).strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_identity_tables(cur)

            # Check for existing pending request
            pending = get_pending_decision(driver_id)
            if pending:
                exp = pending["expires_at"]
                exp_dt = exp if isinstance(exp, datetime) else datetime.strptime(exp, "%Y-%m-%d %H:%M:%S")
                if exp_dt > now:
                    remaining = int((exp_dt - now).total_seconds())
                    return pending["request_id"], remaining
                # Expire old request
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s
                    WHERE request_id = %s
                    """,
                    (now_str, pending["request_id"]),
                )

            # Get telegram owner
            cur.execute(
                """
                SELECT telegram_chat_id
                FROM driver_telegram_owner
                WHERE driver_id = %s
                LIMIT 1
                """,
                (driver_id,),
            )
            owner_row = cur.fetchone()
            if not owner_row:
                raise ValueError("Chưa bind Telegram chat_id cho driver_id này.")

            chat_id = int(owner_row["telegram_chat_id"])

            # Create new request
            cur.execute(
                """
                INSERT INTO identity_decision_requests
                    (driver_id, status, reason, similarity, threshold, requested_at, expires_at, telegram_chat_id)
                VALUES (%s, 'pending', %s, %s, %s, %s, %s, %s)
                RETURNING request_id
                """,
                (driver_id, reason, similarity, threshold, now_str, expires, chat_id),
            )
            request_id = int(cur.fetchone()[0])

        conn.commit()
        return request_id, chat_id
    finally:
        conn.close()


def update_decision_status(
    request_id: int,
    status: str,
    decided_by_chat_id: Optional[int] = None,
    reason: Optional[str] = None,
) -> bool:
    """Update decision request status."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE identity_decision_requests
                SET status = %s, decided_at = %s, decided_by_chat_id = %s, reason = %s
                WHERE request_id = %s
                """,
                (status, now, decided_by_chat_id, reason, request_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
        return updated
    finally:
        conn.close()


def get_decision_status(request_id: int) -> Optional[Dict[str, Any]]:
    """Get decision status by request_id."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_id, driver_id, status, reason, similarity, threshold,
                       requested_at, expires_at, decided_at, decided_by_chat_id
                FROM identity_decision_requests
                WHERE request_id = %s
                """,
                (request_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    "request_id": int(row["request_id"]),
                    "driver_id": row["driver_id"],
                    "status": row["status"],
                    "reason": row["reason"],
                    "similarity": row["similarity"],
                    "threshold": row["threshold"],
                    "requested_at": row["requested_at"],
                    "expires_at": row["expires_at"],
                    "decided_at": row["decided_at"],
                    "decided_by_chat_id": row["decided_by_chat_id"],
                }
            return None
    finally:
        conn.close()
