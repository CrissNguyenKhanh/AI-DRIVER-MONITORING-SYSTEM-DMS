import os  # noqa: E402

# Giảm xung đột BLAS đa luồng với eventlet/gunicorn (tránh crash im lặng → 500 HTML, mất CORS)
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

# Flask-SocketIO uses its threading transport on Windows. Importing/patching
# eventlet there is unnecessary and can prevent startup when a platform wheel
# is unavailable. Linux deployment keeps the eventlet worker used by Render.
if os.name != "nt":
    import eventlet  # noqa: E402

    eventlet.monkey_patch()  # Must run before importing Flask/SocketIO.

from data.api.api import app, socketio  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
