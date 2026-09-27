"""Shared, explicit browser-origin policy (no credentials with wildcard)."""
import os
from urllib.parse import urlsplit


def cors_origins():
    value = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173,https://127.0.0.1:5173")
    origins = list(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname
                or parsed.username or parsed.password or "*" in origin
                or parsed.path or parsed.query or parsed.fragment):
            raise ValueError("CORS_ALLOWED_ORIGINS must contain explicit HTTP(S) origins without paths")
    return origins
