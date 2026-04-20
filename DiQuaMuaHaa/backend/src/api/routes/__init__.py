"""API Routes package."""

from .system_routes import system_bp
from .dms_routes import dms_bp
from .identity_routes import identity_bp
from .smoking_routes import smoking_bp
from .phone_routes import phone_bp
from .driving_session_routes import driving_session_bp

__all__ = [
    "system_bp",
    "dms_bp",
    "identity_bp",
    "smoking_bp",
    "phone_bp",
    "driving_session_bp",
]
