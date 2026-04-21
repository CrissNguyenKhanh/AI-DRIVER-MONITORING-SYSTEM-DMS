import os

try:
    import eventlet

    eventlet.monkey_patch()
except Exception:
    eventlet = None

from src.api.routes.api import app, socketio


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
