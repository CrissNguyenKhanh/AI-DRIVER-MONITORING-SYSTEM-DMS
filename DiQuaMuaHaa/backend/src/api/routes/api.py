"""Bridge to the current local/dev Flask + Socket.IO implementation."""

from data.api.api import app, socketio

__all__ = ["app", "socketio"]

