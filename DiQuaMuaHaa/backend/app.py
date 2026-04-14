import eventlet
eventlet.monkey_patch()  # PHẢI gọi trước tất cả import khác

import os  # noqa: E402
from data.api.api import app, socketio  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
