import os  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv()  # Đọc file .env (chỉ có tác dụng khi dev local, Render dùng env vars thật)

# Giảm xung đột BLAS đa luồng với eventlet/gunicorn (tránh crash im lặng → 500 HTML, mất CORS)
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import eventlet  # noqa: E402

eventlet.monkey_patch()  # PHẢI gọi trước import Flask/SocketIO

from data.api.api import app, socketio  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
