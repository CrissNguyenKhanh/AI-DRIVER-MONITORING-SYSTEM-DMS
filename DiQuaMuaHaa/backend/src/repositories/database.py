"""
Database connection module.
Handles MySQL and PostgreSQL connections.
"""

import pymysql
from typing import Set

try:
    import psycopg2
    import psycopg2.extras
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

# Import from core to avoid circular imports
from core.config import MYSQL_CONFIG, DATABASE_URL


def get_mysql_conn():
    """Kết nối database — tự động dùng PostgreSQL nếu có DATABASE_URL, fallback MySQL."""
    if DATABASE_URL and POSTGRES_AVAILABLE:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
        return conn
    return pymysql.connect(**MYSQL_CONFIG)


# Allowed alert types for driving sessions
DRIVING_ALERT_TYPES: Set[str] = frozenset(
    {"phone", "smoking", "drowsy", "identity_lock", "landmark_risk", "other"}
)
