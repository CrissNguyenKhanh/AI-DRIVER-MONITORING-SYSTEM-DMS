"""Thin API entrypoint that assembles the local/dev backend modules."""

from .runtime import app, socketio

# Import for side effects: these modules register Flask routes / Socket.IO handlers.
from . import routes_driving  # noqa: F401
from . import routes_identity  # noqa: F401
from . import routes_prediction  # noqa: F401
from . import socket_handlers  # noqa: F401

__all__ = ["app", "socketio"]
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=8000, debug=True, allow_unsafe_werkzeug=True)
