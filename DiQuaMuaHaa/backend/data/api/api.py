"""Thin API entrypoint that assembles the local/dev backend modules."""

from .runtime import app, socketio

# Import for side effects: these modules register Flask routes / Socket.IO handlers.
from src.api.routers import auth_routes  # noqa: F401
from src.api.routers import monitor_routes  # noqa: F401
from src.api.routers import session_routes  # noqa: F401
from . import socket_handlers  # noqa: F401

# Bind socketio vào app
socketio.init_app(app)

__all__ = ["app", "socketio"]

# Chạy trực tiếp hoặc qua python -m đều được
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=8000, debug=True, allow_unsafe_werkzeug=True)