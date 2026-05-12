"""Database Connection and Utilities Repository.

Handles MySQL connection and table initialization for DMS.
"""

from __future__ import annotations

import pymysql
from typing import Any, Dict

from src.core.config import MYSQL_CONFIG


def get_mysql_conn():
    """Get a MySQL connection using the configured MYSQL_CONFIG."""
    return pymysql.connect(**MYSQL_CONFIG)


def _ensure_identity_tables(cur) -> None:
    """Ensure identity-related tables exist."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driver_identity (
            driver_id      VARCHAR(64) PRIMARY KEY,
            name           VARCHAR(255),
            embedding_json LONGTEXT NOT NULL,
            image_base64   LONGTEXT,
            created_at     DATETIME NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driver_telegram_owner (
            driver_id         VARCHAR(64) PRIMARY KEY,
            telegram_chat_id  BIGINT NOT NULL,
            telegram_user_id  BIGINT NULL,
            created_at        DATETIME NOT NULL,
            updated_at        DATETIME NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS identity_decision_requests (
            request_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
            driver_id            VARCHAR(64) NOT NULL,
            status               VARCHAR(16) NOT NULL,
            reason               VARCHAR(64) NULL,
            similarity           DOUBLE NULL,
            threshold            DOUBLE NULL,
            requested_at         DATETIME NOT NULL,
            expires_at           DATETIME NOT NULL,
            decided_at           DATETIME NULL,
            decided_by_chat_id   BIGINT NULL,
            telegram_chat_id     BIGINT NULL,
            telegram_message_id  BIGINT NULL,
            INDEX idx_identity_driver (driver_id),
            INDEX idx_identity_status (status),
            INDEX idx_identity_expires (expires_at)
        )
        """
    )


def _ensure_driving_session_tables(cur) -> None:
    """Ensure driving session tracking tables exist."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driving_sessions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            driver_id VARCHAR(64) NULL,
            label VARCHAR(128) NULL,
            started_at DATETIME NOT NULL,
            ended_at DATETIME NULL,
            INDEX idx_driving_driver (driver_id),
            INDEX idx_driving_started (started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driving_session_alerts (
            session_id BIGINT NOT NULL,
            alert_type VARCHAR(32) NOT NULL,
            count INT NOT NULL DEFAULT 0,
            PRIMARY KEY (session_id, alert_type),
            INDEX idx_dsa_session (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


# Driving alert types
DRIVING_ALERT_TYPES = frozenset(
    {"phone", "smoking", "drowsy", "identity_lock", "landmark_risk", "other"}
)

__all__ = [
    "get_mysql_conn",
    "_ensure_identity_tables",
    "_ensure_driving_session_tables",
    "DRIVING_ALERT_TYPES",
]
