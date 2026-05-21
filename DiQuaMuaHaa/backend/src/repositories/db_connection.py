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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driver_telegram_owner (
            driver_id         VARCHAR(64) PRIMARY KEY,
            telegram_chat_id  BIGINT NOT NULL,
            telegram_user_id  BIGINT NULL,
            created_at        DATETIME NOT NULL,
            updated_at        DATETIME NOT NULL,
            CONSTRAINT fk_dto_driver
                FOREIGN KEY (driver_id)
                REFERENCES driver_identity (driver_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
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
            INDEX idx_identity_expires (expires_at),
            CONSTRAINT fk_idr_driver
                FOREIGN KEY (driver_id)
                REFERENCES driver_identity (driver_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    _ensure_identity_relations(cur)


def _ensure_driving_session_tables(cur) -> None:
    """Ensure driving session tracking tables exist."""
    _ensure_identity_tables(cur)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driving_sessions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            driver_id VARCHAR(64) NULL,
            label VARCHAR(128) NULL,
            started_at DATETIME NOT NULL,
            ended_at DATETIME NULL,
            INDEX idx_driving_driver (driver_id),
            INDEX idx_driving_started (started_at),
            CONSTRAINT fk_driving_sessions_driver
                FOREIGN KEY (driver_id)
                REFERENCES driver_identity (driver_id)
                ON UPDATE CASCADE
                ON DELETE SET NULL
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
            INDEX idx_dsa_session (session_id),
            CONSTRAINT fk_dsa_session
                FOREIGN KEY (session_id)
                REFERENCES driving_sessions (id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS driving_session_locations (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id BIGINT NOT NULL,
            lat DOUBLE NOT NULL,
            lng DOUBLE NOT NULL,
            accuracy DOUBLE NULL,
            speed DOUBLE NULL,
            heading DOUBLE NULL,
            recorded_at DATETIME NOT NULL,
            INDEX idx_dsl_session_time (session_id, recorded_at),
            CONSTRAINT fk_dsl_session
                FOREIGN KEY (session_id)
                REFERENCES driving_sessions (id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    _ensure_driving_session_relations(cur)


def _constraint_exists(cur, constraint_name: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = %s
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        LIMIT 1
        """,
        (constraint_name,),
    )
    return cur.fetchone() is not None


def _ensure_table_engine(cur, table_name: str) -> None:
    cur.execute(f"ALTER TABLE `{table_name}` ENGINE=InnoDB")


def _ensure_foreign_key(cur, table_name: str, constraint_name: str, definition: str) -> None:
    if _constraint_exists(cur, constraint_name):
        return
    cur.execute(f"ALTER TABLE `{table_name}` ADD CONSTRAINT {constraint_name} {definition}")


def _ensure_identity_relations(cur) -> None:
    """Add foreign keys for databases created before constraints were added."""
    for table_name in (
        "driver_identity",
        "driver_telegram_owner",
        "identity_decision_requests",
    ):
        _ensure_table_engine(cur, table_name)

    _repair_identity_orphans(cur)

    _ensure_foreign_key(
        cur,
        "driver_telegram_owner",
        "fk_dto_driver",
        """
        FOREIGN KEY (driver_id)
        REFERENCES driver_identity (driver_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
        """,
    )
    _ensure_foreign_key(
        cur,
        "identity_decision_requests",
        "fk_idr_driver",
        """
        FOREIGN KEY (driver_id)
        REFERENCES driver_identity (driver_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
        """,
    )


def _ensure_driving_session_relations(cur) -> None:
    """Add driving-session foreign keys for existing databases."""
    for table_name in (
        "driving_sessions",
        "driving_session_alerts",
        "driving_session_locations",
    ):
        _ensure_table_engine(cur, table_name)

    _repair_driving_session_orphans(cur)

    _ensure_foreign_key(
        cur,
        "driving_sessions",
        "fk_driving_sessions_driver",
        """
        FOREIGN KEY (driver_id)
        REFERENCES driver_identity (driver_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
        """,
    )
    _ensure_foreign_key(
        cur,
        "driving_session_alerts",
        "fk_dsa_session",
        """
        FOREIGN KEY (session_id)
        REFERENCES driving_sessions (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
        """,
    )
    _ensure_foreign_key(
        cur,
        "driving_session_locations",
        "fk_dsl_session",
        """
        FOREIGN KEY (session_id)
        REFERENCES driving_sessions (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
        """,
    )


def _repair_identity_orphans(cur) -> None:
    cur.execute(
        """
        DELETE dto
        FROM driver_telegram_owner dto
        LEFT JOIN driver_identity di ON di.driver_id = dto.driver_id
        WHERE di.driver_id IS NULL
        """
    )
    cur.execute(
        """
        DELETE idr
        FROM identity_decision_requests idr
        LEFT JOIN driver_identity di ON di.driver_id = idr.driver_id
        WHERE di.driver_id IS NULL
        """
    )


def _repair_driving_session_orphans(cur) -> None:
    cur.execute(
        """
        UPDATE driving_sessions ds
        LEFT JOIN driver_identity di ON di.driver_id = ds.driver_id
        SET ds.driver_id = NULL
        WHERE ds.driver_id IS NOT NULL
          AND di.driver_id IS NULL
        """
    )
    cur.execute(
        """
        DELETE dsa
        FROM driving_session_alerts dsa
        LEFT JOIN driving_sessions ds ON ds.id = dsa.session_id
        WHERE ds.id IS NULL
        """
    )
    cur.execute(
        """
        DELETE dsl
        FROM driving_session_locations dsl
        LEFT JOIN driving_sessions ds ON ds.id = dsl.session_id
        WHERE ds.id IS NULL
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
