"""
DMS Backend API - Entry Point
=============================

Refactored from 2550 lines to ~60 lines using Layered Architecture:
- Core: Config, Exceptions
- Repositories: Database, Identity, Driving Session
- Services: Model Loader, Telegram, Identity, Prediction, Driving Session
- Utils: Image Processing, Embeddings
- Routes: 5 Flask Blueprints
- WebSocket: Real-time handlers

Phase E - Backend Refactor: 100% Complete
"""

from __future__ import annotations

# ═══════════════════════════════════════════════════════════════
# Core imports
# ═══════════════════════════════════════════════════════════════
from src.core.config import app  # Flask app with CORS configured
from src.core.exceptions import DMSException  # Base exception

# ═══════════════════════════════════════════════════════════════
# Register Blueprints (Controllers)
# ═══════════════════════════════════════════════════════════════
from src.api.routes import (
    system_bp,         # /, /api/ping-db
    dms_bp,            # /api/landmark/*, /api/hand/*
    identity_bp,       # /api/identity/*
    smoking_bp,        # /api/smoking/*
    phone_bp,          # /api/phone/*
    driving_session_bp, # /api/driving/session/*
)

app.register_blueprint(system_bp)
app.register_blueprint(dms_bp)
app.register_blueprint(identity_bp)
app.register_blueprint(smoking_bp)
app.register_blueprint(phone_bp)
app.register_blueprint(driving_session_bp)

# ═══════════════════════════════════════════════════════════════
# Import WebSocket handlers (registers @socketio.on events)
# ═══════════════════════════════════════════════════════════════
from src.api.websocket.dms_websocket import socketio  # noqa: F401

# Note: WebSocket handlers auto-register when module is imported
# socketio object is initialized in dms_websocket.py with the Flask app

# ═══════════════════════════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    # Get socketio from websocket module (already bound to app)
    from src.api.websocket.dms_websocket import socketio as _socketio
    
    _socketio.run(
        app,
        host="0.0.0.0",
        port=8000,
        debug=True,
        allow_unsafe_werkzeug=True
    )
