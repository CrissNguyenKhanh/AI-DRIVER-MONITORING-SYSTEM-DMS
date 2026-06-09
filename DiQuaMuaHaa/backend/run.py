# run.py
from data.api.api import app, socketio

if __name__ == "__main__":
   socketio.run(
    app,
    host="0.0.0.0",
    port=8000,
    debug=True,
    use_reloader=False,       # ← không watch file thay đổi
    allow_unsafe_werkzeug=True
)