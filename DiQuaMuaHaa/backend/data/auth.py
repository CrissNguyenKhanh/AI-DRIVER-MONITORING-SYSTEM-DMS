from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Principal:
    role: str
    driver_id: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def generate_secret() -> str:
    """Return a high-entropy bearer token or one-time code."""
    return secrets.token_urlsafe(32)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_database_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.strptime(str(value), "%Y-%m-%d %H:%M:%S")


def extract_bearer_token(header_value: str | None) -> str | None:
    if not header_value:
        return None
    scheme, separator, token = header_value.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        return None
    token = token.strip()
    if " " in token:
        return None
    return token


def ensure_auth_tables(cur: Any, *, postgres: bool) -> None:
    """Create the additive auth schema for either supported database dialect."""
    timestamp_type = "TIMESTAMP" if postgres else "DATETIME"
    engine = "" if postgres else " ENGINE=InnoDB"

    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS dms_auth_sessions (
            token_hash VARCHAR(64) PRIMARY KEY,
            driver_id  VARCHAR(64) NULL,
            role       VARCHAR(16) NOT NULL,
            created_at {timestamp_type} NOT NULL,
            expires_at {timestamp_type} NOT NULL,
            revoked_at {timestamp_type} NULL
        ){engine}
        """
    )
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS dms_one_time_codes (
            code_hash  VARCHAR(64) PRIMARY KEY,
            driver_id  VARCHAR(64) NOT NULL,
            purpose    VARCHAR(32) NOT NULL,
            created_at {timestamp_type} NOT NULL,
            expires_at {timestamp_type} NOT NULL,
            used_at    {timestamp_type} NULL
        ){engine}
        """
    )
    if postgres:
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_dms_auth_driver ON dms_auth_sessions (driver_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_dms_code_driver ON dms_one_time_codes (driver_id, purpose)"
        )
    else:
        # MySQL does not support CREATE INDEX IF NOT EXISTS consistently. The
        # primary-key lookups used by auth remain indexed without extra DDL.
        pass

    cur.connection.commit()
