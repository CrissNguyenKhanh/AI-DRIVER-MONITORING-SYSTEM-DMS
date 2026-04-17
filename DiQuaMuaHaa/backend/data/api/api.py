from __future__ import annotations
from flask_socketio import SocketIO, emit
import base64
import os
import threading
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

# cv2 và joblib được import lazy trong _ensure_models_loaded() để giảm RAM startup
cv2 = None  # type: ignore[assignment]
joblib = None  # type: ignore[assignment]
try:
    import pymysql

    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
try:
    import psycopg2
    import psycopg2.extras
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False
import json
from datetime import datetime, timedelta
from urllib import parse, request as urlrequest
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from ultralytics import YOLO  # type: ignore

    YOLO_AVAILABLE = True
except Exception:  # ImportError, RuntimeError, ...
    YOLO_AVAILABLE = False


app = Flask(__name__)
CORS(app, origins="*", supports_credentials=True)

# Tránh lỗi server khi client gửi base64 ảnh quá lớn
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25MB

# Khi worker crash / exception ngoài view, vẫn gửi CORS để browser không báo sai "CORS"
@app.after_request
def _cors_all_responses(response: Any):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With",
    )
    response.headers.setdefault(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    )
    return response


@app.errorhandler(413)
def too_large(_err):
    return jsonify({"error": "Request payload too large"}), 413


BASE_DIR = Path(__file__).resolve().parents[2]  # .../backend
MODEL_PATH = BASE_DIR / "driver_training" / "models" / "landmark_model.pkl"
HAND_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "hand_model.pkl"
SMOKING_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "smoking_model.pkl"
PHONE_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_model.pkl"
PHONE_YOLO_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_yolo.pt"
PHONE_YOLO_ONNX_PATH  = BASE_DIR / "driver_training" / "models" / "phone_yolo.onnx"

# MySQL config — đọc từ biến môi trường để tương thích Render / Cloud
# Trên Render: vào Environment → thêm MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "localhost"),
    "port":     int(os.getenv("MYSQL_PORT", "3306")),
    "user":     os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "diquamuaha"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

# Model landmark 2-class (safe/drowsy): nếu top1 - top2 < margin hoặc top1 < confidence → "safe"
LANDMARK_AMBIGUOUS_MARGIN = float(os.getenv("LANDMARK_AMBIGUOUS_MARGIN", "0.05"))
LANDMARK_MIN_CONFIDENCE = float(os.getenv("LANDMARK_MIN_CONFIDENCE", "0.52"))
LANDMARK_FLIP_INPUT = os.getenv("LANDMARK_FLIP_INPUT", "0") == "1"

# Trên Render 512MB: set DISABLE_HAND_DETECT=1 để bỏ qua MediaPipe Hands + hand_model (~80MB)
DISABLE_HAND_DETECT = os.getenv("DISABLE_HAND_DETECT", "0") == "1"

# Phone YOLO/ONNX tốn ~80–100MB RAM — trên Render mặc định tắt (RENDER=true).
# Local: cài thêm `pip install onnxruntime` (xem requirements-phone.txt) rồi set DISABLE_PHONE_YOLO=0
_ON_RENDER = os.getenv("RENDER", "").lower() in ("true", "1", "yes")
DISABLE_PHONE_YOLO = os.getenv("DISABLE_PHONE_YOLO", "1" if _ON_RENDER else "0") == "1"

IDENTITY_SIM_THRESHOLD = float(os.getenv("IDENTITY_SIM_THRESHOLD", "0.975"))
IDENTITY_MIN_REGISTER_SAMPLES = int(os.getenv("IDENTITY_MIN_REGISTER_SAMPLES", "3"))
IDENTITY_MIN_VERIFY_SAMPLES = int(os.getenv("IDENTITY_MIN_VERIFY_SAMPLES", "2"))
IDENTITY_DECISION_TIMEOUT_SEC = int(os.getenv("IDENTITY_DECISION_TIMEOUT_SEC", "30"))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8778925999:AAEvtjjjwulzUvGTC8ThTfvwOkJ7ALGuyoQ").strip()
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "Khanhdz123").strip()


artifact: Dict[str, Any] | None = None
model = None
idx_to_label: Dict[int, str] = {}

hand_artifact: Dict[str, Any] | None = None
hand_model = None
hand_idx_to_label: Dict[int, str] = {}
hand_vec_len: int = 126  # khớp artifact vec_len (63 = collect_hands normalize + dominant hand)

smoking_artifact: Dict[str, Any] | None = None
smoking_model = None
smoking_idx_to_label: Dict[int, str] = {}

phone_artifact: Dict[str, Any] | None = None
phone_model = None
phone_idx_to_label: Dict[int, str] = {}
phone_image_size: int | None = None

phone_yolo_model = None          # ultralytics YOLO (fallback, cần PyTorch)
phone_yolo_onnx  = None          # onnxruntime InferenceSession (ưu tiên, nhẹ ~40MB)


DATABASE_URL = os.getenv("DATABASE_URL", "")  # Render PostgreSQL internal URL
DB_BACKEND = os.getenv("DB_BACKEND", "mysql").strip().lower()
POSTGRES_ACTIVE = DB_BACKEND == "postgres" and bool(DATABASE_URL and POSTGRES_AVAILABLE)


def get_mysql_conn():
    """Kết nối database:
    - Render: set DB_BACKEND=postgres (+ DATABASE_URL) để dùng PostgreSQL
    - Local: mặc định DB_BACKEND=mysql để dùng MariaDB/MySQL
    """
    if POSTGRES_ACTIVE:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
        return conn
    if not MYSQL_AVAILABLE:
        raise RuntimeError(
            "DB_BACKEND=mysql nhưng thiếu PyMySQL. Cài PyMySQL hoặc đặt DB_BACKEND=postgres trên Render."
        )
    return pymysql.connect(**MYSQL_CONFIG)


def _ensure_identity_tables(cur) -> None:
    if POSTGRES_ACTIVE:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driver_identity (
                driver_id      VARCHAR(64) PRIMARY KEY,
                name           VARCHAR(255),
                embedding_json TEXT NOT NULL,
                image_base64   TEXT,
                created_at     TIMESTAMP NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driver_telegram_owner (
                driver_id         VARCHAR(64) PRIMARY KEY,
                telegram_chat_id  BIGINT NOT NULL,
                telegram_user_id  BIGINT NULL,
                created_at        TIMESTAMP NOT NULL,
                updated_at        TIMESTAMP NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS identity_decision_requests (
                request_id           BIGSERIAL PRIMARY KEY,
                driver_id            VARCHAR(64) NOT NULL,
                status               VARCHAR(16) NOT NULL,
                reason               VARCHAR(64) NULL,
                similarity           DOUBLE PRECISION NULL,
                threshold            DOUBLE PRECISION NULL,
                requested_at         TIMESTAMP NOT NULL,
                expires_at           TIMESTAMP NOT NULL,
                decided_at           TIMESTAMP NULL,
                decided_by_chat_id   BIGINT NULL,
                telegram_chat_id     BIGINT NULL,
                telegram_message_id  BIGINT NULL
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_identity_driver ON identity_decision_requests (driver_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_identity_status ON identity_decision_requests (status)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_identity_expires ON identity_decision_requests (expires_at)"
        )
    else:
        # MariaDB/MySQL schema
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driver_identity (
                driver_id      VARCHAR(64) PRIMARY KEY,
                name           VARCHAR(255),
                embedding_json TEXT NOT NULL,
                image_base64   TEXT,
                created_at     DATETIME NOT NULL
            ) ENGINE=InnoDB
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driver_telegram_owner (
                driver_id         VARCHAR(64) PRIMARY KEY,
                telegram_chat_id  BIGINT NOT NULL,
                telegram_user_id  BIGINT NULL,
                created_at        DATETIME NOT NULL,
                updated_at        DATETIME NOT NULL
            ) ENGINE=InnoDB
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS identity_decision_requests (
                request_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
                driver_id            VARCHAR(64) NOT NULL,
                status               VARCHAR(16) NOT NULL,
                reason               VARCHAR(64) NULL,
                similarity           DOUBLE NULL,
                threshold            DOUBLE NULL,
                requested_at         DATETIME NOT NULL,
                expires_at           DATETIME NOT NULL,
                decided_at           DATETIME NULL,
                decided_by_chat_id   BIGINT NULL,
                telegram_chat_id     BIGINT NULL,
                telegram_message_id  BIGINT NULL,
                INDEX idx_identity_driver (driver_id),
                INDEX idx_identity_status (status),
                INDEX idx_identity_expires (expires_at)
            ) ENGINE=InnoDB
            """
        )


def _ensure_driving_session_tables(cur) -> None:
    if POSTGRES_ACTIVE:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driving_sessions (
                id         BIGSERIAL PRIMARY KEY,
                driver_id  VARCHAR(64) NULL,
                label      VARCHAR(128) NULL,
                started_at TIMESTAMP NOT NULL,
                ended_at   TIMESTAMP NULL
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_driving_driver ON driving_sessions (driver_id)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_driving_started ON driving_sessions (started_at)"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driving_session_alerts (
                session_id BIGINT NOT NULL,
                alert_type VARCHAR(32) NOT NULL,
                count      INT NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, alert_type)
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_dsa_session ON driving_session_alerts (session_id)"
        )
    else:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driving_sessions (
                id         BIGINT AUTO_INCREMENT PRIMARY KEY,
                driver_id  VARCHAR(64) NULL,
                label      VARCHAR(128) NULL,
                started_at DATETIME NOT NULL,
                ended_at   DATETIME NULL,
                INDEX idx_driving_driver (driver_id),
                INDEX idx_driving_started (started_at)
            ) ENGINE=InnoDB
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS driving_session_alerts (
                session_id BIGINT NOT NULL,
                alert_type VARCHAR(32) NOT NULL,
                count      INT NOT NULL DEFAULT 0,
                PRIMARY KEY (session_id, alert_type),
                INDEX idx_dsa_session (session_id)
            ) ENGINE=InnoDB
            """
        )


DRIVING_ALERT_TYPES = frozenset(
    {"phone", "smoking", "drowsy", "identity_lock", "landmark_risk", "other"}
)


def _telegram_call(method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Missing TELEGRAM_BOT_TOKEN")
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    body = parse.urlencode(payload).encode("utf-8")
    req = urlrequest.Request(api_url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urlrequest.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        data = json.loads(raw)
        if not data.get("ok"):
            raise RuntimeError(f"Telegram API error: {data}")
        return data


def _telegram_send_decision_message(
    chat_id: int,
    driver_id: str,
    request_id: int,
    similarity: float | None,
    threshold: float | None,
    timeout_sec: int,
) -> int:
    sim_txt = f"{(similarity or 0) * 100:.2f}%" if similarity is not None else "--"
    thr_txt = f"{(threshold or 0) * 100:.2f}%" if threshold is not None else "--"
    text = (
        "CANH BAO XE KHONG CHINH CHU\n"
        f"Driver ID: {driver_id}\n"
        f"Similarity: {sim_txt}\n"
        f"Threshold: {thr_txt}\n"
        f"Thoi gian cho phep phan hoi: {timeout_sec}s\n\n"
        "Chon Accept de cho phep xe di chuyen, Reject de khoa may."
    )
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "Accept", "callback_data": f"idr:accept:{request_id}"},
                {"text": "Reject", "callback_data": f"idr:reject:{request_id}"},
            ]
        ]
    }
    data = _telegram_call(
        "sendMessage",
        {
            "chat_id": str(chat_id),
            "text": text,
            "reply_markup": json.dumps(keyboard, ensure_ascii=True),
        },
    )
    msg = data.get("result") or {}
    msg_id = msg.get("message_id")
    if not isinstance(msg_id, int):
        raise RuntimeError("Telegram response missing message_id")
    return msg_id


def _telegram_answer_callback(callback_query_id: str, text: str) -> None:
    _telegram_call(
        "answerCallbackQuery",
        {"callback_query_id": callback_query_id, "text": text, "show_alert": "false"},
    )


def _telegram_send_text(chat_id: int, text: str) -> None:
    _telegram_call("sendMessage", {"chat_id": str(chat_id), "text": text})


def _compat_joblib_load(path: Path) -> Any:
    """
    Load a joblib/pickle file.

    Note: trước đây mình có thử "patch" NumPy BitGenerator để tương thích pickle
    giữa các môi trường, nhưng việc patch sai có thể làm unpickle tạo lỗi mới
    (do hàm patch nằm trong scope local và không thể picklable).

    Chiến lược hiện tại: nếu joblib.load fail thì các hàm `load_model()` /
    `load_hand_model()` sẽ kích hoạt "train fallback" (train lại từ CSV trong repo)
    để tạo file pkl tương thích đúng với môi trường Render.
    """
    return joblib.load(path)


_model_train_lock = threading.Lock()
_trained_fallback_landmark = False
_trained_fallback_hand = False
_training_landmark_in_progress = False
_training_hand_in_progress = False


def load_model() -> None:
    global artifact, model, idx_to_label
    # default state (used when joblib.load fails and we start training fallback)
    artifact = None
    model = None
    idx_to_label = {}

    if not MODEL_PATH.exists():
        return

    try:
        artifact = _compat_joblib_load(MODEL_PATH)
    except Exception as exc:
        # If pickle is incompatible across environments, train from CSV.
        # IMPORTANT: train in background to avoid gunicorn worker timeout on Render.
        app.logger.warning("load_model failed (%s). Start landmark fallback training in background...", exc)

        def _train_landmark_bg() -> None:
            global _trained_fallback_landmark, _training_landmark_in_progress
            try:
                # Train fallback should be fast (skip CV/report) to fit worker limits.
                os.environ.setdefault("FAST_MODE", "1")
                os.environ.setdefault("SKIP_CV", "1")

                from driver_training.train.train_landmarks import train_landmark_model

                csv_path = BASE_DIR / "driver_training" / "collect" / "data" / "landmarks.csv"
                train_landmark_model(
                    csv_path=csv_path,
                    model_path=MODEL_PATH,
                    test_size=float(os.getenv("LANDMARK_TEST_SIZE", "0.2")),
                    random_state=int(os.getenv("LANDMARK_RANDOM_STATE", "42")),
                )
                with _model_train_lock:
                    _trained_fallback_landmark = True
            except Exception:
                app.logger.exception("landmark fallback training failed")
            finally:
                with _model_train_lock:
                    _training_landmark_in_progress = False

        with _model_train_lock:
            global _training_landmark_in_progress
            if not _trained_fallback_landmark and not _training_landmark_in_progress:
                _training_landmark_in_progress = True
                threading.Thread(target=_train_landmark_bg, daemon=True).start()
        return

    if artifact is None:
        return

    model = artifact.get("model")
    label_to_idx = artifact.get("label_to_idx", {})
    idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_hand_model() -> None:
    global hand_artifact, hand_model, hand_idx_to_label, hand_vec_len
    # default state (used when joblib.load fails and we start training fallback)
    hand_artifact = None
    hand_model = None
    hand_idx_to_label = {}
    hand_vec_len = 126

    if not HAND_MODEL_PATH.exists():
        return

    try:
        hand_artifact = _compat_joblib_load(HAND_MODEL_PATH)
    except Exception as exc:
        # If pickle is incompatible across environments, train from CSV.
        # IMPORTANT: train in background to avoid gunicorn worker timeout on Render.
        app.logger.warning("load_hand_model failed (%s). Start hand fallback training in background...", exc)

        def _train_hand_bg() -> None:
            global _trained_fallback_hand, _training_hand_in_progress
            try:
                os.environ.setdefault("FAST_MODE", "1")
                os.environ.setdefault("SKIP_CV", "1")

                from driver_training.train.train_hands import train_hand_model

                csv_path = BASE_DIR / "driver_training" / "collect" / "hand_dataset.csv"
                train_hand_model(
                    csv_path=csv_path,
                    model_path=HAND_MODEL_PATH,
                    test_size=float(os.getenv("HAND_TEST_SIZE", "0.15")),
                    random_state=int(os.getenv("HAND_RANDOM_STATE", "42")),
                )
                with _model_train_lock:
                    _trained_fallback_hand = True
            except Exception:
                app.logger.exception("hand fallback training failed")
            finally:
                with _model_train_lock:
                    _training_hand_in_progress = False

        with _model_train_lock:
            global _training_hand_in_progress
            if not _trained_fallback_hand and not _training_hand_in_progress:
                _training_hand_in_progress = True
                threading.Thread(target=_train_hand_bg, daemon=True).start()
        return

    if hand_artifact is None:
        return

    hand_model = hand_artifact.get("model")
    label_to_idx = hand_artifact.get("label_to_idx", {})
    hand_idx_to_label = {v: k for k, v in label_to_idx.items()}
    try:
        hand_vec_len = int(hand_artifact.get("vec_len", 126))
    except (TypeError, ValueError):
        hand_vec_len = 126


def load_smoking_model() -> None:
    global smoking_artifact, smoking_model, smoking_idx_to_label
    if not SMOKING_MODEL_PATH.exists():
        smoking_artifact = None
        smoking_model = None
        smoking_idx_to_label = {}
        return

    smoking_artifact = _compat_joblib_load(SMOKING_MODEL_PATH)
    smoking_model = smoking_artifact.get("model")
    label_to_idx = smoking_artifact.get("label_to_idx", {})
    smoking_idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_phone_model() -> None:
    global phone_artifact, phone_model, phone_idx_to_label, phone_image_size
    if not PHONE_MODEL_PATH.exists():
        phone_artifact = None
        phone_model = None
        phone_idx_to_label = {}
        phone_image_size = None
        return

    phone_artifact = _compat_joblib_load(PHONE_MODEL_PATH)
    phone_model = phone_artifact.get("model")
    label_to_idx = phone_artifact.get("label_to_idx", {})
    phone_idx_to_label = {v: k for k, v in label_to_idx.items()}
    img_sz = phone_artifact.get("image_size")
    try:
        phone_image_size = int(img_sz) if img_sz is not None else None
    except (TypeError, ValueError):
        phone_image_size = None


def load_phone_yolo_model() -> None:
    """Ưu tiên ONNX (onnxruntime). Fallback sang .pt nếu không có .onnx."""
    global phone_yolo_model, phone_yolo_onnx

    if DISABLE_PHONE_YOLO:
        phone_yolo_model = None
        phone_yolo_onnx = None
        app.logger.info("phone YOLO disabled (DISABLE_PHONE_YOLO / Render 512MB)")
        return

    # --- ONNX (onnxruntime, ~80MB RAM) ---
    if PHONE_YOLO_ONNX_PATH.exists():
        try:
            import onnxruntime as ort  # noqa: PLC0415
            sess_opts = ort.SessionOptions()
            sess_opts.inter_op_num_threads = 1
            sess_opts.intra_op_num_threads = 1
            phone_yolo_onnx = ort.InferenceSession(
                str(PHONE_YOLO_ONNX_PATH),
                sess_options=sess_opts,
                providers=["CPUExecutionProvider"],
            )
            phone_yolo_model = None
            app.logger.info("phone_yolo.onnx loaded OK (onnxruntime)")
            return
        except Exception as exc:
            app.logger.warning("phone_yolo.onnx load failed, trying .pt: %s", exc)
            phone_yolo_onnx = None

    # --- Fallback: ultralytics .pt (cần PyTorch ~200MB) ---
    if not PHONE_YOLO_MODEL_PATH.exists() or not YOLO_AVAILABLE:
        phone_yolo_model = None
        return
    try:
        import torch as _torch
        _orig = _torch.load
        def _patched(f, *a, **kw):
            kw.setdefault("weights_only", False)
            return _orig(f, *a, **kw)
        _torch.load = _patched
        phone_yolo_model = YOLO(str(PHONE_YOLO_MODEL_PATH))
        _torch.load = _orig
        app.logger.info("phone_yolo.pt loaded OK (ultralytics fallback)")
    except Exception as exc:
        app.logger.warning("phone_yolo.pt load failed: %s", exc)
        phone_yolo_model = None


# --- ONNX inference helpers ---

def _yolo_letterbox(img, new_size: int = 640):
    """Resize + pad về new_size x new_size (letterbox). Trả về (img_padded, scale, (pad_w, pad_h))."""
    h, w = img.shape[:2]
    scale = min(new_size / h, new_size / w)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    img_r = cv2.resize(img, (nw, nh))
    pad_w = (new_size - nw) / 2
    pad_h = (new_size - nh) / 2
    top, bottom = int(round(pad_h - 0.1)), int(round(pad_h + 0.1))
    left, right  = int(round(pad_w - 0.1)), int(round(pad_w + 0.1))
    img_p = cv2.copyMakeBorder(img_r, top, bottom, left, right,
                                cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return img_p, scale, (pad_w, pad_h)


def _yolo_onnx_detect(session, img_bgr, conf_thres: float = 0.4, iou_thres: float = 0.5):
    """
    Chạy inference với onnxruntime session. Output YOLOv8: (1, 5, 8400).
    Trả về list dict {"label","x","y","w","h","prob"} với tọa độ chuẩn hóa [0,1].
    """
    orig_h, orig_w = img_bgr.shape[:2]
    img_pad, scale, (pad_w, pad_h) = _yolo_letterbox(img_bgr, 640)

    # Preprocess: BGR → RGB, HWC → CHW, normalize
    inp = cv2.cvtColor(img_pad, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    inp = np.transpose(inp, (2, 0, 1))[np.newaxis]  # (1,3,640,640)

    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: inp})[0]  # (1, 5, 8400)
    preds = output[0].T  # (8400, 5): cx,cy,w,h,conf

    # Filter confidence
    mask = preds[:, 4] >= conf_thres
    preds = preds[mask]
    if len(preds) == 0:
        return []

    # cx,cy,w,h in 640-space → x1,y1,x2,y2
    cx, cy, w, h = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2
    confs = preds[:, 4]

    # NMS via cv2
    boxes_cv = np.stack([x1, y1, w, h], axis=1).tolist()
    scores_cv = confs.tolist()
    indices = cv2.dnn.NMSBoxes(boxes_cv, scores_cv, conf_thres, iou_thres)
    if len(indices) == 0:
        return []
    indices = [int(i) for i in (indices.flatten() if hasattr(indices, "flatten") else indices)]

    result = []
    for idx in indices:
        # Undo letterbox padding, scale về original image
        bx1 = (float(x1[idx]) - pad_w) / scale
        by1 = (float(y1[idx]) - pad_h) / scale
        bx2 = (float(x2[idx]) - pad_w) / scale
        by2 = (float(y2[idx]) - pad_h) / scale

        # Chuẩn hóa [0,1] theo kích thước gốc
        bx1 = max(0.0, bx1 / orig_w)
        by1 = max(0.0, by1 / orig_h)
        bx2 = min(1.0, bx2 / orig_w)
        by2 = min(1.0, by2 / orig_h)

        bw = bx2 - bx1
        bh = by2 - by1
        if bw <= 0 or bh <= 0:
            continue

        result.append({
            "label": "phone",
            "x": float(bx1 + bw / 2),   # tâm x
            "y": float(by1 + bh / 2),   # tâm y
            "w": float(bw),
            "h": float(bh),
            "prob": float(confs[idx]),
        })
    return result


# Lazy loading — chỉ load khi có request đầu tiên, tránh OOM lúc startup (Render 512MB)
_models_loaded = False
_face_mesh = None
_hands = None


def _ensure_face_mesh_loaded() -> None:
    """Chỉ OpenCV + MediaPipe FaceMesh — không unpickle sklearn (identity / vector mặt thô)."""
    global cv2, _face_mesh
    if _face_mesh is not None:
        return

    import cv2 as _cv2  # noqa: PLC0415

    cv2 = _cv2

    import mediapipe as mp  # noqa: PLC0415

    _face_mesh = mp.solutions.face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.55,
        # Match training collector (collect_landmarks.py): static_image_mode mặc định False
        # để landmark ổn định hơn cho chuỗi frame liên tiếp.
        static_image_mode=False,
    )


def _ensure_models_loaded() -> None:
    """Load sklearn .pkl + MediaPipe Hands; FaceMesh dùng chung qua _ensure_face_mesh_loaded().
    Nếu DISABLE_HAND_DETECT=1 thì bỏ qua MediaPipe Hands + hand_model (~80MB tiết kiệm RAM).
    """
    global _models_loaded, _hands, joblib

    _ensure_face_mesh_loaded()

    if _models_loaded:
        return

    import joblib as _joblib  # noqa: PLC0415

    joblib = _joblib

    load_model()  # landmark sklearn model (luôn cần)

    if not DISABLE_HAND_DETECT:
        load_hand_model()
        import mediapipe as mp  # noqa: PLC0415
        if _hands is None:
            _hands = mp.solutions.hands.Hands(
                static_image_mode=True,
                max_num_hands=2,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )

    if DISABLE_HAND_DETECT:
        _models_loaded = model is not None and bool(idx_to_label)
    else:
        _models_loaded = (
            model is not None
            and bool(idx_to_label)
            and hand_model is not None
            and bool(hand_idx_to_label)
        )


# YOLO load riêng — lazy, chỉ chạy khi endpoint phone/detect được gọi lần đầu
# Không gộp vào _ensure_models_loaded() để tránh tốn RAM (PyTorch ~150MB) khi không cần
_yolo_loaded = False

def _ensure_yolo_loaded() -> None:
    global _yolo_loaded
    if _yolo_loaded:
        return
    load_phone_yolo_model()
    _yolo_loaded = True


def _yolo_available() -> bool:
    if DISABLE_PHONE_YOLO:
        return False
    return phone_yolo_onnx is not None or phone_yolo_model is not None


NUM_LANDMARKS_PER_HAND = 21


def _get_dominant_hand_landmark(multi_hand_landmarks, multi_handedness):
    """Giống collect_hands.get_dominant_hand: tay có score handedness cao nhất."""
    if not multi_hand_landmarks:
        return None, 0.0
    best_lm = None
    best_conf = -1.0
    for i, hlm in enumerate(multi_hand_landmarks):
        conf = 0.0
        if multi_handedness and i < len(multi_handedness):
            conf = float(multi_handedness[i].classification[0].score)
        if conf > best_conf:
            best_conf = conf
            best_lm = hlm
    return best_lm, best_conf


def _normalize_single_hand_landmarks(hand_landmarks) -> List[float] | None:
    """Giống collect_hands.normalize_landmarks: trừ cổ tay, chia max(abs)."""
    if hand_landmarks is None:
        return None
    pts = np.array(
        [(lm.x, lm.y, lm.z) for lm in hand_landmarks.landmark],
        dtype=np.float32,
    )
    pts = pts - pts[0]
    scale = float(np.max(np.abs(pts)))
    if scale < 1e-6:
        return None
    pts /= scale
    return pts.flatten().tolist()


def _hands_to_vector(multi_hand_landmarks, multi_handedness) -> List[float]:
    """Chuyển 1 hoặc 2 bàn tay → vector 126 số (left 63 + right 63)."""
    left_vec = [0.0] * (NUM_LANDMARKS_PER_HAND * 3)
    right_vec = [0.0] * (NUM_LANDMARKS_PER_HAND * 3)

    if multi_hand_landmarks is None or len(multi_hand_landmarks) == 0:
        return left_vec + right_vec

    for i, hand_landmarks in enumerate(multi_hand_landmarks):
        handedness = "Left"
        if multi_handedness and i < len(multi_handedness):
            handedness = multi_handedness[i].classification[0].label

        coords = []
        for lm in hand_landmarks.landmark:
            coords.extend([lm.x, lm.y, lm.z])

        if handedness == "Left":
            left_vec = coords
        else:
            right_vec = coords

    return left_vec + right_vec


def _hands_to_feature_vector(multi_hand_landmarks, multi_handedness) -> List[float] | None:
    """
    Vector đưa vào hand_model:
    - vec_len 63 (train_hands + collect_hands): 1 tay dominant + normalize.
    - vec_len 126 (legacy): raw left 63 + right 63 như cũ.
    Trả về None khi model 63-dim mà không có tay / landmark suy biến.
    """
    if hand_vec_len == 63:
        if multi_hand_landmarks is None or len(multi_hand_landmarks) == 0:
            return None
        lm, _conf = _get_dominant_hand_landmark(
            multi_hand_landmarks, multi_handedness
        )
        if lm is None:
            return None
        return _normalize_single_hand_landmarks(lm)
    return _hands_to_vector(multi_hand_landmarks, multi_handedness)


def _image_base64_to_landmarks(image_b64: str) -> List[float] | None:
    """
    Decode base64 → MediaPipe Face Mesh → vector 1434 số.
    Trả về None nếu không detect được mặt (để API trả no_face thay vì lỗi).
    """
    _ensure_face_mesh_loaded()
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = _face_mesh.process(rgb)
    if results.multi_face_landmarks is None or len(results.multi_face_landmarks) == 0:
        return None
    lms = results.multi_face_landmarks[0]
    coords = []
    for lm in lms.landmark:
        coords.extend([lm.x, lm.y, lm.z])
    return coords


def _image_base64_to_landmarks_for_predict(image_b64: str, flip: bool = False) -> List[float] | None:
    """
    Landmark cho endpoint dự đoán (landmark model).
    flip=False: khớp Kaggle training data (ảnh thẳng, không mirror).
    flip=True: fallback cho webcam data được thu với cv2.flip(frame,1).
    """
    _ensure_face_mesh_loaded()
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")

    if LANDMARK_FLIP_INPUT or flip:
        img = cv2.flip(img, 1)

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = _face_mesh.process(rgb)
    if results.multi_face_landmarks is None or len(results.multi_face_landmarks) == 0:
        return None
    lms = results.multi_face_landmarks[0]
    coords = []
    for lm in lms.landmark:
        coords.extend([lm.x, lm.y, lm.z])
    return coords


def _image_base64_to_hand_landmarks(image_b64: str) -> List[float] | None:
    """Decode base64 → MediaPipe Hands → vector khớp hand_vec_len (63 hoặc 126)."""
    _ensure_models_loaded()
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = _hands.process(rgb)
    return _hands_to_feature_vector(
        results.multi_hand_landmarks, results.multi_handedness
    )



 
def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Tính cosine similarity giữa hai vector embedding."""
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def _normalize_face_embedding(vec: List[float]) -> List[float]:
    """
    Chuẩn hoá embedding landmark để giảm false-positive:
    - dịch tâm về gốc (x,y)
    - scale theo kích thước mặt trung bình
    - chuẩn hoá L2 toàn vector
    """
    if not vec:
        return []

    arr = np.asarray(vec, dtype=np.float32).reshape(-1, 3)
    center_xy = np.mean(arr[:, :2], axis=0)
    arr[:, 0] -= center_xy[0]
    arr[:, 1] -= center_xy[1]

    scale = float(np.mean(np.linalg.norm(arr[:, :2], axis=1)))
    if scale > 1e-6:
        arr[:, :2] /= scale

    flat = arr.reshape(-1)
    norm = float(np.linalg.norm(flat))
    if norm > 1e-6:
        flat /= norm

    return flat.tolist()


def _extract_images_from_payload(payload: Dict[str, Any]) -> List[str]:
    images: List[str] = []

    image_one = payload.get("image")
    if isinstance(image_one, str) and image_one.strip():
        images.append(image_one.strip())

    image_many = payload.get("images")
    if isinstance(image_many, list):
        for it in image_many:
            if isinstance(it, str) and it.strip():
                images.append(it.strip())

    # unique + strip data URL prefix
    out: List[str] = []
    seen = set()
    for img in images:
        cleaned = img.split(",", 1)[-1] if img.startswith("data:") else img
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


def _collect_face_embeddings(images: List[str]) -> List[List[float]]:
    embeddings: List[List[float]] = []
    for image_b64 in images:
        emb = _get_face_embedding_from_image(image_b64)
        if emb is not None:
            embeddings.append(emb)
    return embeddings


def _mean_embedding(embeddings: List[List[float]]) -> List[float]:
    if not embeddings:
        return []
    arr = np.asarray(embeddings, dtype=np.float32)
    return np.mean(arr, axis=0).tolist()


def _get_face_embedding_from_image(image_b64: str) -> List[float] | None:
    """
    Lấy embedding khuôn mặt dùng trực tiếp vector landmark (1434 số).
    Nếu sau này muốn thay bằng model embedding khác thì chỉ cần đổi hàm này.
    """
    vec = _image_base64_to_landmarks(image_b64)
    if vec is None:
        return None
    return _normalize_face_embedding(vec)



@app.get("/")
def index() -> Any:
    return jsonify({
        "status": "ok",
        "message": "DMS Backend is running",
        "endpoints": [
            "POST /api/hand/predict_from_frame",
            "POST /api/landmark/predict_from_frame",
            "POST /api/identity/register",
            "POST /api/identity/verify",
            "GET  /api/identity/driver_profile",
            "POST /api/identity/request_decision",
            "GET  /api/identity/decision_status",
        ]
    })


@app.get("/api/ping-db")
def ping_db() -> Any:
    """Test database connection — hỗ trợ cả MySQL và PostgreSQL."""
    debug = {
        "DB_BACKEND": os.getenv("DB_BACKEND", "(not set)"),
        "POSTGRES_ACTIVE": POSTGRES_ACTIVE,
        "POSTGRES_AVAILABLE": POSTGRES_AVAILABLE,
        "DATABASE_URL_set": bool(os.getenv("DATABASE_URL", "")),
    }
    try:
        conn = get_mysql_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        return jsonify({
            "status": "ok",
            "backend": "postgres" if POSTGRES_ACTIVE else "mysql",
            "host": "postgres (internal)" if POSTGRES_ACTIVE else os.getenv("MYSQL_HOST", "N/A"),
            "database": "diquamuasha" if POSTGRES_ACTIVE else os.getenv("MYSQL_DATABASE", "N/A"),
            "debug": debug,
        })
    except Exception as exc:
        return jsonify({
            "status": "error",
            "error": str(exc),
            "backend": "postgres" if POSTGRES_ACTIVE else "mysql",
            "debug": debug,
        }), 500


def _parse_landmarks(payload: Dict[str, Any]) -> List[float]:
    if "landmarks" not in payload:
        raise ValueError("Thiếu trường 'landmarks' trong JSON body.")

    landmarks = payload["landmarks"]
    if not isinstance(landmarks, list):
        raise ValueError("'landmarks' phải là một mảng số.")

    try:
        vec = [float(v) for v in landmarks]
    except (TypeError, ValueError):
        raise ValueError("'landmarks' chứa phần tử không phải số.")

    return vec


@app.post("/api/landmark/predict")
def predict_landmark() -> Any:
    _ensure_models_loaded()
    if model is None or not idx_to_label:
        return (
            jsonify(
                {
                    "error": "Model chưa được load. Hãy train model trước (train_landmarks.py).",
                    "model_path": str(MODEL_PATH),
                }
            ),
            500,
        )

    try:
        payload = request.get_json(force=True, silent=False)  # type: ignore[assignment]
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return (
            jsonify(
                {
                    "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                }
            ),
            400,
        )

    try:
        vec = _parse_landmarks(payload)  # list[float], length 1434
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

    try:
        pred_idx = int(model.predict(x)[0])  # type: ignore[arg-type]
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(x)[0]  # type: ignore[arg-type]
        else:
            proba = None
    except Exception as exc:
        return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500

    label = idx_to_label.get(pred_idx, str(pred_idx))

    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[idx_to_label.get(i, str(i))] = float(p)

    return jsonify(
        {
            "label": label,
            "prob": float(max(scores.values())) if scores else None,
            "scores": scores,
        }
    )


@app.post("/api/landmark/predict_from_frame")
def predict_from_frame() -> Any:
    """
    Nhận ảnh base64 (từ webcam), chạy MediaPipe Face Mesh để trích landmark,
    rồi dùng model đã train để dự đoán label.
    Body JSON: { "image": "data:image/jpeg;base64,..." hoặc "base64_string" }
    """
    try:
        try:
            _ensure_models_loaded()
        except Exception as exc:
            return (
                jsonify(
                    {
                        "error": f"Không load được model/MediaPipe: {exc}",
                        "model_path": str(MODEL_PATH),
                    }
                ),
                503,
            )

        if model is None or not idx_to_label:
            return (
                jsonify(
                    {
                        "error": "Model chưa được load. Hãy train model trước (train_landmarks.py).",
                        "model_path": str(MODEL_PATH),
                    }
                ),
                500,
            )

        try:
            payload = request.get_json(force=True, silent=False)
            if payload is None:
                raise ValueError("Body phải là JSON hợp lệ.")
        except Exception:
            return (
                jsonify(
                    {
                        "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                    }
                ),
                400,
            )

        image_b64 = payload.get("image")
        if not image_b64 or not isinstance(image_b64, str):
            return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

        if image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[-1]

        # Thử flip=False trước (khớp Kaggle training), fallback flip=True
        vec = None
        for flip_val in (False, True):
            try:
                vec = _image_base64_to_landmarks_for_predict(image_b64, flip=flip_val)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
            if vec is not None:
                break

        if vec is None:
            return jsonify(
                {
                    "label": "no_face",
                    "prob": None,
                    "scores": {},
                }
            )

        x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

        try:
            pred_idx = int(model.predict(x)[0])
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(x)[0]
            else:
                proba = None
        except Exception as exc:
            return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500

        label = idx_to_label.get(pred_idx, str(pred_idx))
        scores: Dict[str, float] = {}
        if proba is not None:
            for i, p in enumerate(proba):
                scores[idx_to_label.get(i, str(i))] = float(p)

        best_prob = float(max(scores.values())) if scores else None

        # Nếu model không đủ tự tin → safe (tránh false positive khi mặt bình thường)
        if scores and len(scores) >= 2:
            sorted_p = sorted(scores.values(), reverse=True)
            margin = sorted_p[0] - sorted_p[1]
            if best_prob is not None and (best_prob < LANDMARK_MIN_CONFIDENCE or margin < LANDMARK_AMBIGUOUS_MARGIN):
                label = "safe"

        return jsonify(
            {
                "label": label,
                "prob": best_prob,
                "scores": scores,
            }
        )
    except Exception as exc:
        import traceback

        app.logger.exception("predict_from_frame: %s", exc)
        return (
            jsonify(
                {
                    "error": str(exc),
                    "trace": traceback.format_exc()[-4000:],
                }
            ),
            500,
        )


# ═══════════════════════════════════════════════════════════════
# SMOKING API (hút thuốc)
# ═══════════════════════════════════════════════════════════════


@app.post("/api/smoking/predict_from_frame")
def smoking_predict_from_frame() -> Any:
    """
    Nhận ảnh base64 (từ webcam), chạy MediaPipe Face Mesh để trích landmark,
    rồi dùng smoking model để dự đoán label.

    Body JSON: { "image": "data:image/jpeg;base64,..." hoặc "base64_string" }
    """
    _ensure_models_loaded()
    if smoking_model is None or not smoking_idx_to_label:
        return (
            jsonify(
                {
                    "error": "Smoking model chưa được load. Hãy train model trước (train_smoking.py).",
                    "model_path": str(SMOKING_MODEL_PATH),
                }
            ),
            500,
        )

    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return (
            jsonify(
                {
                    "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                }
            ),
            400,
        )

    image_b64 = payload.get("image")
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    try:
        vec = _image_base64_to_landmarks(image_b64)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if vec is None:
        return jsonify(
            {
                "label": "no_face",
                "prob": None,
                "scores": {},
            }
        )

    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

    try:
        pred_idx = int(smoking_model.predict(x)[0])
        if hasattr(smoking_model, "predict_proba"):
            proba = smoking_model.predict_proba(x)[0]
        else:
            proba = None
    except Exception as exc:
        return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500

    label = smoking_idx_to_label.get(pred_idx, str(pred_idx))
    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[smoking_idx_to_label.get(i, str(i))] = float(p)

    best_prob = float(max(scores.values())) if scores else None

    # Hysteresis: chỉ coi là "smoking" nếu xác suất đủ cao,
    # ngược lại coi là "no_smoking" để giảm false positive.
    SMOKING_HARD_THRESHOLD = 0.90  # yêu cầu prob >= 90% mới trả về smoking
    if label == "smoking" and (best_prob is None or best_prob < SMOKING_HARD_THRESHOLD):
        label = "no_smoking"

    return jsonify(
        {
            "label": label,
            "prob": best_prob,
            "scores": scores,
            # FIX: thêm raw_label để frontend biết model predict gì trước khi filter
            "raw_label": smoking_idx_to_label.get(pred_idx, str(pred_idx)),
        }
    )


# ═══════════════════════════════════════════════════════════════
# PHONE API (phone / no_phone từ ảnh full-frame)
# ═══════════════════════════════════════════════════════════════


@app.post("/api/phone/predict_from_frame")
def phone_predict_from_frame() -> Any:
    """
    Nhận ảnh base64 (từ webcam), resize + grayscale giống train_phone.py,
    rồi dùng phone model (ảnh full-frame) để dự đoán:
        - "phone"    : có điện thoại
        - "no_phone" : không dùng điện thoại

    Body JSON: { "image": "data:image/jpeg;base64,..." hoặc "base64_string" }
    """
    _ensure_models_loaded()
    if phone_model is None or not phone_idx_to_label:
        return (
            jsonify(
                {
                    "error": "Phone model chưa được load. Hãy train model trước (train_phone.py).",
                    "model_path": str(PHONE_MODEL_PATH),
                }
            ),
            500,
        )

    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return (
            jsonify(
                {
                    "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                }
            ),
            400,
        )

    image_b64 = payload.get("image")
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    # Decode base64 → BGR image
    try:
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        img = None

    if img is None:
        return jsonify({"error": "Không decode được ảnh từ base64."}), 400

    # Preprocess giống train_phone.py
    size = phone_image_size or 160
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)
    vec = gray.astype("float32") / 255.0
    x = vec.flatten().reshape(1, -1)

    try:
        pred_idx = int(phone_model.predict(x)[0])
        if hasattr(phone_model, "predict_proba"):
            proba = phone_model.predict_proba(x)[0]
        else:
            proba = None
    except Exception as exc:
        return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500

    label = phone_idx_to_label.get(pred_idx, str(pred_idx))
    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[phone_idx_to_label.get(i, str(i))] = float(p)

    best_prob = float(max(scores.values())) if scores else None

    return jsonify(
        {
            "label": label,
            "prob": best_prob,
            "scores": scores,
        }
    )


@app.post("/api/phone/detect_from_frame")
def phone_detect_from_frame() -> Any:
    """
    Dùng YOLO (phone_yolo.pt) để detect vị trí điện thoại trong frame.

    Body JSON:
      { "image": "data:image/jpeg;base64,..." }

    Trả về:
      {
        "boxes": [
          { "label": "phone", "x": 0.3, "y": 0.4, "w": 0.2, "h": 0.3, "prob": 0.91 }
        ]
      }
    với x,y,w,h là toạ độ chuẩn hoá [0,1] theo width/height, (x,y) là tâm bbox.
    """
    if DISABLE_PHONE_YOLO:
        return jsonify(
            {
                "boxes": [],
                "disabled": True,
                "reason": "Phone detection tắt trên server (tiết kiệm RAM). Cài onnxruntime + DISABLE_PHONE_YOLO=0 để bật.",
            }
        )

    _ensure_models_loaded()
    _ensure_yolo_loaded()
    if not _yolo_available():
        return (
            jsonify(
                {
                    "error": "YOLO phone model chưa được load. Cài onnxruntime và có phone_yolo.onnx, hoặc ultralytics + phone_yolo.pt.",
                    "model_path": str(PHONE_YOLO_ONNX_PATH),
                }
            ),
            500,
        )

    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return (
            jsonify(
                {
                    "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                }
            ),
            400,
        )

    image_b64 = payload.get("image")
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    try:
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        img = None

    if img is None:
        return jsonify({"error": "Không decode được ảnh từ base64."}), 400

    # Run YOLO — ưu tiên ONNX
    try:
        if phone_yolo_onnx is not None:
            return jsonify({"boxes": _yolo_onnx_detect(phone_yolo_onnx, img, conf_thres=0.4)})

        results = phone_yolo_model(img, conf=0.4, iou=0.5, verbose=False)[0]  # type: ignore[attr-defined]
    except Exception as exc:
        return jsonify({"error": f"Lỗi YOLO detect: {exc}"}), 500

    boxes_out: List[Dict[str, Any]] = []

    if results.boxes is not None and len(results.boxes) > 0:  # type: ignore[truthy-function]
        xywhn = results.boxes.xywhn.cpu().numpy()  # type: ignore[attr-defined]
        confs = results.boxes.conf.cpu().numpy()  # type: ignore[attr-defined]
        clss = results.boxes.cls.cpu().numpy().astype(int)  # type: ignore[attr-defined]
        names = results.names  # type: ignore[attr-defined]

        for (cx, cy, w, h), c, cls_idx in zip(xywhn, confs, clss):
            label = (
                str(names.get(int(cls_idx), int(cls_idx)))
                if isinstance(names, dict)
                else str(int(cls_idx))
            )
            boxes_out.append(
                {
                    "label": label,
                    "x": float(cx),
                    "y": float(cy),
                    "w": float(w),
                    "h": float(h),
                    "prob": float(c),
                }
            )

    return jsonify({"boxes": boxes_out})


# ═══════════════════════════════════════════════════════════════
# HAND SIGN API (ký hiệu tay - tài xế khiếm thính)
# ═══════════════════════════════════════════════════════════════


def _parse_hand_landmarks(payload: Dict[str, Any]) -> List[float]:
    if "landmarks" not in payload:
        raise ValueError("Thiếu trường 'landmarks' trong JSON body.")

    landmarks = payload["landmarks"]
    if not isinstance(landmarks, list):
        raise ValueError("'landmarks' phải là một mảng số.")

    try:
        vec = [float(v) for v in landmarks]
    except (TypeError, ValueError):
        raise ValueError("'landmarks' chứa phần tử không phải số.")

    return vec


@app.post("/api/hand/predict")
def predict_hand() -> Any:
    """
    Nhận vector landmark tay (63 sau normalize như collect_hands, hoặc 126 legacy)
    → dự đoán ký hiệu tay.
    Body JSON: { "landmarks": [...] } độ dài khớp vec_len của model đã train.
    """
    _ensure_models_loaded()
    if hand_model is None or not hand_idx_to_label:
        return (
            jsonify(
                {
                    "error": "Hand model chưa được load. Hãy train model trước (train_hands.py).",
                    "model_path": str(HAND_MODEL_PATH),
                }
            ),
            500,
        )

    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return (
            jsonify(
                {
                    "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                }
            ),
            400,
        )

    try:
        vec = _parse_hand_landmarks(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if len(vec) != hand_vec_len:
        return (
            jsonify(
                {
                    "error": (
                        f"Độ dài landmarks {len(vec)} không khớp model "
                        f"(cần {hand_vec_len})."
                    ),
                }
            ),
            400,
        )

    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

    try:
        pred_idx = int(hand_model.predict(x)[0])
        if hasattr(hand_model, "predict_proba"):
            proba = hand_model.predict_proba(x)[0]
        else:
            proba = None
    except Exception as exc:
        return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500

    label = hand_idx_to_label.get(pred_idx, str(pred_idx))

    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[hand_idx_to_label.get(i, str(i))] = float(p)

    return jsonify(
        {
            "label": label,
            "prob": float(max(scores.values())) if scores else None,
            "scores": scores,
        }
    )


def _json_hand_no_hand_in_frame() -> Any:
    """Khi không detect tay (model 63-dim): coi như no_sign để frontend đóng menu."""
    ordered = sorted(hand_idx_to_label.keys())
    all_lbls = [hand_idx_to_label[i] for i in ordered]
    if not all_lbls:
        return jsonify({"label": "no_sign", "prob": 1.0, "scores": {}})
    if "no_sign" in all_lbls:
        scores = {l: (1.0 if l == "no_sign" else 0.0) for l in all_lbls}
        return jsonify({"label": "no_sign", "prob": 1.0, "scores": scores})
    scores = {l: 1.0 / len(all_lbls) for l in all_lbls}
    return jsonify(
        {
            "label": all_lbls[0],
            "prob": 0.05,
            "scores": scores,
        }
    )


@app.post("/api/hand/predict_from_frame")
def hand_predict_from_frame() -> Any:
    """
    Nhận ảnh base64 (từ webcam), chạy MediaPipe Hands để trích landmark,
    rồi dùng hand model đã train để dự đoán ký hiệu tay.
    Body JSON: { "image": "data:image/jpeg;base64,..." hoặc "base64_string" }
    """
    try:
        try:
            _ensure_models_loaded()
        except Exception as exc:
            return (
                jsonify(
                    {
                        "error": f"Không load được model/MediaPipe: {exc}",
                        "model_path": str(HAND_MODEL_PATH),
                    }
                ),
                503,
            )

        if hand_model is None or not hand_idx_to_label:
            return (
                jsonify(
                    {
                        "error": "Hand model chưa được load. Hãy train model trước (train_hands.py).",
                        "model_path": str(HAND_MODEL_PATH),
                    }
                ),
                500,
            )

        try:
            payload = request.get_json(force=True, silent=False)
            if payload is None:
                raise ValueError("Body phải là JSON hợp lệ.")
        except Exception:
            return (
                jsonify(
                    {
                        "error": "Không đọc được JSON body. Hãy gửi Content-Type: application/json.",
                    }
                ),
                400,
            )

        image_b64 = payload.get("image")
        if not image_b64 or not isinstance(image_b64, str):
            return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

        if image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[-1]

        try:
            vec = _image_base64_to_hand_landmarks(image_b64)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        if vec is None:
            return _json_hand_no_hand_in_frame()

        x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

        try:
            pred_idx = int(hand_model.predict(x)[0])
            if hasattr(hand_model, "predict_proba"):
                proba = hand_model.predict_proba(x)[0]
            else:
                proba = None
        except Exception as exc:
            return jsonify({"error": f"Lỗi khi dự đoán: {exc}"}), 500

        label = hand_idx_to_label.get(pred_idx, str(pred_idx))
        scores: Dict[str, float] = {}
        if proba is not None:
            for i, p in enumerate(proba):
                scores[hand_idx_to_label.get(i, str(i))] = float(p)

        return jsonify(
            {
                "label": label,
                "prob": float(max(scores.values())) if scores else None,
                "scores": scores,
            }
        )
    except Exception as exc:
        import traceback

        app.logger.exception("hand_predict_from_frame: %s", exc)
        return (
            jsonify(
                {
                    "error": str(exc),
                    "trace": traceback.format_exc()[-4000:],
                }
            ),
            500,
        )


# ═══════════════════════════════════════════════════════════════
# IDENTITY API (xác thực tài xế chính chủ bằng khuôn mặt)
# ═══════════════════════════════════════════════════════════════


@app.post("/api/identity/register")
def identity_register() -> Any:
    """
    Đăng ký khuôn mặt chính chủ cho một driver_id.

    Body JSON:
    {
        "driver_id": "driver_001",
        "name": "Nguyen Van A",   # optional
        "image": "data:image/jpeg;base64,...." hoặc chỉ chuỗi base64
    }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    name = str(payload.get("name") or "").strip()
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400

    images = _extract_images_from_payload(payload)
    if not images:
        return jsonify({"error": "Thiếu 'image' hoặc 'images' trong JSON body."}), 400

    try:
        embeddings = _collect_face_embeddings(images)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if len(embeddings) < IDENTITY_MIN_REGISTER_SAMPLES:
        return (
            jsonify(
                {
                    "error": (
                        "Không đủ frame khuôn mặt hợp lệ để đăng ký. "
                        f"Cần >= {IDENTITY_MIN_REGISTER_SAMPLES}, hiện có {len(embeddings)}."
                    )
                }
            ),
            400,
        )

    embedding = _mean_embedding(embeddings)
    image_b64 = images[0]

    embedding_json = json.dumps(embedding)
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                INSERT INTO driver_identity (driver_id, name, embedding_json, image_base64, created_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (driver_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    embedding_json = EXCLUDED.embedding_json,
                    image_base64 = EXCLUDED.image_base64,
                    created_at = EXCLUDED.created_at
                """,
                (driver_id, name, embedding_json, image_b64, created_at),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "status": "ok",
            "driver_id": driver_id,
            "name": name,
            "created_at": created_at,
            "samples_used": len(embeddings),
        }
    )


@app.post("/api/identity/verify")
def identity_verify() -> Any:
    """
    So khớp tài xế hiện tại với chính chủ đã đăng ký.

    Body JSON:
    {
        "driver_id": "driver_001",
        "image": "data:image/jpeg;base64,...."
    }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400

    images = _extract_images_from_payload(payload)
    if not images:
        return jsonify({"error": "Thiếu 'image' hoặc 'images' trong JSON body."}), 400

    try:
        current_embeddings = _collect_face_embeddings(images)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if len(current_embeddings) < IDENTITY_MIN_VERIFY_SAMPLES:
        return (
            jsonify(
                {
                    "error": (
                        "Không detect được khuôn mặt ổn định để xác thực. "
                        f"Cần >= {IDENTITY_MIN_VERIFY_SAMPLES} frame hợp lệ."
                    )
                }
            ),
            400,
        )

    embedding_now = _mean_embedding(current_embeddings)

    # Lấy embedding đã đăng ký
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT embedding_json, name, image_base64, created_at
                FROM driver_identity WHERE driver_id = %s
                """,
                (driver_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        return jsonify(
            {
                "driver_id": driver_id,
                "has_registered": False,
                "is_owner": False,
                "similarity": None,
                "threshold": None,
                "error": "Chưa có khuôn mặt chính chủ cho driver_id này.",
            }
        )

    try:
        stored_embedding = json.loads(row["embedding_json"])
    except Exception:
        return (
            jsonify({"error": "Không đọc được embedding đã lưu trong database."}),
            500,
        )

    similarity = _cosine_similarity(stored_embedding, embedding_now)
    threshold = IDENTITY_SIM_THRESHOLD

    created_raw = row.get("created_at")
    if hasattr(created_raw, "strftime"):
        registered_at = created_raw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        registered_at = str(created_raw) if created_raw is not None else ""

    reg_name = str(row.get("name") or "").strip()

    return jsonify(
        {
            "driver_id": driver_id,
            "has_registered": True,
            "is_owner": bool(similarity >= threshold),
            "similarity": float(similarity),
            "threshold": float(threshold),
            "samples_used": len(current_embeddings),
            "registered_name": reg_name,
            "profile_image_base64": row.get("image_base64"),
            "registered_at": registered_at,
        }
    )


@app.get("/api/identity/driver_profile")
def identity_driver_profile() -> Any:
    """Trả về tên + ảnh đăng ký + ngày tạo (dùng cho UI sau khi mở khóa / Telegram accept)."""
    driver_id = str(request.args.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu driver_id."}), 400

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT driver_id, name, image_base64, created_at
                FROM driver_identity WHERE driver_id = %s
                """,
                (driver_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        return jsonify({"error": "Không tìm thấy driver_id trong hệ thống."}), 404

    created_raw = row.get("created_at")
    if hasattr(created_raw, "strftime"):
        registered_at = created_raw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        registered_at = str(created_raw) if created_raw is not None else ""

    reg_name = str(row.get("name") or "").strip()
    did = str(row.get("driver_id") or driver_id)

    return jsonify(
        {
            "driver_id": did,
            "registered_name": reg_name or did,
            "profile_image_base64": row.get("image_base64"),
            "registered_at": registered_at,
        }
    )


@app.post("/api/identity/telegram/bind")
def bind_driver_telegram_owner() -> Any:
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    chat_id_raw = payload.get("telegram_chat_id")
    user_id_raw = payload.get("telegram_user_id")
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400
    if chat_id_raw is None:
        return jsonify({"error": "Thiếu 'telegram_chat_id'."}), 400

    try:
        chat_id = int(chat_id_raw)
    except Exception:
        return jsonify({"error": "'telegram_chat_id' phải là số."}), 400

    user_id = None
    if user_id_raw is not None:
        try:
            user_id = int(user_id_raw)
        except Exception:
            user_id = None

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                INSERT INTO driver_telegram_owner
                    (driver_id, telegram_chat_id, telegram_user_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (driver_id) DO UPDATE SET
                    telegram_chat_id = EXCLUDED.telegram_chat_id,
                    telegram_user_id = EXCLUDED.telegram_user_id,
                    updated_at = EXCLUDED.updated_at
                """,
                (driver_id, chat_id, user_id, now, now),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "status": "ok",
            "driver_id": driver_id,
            "telegram_chat_id": chat_id,
            "telegram_user_id": user_id,
        }
    )


@app.post("/api/identity/request_decision")
def request_identity_decision() -> Any:
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400

    phase = str(payload.get("phase") or "").strip().lower()
    if phase != "auth":
        return jsonify(
            {
                "error": (
                    "Gửi yêu cầu Telegram chỉ được khi xác nhận xe. "
                    "Truyền phase=auth từ bước CAR AUTH (không dùng khi đang lái)."
                )
            }
        ), 400

    similarity = payload.get("similarity")
    threshold = payload.get("threshold")
    reason = str(payload.get("reason", "intruder")).strip() or "intruder"
    timeout_sec = int(payload.get("timeout_sec") or IDENTITY_DECISION_TIMEOUT_SEC)
    timeout_sec = max(10, min(timeout_sec, 300))

    similarity_val = None
    threshold_val = None
    try:
        if similarity is not None:
            similarity_val = float(similarity)
    except Exception:
        similarity_val = None
    try:
        if threshold is not None:
            threshold_val = float(threshold)
    except Exception:
        threshold_val = None

    now_dt = datetime.utcnow()
    now = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    expires_dt = now_dt + timedelta(seconds=timeout_sec)
    expires = expires_dt.strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT request_id, expires_at
                FROM identity_decision_requests
                WHERE driver_id = %s AND status = 'pending'
                ORDER BY request_id DESC
                LIMIT 1
                """,
                (driver_id,),
            )
            pending_row = cur.fetchone()

            if pending_row:
                req_id = int(pending_row["request_id"])
                exp = pending_row["expires_at"]
                exp_dt = exp if isinstance(exp, datetime) else datetime.strptime(exp, "%Y-%m-%d %H:%M:%S")
                if exp_dt > now_dt:
                    remaining = int((exp_dt - now_dt).total_seconds())
                    return jsonify(
                        {
                            "status": "pending",
                            "request_id": req_id,
                            "driver_id": driver_id,
                            "remaining_sec": remaining,
                        }
                    )
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s
                    WHERE request_id = %s
                    """,
                    (now, req_id),
                )

            cur.execute(
                """
                SELECT telegram_chat_id
                FROM driver_telegram_owner
                WHERE driver_id = %s
                LIMIT 1
                """,
                (driver_id,),
            )
            owner_row = cur.fetchone()
            if not owner_row:
                return jsonify({"error": "Chưa bind Telegram chat_id cho driver_id này."}), 400

            chat_id = int(owner_row["telegram_chat_id"])
            cur.execute(
                """
                INSERT INTO identity_decision_requests
                    (driver_id, status, reason, similarity, threshold, requested_at, expires_at, telegram_chat_id)
                VALUES (%s, 'pending', %s, %s, %s, %s, %s, %s)
                RETURNING request_id
                """,
                (driver_id, reason, similarity_val, threshold_val, now, expires, chat_id),
            )
            request_id = int(cur.fetchone()[0])

            try:
                msg_id = _telegram_send_decision_message(
                    chat_id=chat_id,
                    driver_id=driver_id,
                    request_id=request_id,
                    similarity=similarity_val,
                    threshold=threshold_val,
                    timeout_sec=timeout_sec,
                )
            except Exception as exc:
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s, reason = %s
                    WHERE request_id = %s
                    """,
                    (now, f"telegram_error:{exc}", request_id),
                )
                conn.commit()
                return jsonify({"error": f"Không gửi được Telegram: {exc}"}), 500

            cur.execute(
                """
                UPDATE identity_decision_requests
                SET telegram_message_id = %s
                WHERE request_id = %s
                """,
                (msg_id, request_id),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "status": "pending",
            "request_id": request_id,
            "driver_id": driver_id,
            "remaining_sec": timeout_sec,
        }
    )


@app.get("/api/identity/decision_status")
def identity_decision_status() -> Any:
    request_id_raw = request.args.get("request_id", "").strip()
    if not request_id_raw:
        return jsonify({"error": "Thiếu query 'request_id'."}), 400
    try:
        request_id = int(request_id_raw)
    except Exception:
        return jsonify({"error": "'request_id' phải là số."}), 400

    now_dt = datetime.utcnow()
    now = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT request_id, driver_id, status, reason, requested_at, expires_at, decided_at
                FROM identity_decision_requests
                WHERE request_id = %s
                LIMIT 1
                """,
                (request_id,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "request_id không tồn tại."}), 404

            status = str(row["status"])
            expires_at = row["expires_at"]
            exp_dt = (
                expires_at
                if isinstance(expires_at, datetime)
                else datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
            )
            if status == "pending" and exp_dt <= now_dt:
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s
                    WHERE request_id = %s
                    """,
                    (now, request_id),
                )
                conn.commit()
                status = "expired"

            remaining_sec = max(0, int((exp_dt - now_dt).total_seconds()))
            return jsonify(
                {
                    "request_id": int(row["request_id"]),
                    "driver_id": row["driver_id"],
                    "status": status,
                    "reason": row.get("reason"),
                    "remaining_sec": remaining_sec,
                }
            )
    finally:
        conn.close()


@app.post("/api/telegram/webhook")
def telegram_webhook() -> Any:
    if TELEGRAM_WEBHOOK_SECRET:
        got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if got != TELEGRAM_WEBHOOK_SECRET:
            return jsonify({"ok": False, "error": "Invalid secret"}), 403

    payload = request.get_json(silent=True) or {}

    callback = payload.get("callback_query")
    if isinstance(callback, dict):
        callback_id = str(callback.get("id") or "")
        data = str(callback.get("data") or "")
        message = callback.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = int(chat.get("id") or 0)

        parts = data.split(":")
        if len(parts) == 3 and parts[0] == "idr" and parts[1] in ("accept", "reject"):
            action = parts[1]
            try:
                req_id = int(parts[2])
            except Exception:
                _telegram_answer_callback(callback_id, "Yeu cau khong hop le.")
                return jsonify({"ok": True})

            now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            now_dt = datetime.utcnow()
            conn = get_mysql_conn()
            try:
                with conn.cursor() as cur:
                    _ensure_identity_tables(cur)
                    cur.execute(
                        """
                        SELECT request_id, status, expires_at, telegram_chat_id
                        FROM identity_decision_requests
                        WHERE request_id = %s
                        LIMIT 1
                        """,
                        (req_id,),
                    )
                    row = cur.fetchone()
                    if not row:
                        _telegram_answer_callback(callback_id, "Yeu cau khong ton tai.")
                        return jsonify({"ok": True})

                    if int(row.get("telegram_chat_id") or 0) != chat_id:
                        _telegram_answer_callback(callback_id, "Ban khong co quyen xu ly yeu cau nay.")
                        return jsonify({"ok": True})

                    status = str(row.get("status") or "")
                    exp = row.get("expires_at")
                    exp_dt = exp if isinstance(exp, datetime) else datetime.strptime(exp, "%Y-%m-%d %H:%M:%S")
                    if status != "pending" or exp_dt <= now_dt:
                        if exp_dt <= now_dt and status == "pending":
                            cur.execute(
                                """
                                UPDATE identity_decision_requests
                                SET status = 'expired', decided_at = %s
                                WHERE request_id = %s
                                """,
                                (now, req_id),
                            )
                            conn.commit()
                        _telegram_answer_callback(callback_id, "Yeu cau da het han hoac da xu ly.")
                        return jsonify({"ok": True})

                    new_status = "accepted" if action == "accept" else "rejected"
                    cur.execute(
                        """
                        UPDATE identity_decision_requests
                        SET status = %s, decided_at = %s, decided_by_chat_id = %s
                        WHERE request_id = %s
                        """,
                        (new_status, now, chat_id, req_id),
                    )
                conn.commit()
            finally:
                conn.close()

            _telegram_answer_callback(callback_id, "Da ghi nhan lua chon.")
            return jsonify({"ok": True})

    message = payload.get("message")
    if isinstance(message, dict):
        chat = message.get("chat") or {}
        from_user = message.get("from") or {}
        text = str(message.get("text") or "").strip()
        chat_id = int(chat.get("id") or 0)
        user_id = int(from_user.get("id") or 0)

        if text.startswith("/bind"):
            parts = text.split()
            if len(parts) < 2:
                _telegram_send_text(chat_id, "Cach dung: /bind <driver_id>")
                return jsonify({"ok": True})
            driver_id = parts[1].strip()
            if not driver_id:
                _telegram_send_text(chat_id, "driver_id khong hop le.")
                return jsonify({"ok": True})

            now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            conn = get_mysql_conn()
            try:
                with conn.cursor() as cur:
                    _ensure_identity_tables(cur)
                    cur.execute(
                        """
                        INSERT INTO driver_telegram_owner
                            (driver_id, telegram_chat_id, telegram_user_id, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (driver_id) DO UPDATE SET
                            telegram_chat_id = EXCLUDED.telegram_chat_id,
                            telegram_user_id = EXCLUDED.telegram_user_id,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (driver_id, chat_id, user_id, now, now),
                    )
                conn.commit()
            finally:
                conn.close()

            _telegram_send_text(chat_id, f"Da bind thanh cong cho driver_id: {driver_id}")
            return jsonify({"ok": True})

        if text.startswith("/start"):
            _telegram_send_text(chat_id, "Xin chao. Dung lenh: /bind <driver_id> de lien ket xe.")
            return jsonify({"ok": True})

    return jsonify({"ok": True})


@app.post("/api/driving/session/start")
def driving_session_start() -> Any:
    """Bắt đầu phiên lái (sau khi tài xế đã active)."""
    payload = request.get_json(silent=True) or {}
    driver_id = (payload.get("driver_id") or "").strip() or None
    label = (payload.get("label") or "").strip() or None
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                """
                INSERT INTO driving_sessions (driver_id, label, started_at, ended_at)
                VALUES (%s, %s, %s, NULL)
                RETURNING id
                """,
                (driver_id, label, now),
            )
            sid = cur.fetchone()[0]
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify({"session_id": int(sid), "started_at": now, "driver_id": driver_id})


@app.post("/api/driving/session/end")
def driving_session_end() -> Any:
    """Kết thúc phiên lái (ghi ended_at)."""
    payload = request.get_json(silent=True) or {}
    try:
        session_id = int(payload.get("session_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Thiếu hoặc sai 'session_id'."}), 400

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    n = 0
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                """
                UPDATE driving_sessions
                SET ended_at = %s
                WHERE id = %s AND ended_at IS NULL
                """,
                (now, session_id),
            )
            n = cur.rowcount
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    if not n:
        return jsonify({"error": "session_id không tồn tại hoặc đã kết thúc."}), 404
    return jsonify({"ok": True, "session_id": session_id, "ended_at": now})


@app.post("/api/driving/session/alert")
def driving_session_alert() -> Any:
    """Tăng số lần cảnh báo theo loại (delta mặc định 1)."""
    payload = request.get_json(silent=True) or {}
    try:
        session_id = int(payload.get("session_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Thiếu hoặc sai 'session_id'."}), 400

    alert_type = (payload.get("alert_type") or "").strip().lower()
    if alert_type not in DRIVING_ALERT_TYPES:
        return (
            jsonify(
                {
                    "error": f"alert_type không hợp lệ. Cho phép: {sorted(DRIVING_ALERT_TYPES)}",
                }
            ),
            400,
        )

    try:
        delta = int(payload.get("delta", 1))
    except (TypeError, ValueError):
        return jsonify({"error": "'delta' phải là số nguyên."}), 400
    if delta < 1 or delta > 1000:
        return jsonify({"error": "'delta' phải trong [1, 1000]."}), 400

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                "SELECT id FROM driving_sessions WHERE id = %s LIMIT 1",
                (session_id,),
            )
            if not cur.fetchone():
                return jsonify({"error": "session_id không tồn tại."}), 404
            cur.execute(
                """
                INSERT INTO driving_session_alerts (session_id, alert_type, count)
                VALUES (%s, %s, %s)
                ON CONFLICT (session_id, alert_type) DO UPDATE SET count = driving_session_alerts.count + EXCLUDED.count
                """,
                (session_id, alert_type, delta),
            )
            cur.execute(
                """
                SELECT count FROM driving_session_alerts
                WHERE session_id = %s AND alert_type = %s
                """,
                (session_id, alert_type),
            )
            row = cur.fetchone()
            total = int(row["count"]) if row else delta
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify(
        {"ok": True, "session_id": session_id, "alert_type": alert_type, "count": total}
    )


@app.get("/api/driving/sessions")
def driving_sessions_list() -> Any:
    """Danh sách phiên gần đây (kèm tổng cảnh báo)."""
    try:
        limit = min(100, max(1, int(request.args.get("limit", "30"))))
    except ValueError:
        limit = 30
    driver_id = (request.args.get("driver_id") or "").strip() or None

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            if driver_id:
                cur.execute(
                    """
                    SELECT id, driver_id, label, started_at, ended_at
                    FROM driving_sessions
                    WHERE driver_id = %s
                    ORDER BY started_at DESC
                    LIMIT %s
                    """,
                    (driver_id, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT id, driver_id, label, started_at, ended_at
                    FROM driving_sessions
                    ORDER BY started_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            sessions = cur.fetchall() or []
            out: List[Dict[str, Any]] = []
            for s in sessions:
                sid = int(s["id"])
                cur.execute(
                    """
                    SELECT alert_type, count FROM driving_session_alerts
                    WHERE session_id = %s
                    """,
                    (sid,),
                )
                alerts = {str(r["alert_type"]): int(r["count"]) for r in (cur.fetchall() or [])}
                out.append(
                    {
                        "session_id": sid,
                        "driver_id": s.get("driver_id"),
                        "label": s.get("label"),
                        "started_at": _session_dt_iso(s.get("started_at")),
                        "ended_at": _session_dt_iso(s.get("ended_at")),
                        "alerts": alerts,
                    }
                )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify({"sessions": out})


def _session_dt_iso(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return str(v)


@app.get("/api/driving/session/<int:session_id>")
def driving_session_detail(session_id: int) -> Any:
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                """
                SELECT id, driver_id, label, started_at, ended_at
                FROM driving_sessions WHERE id = %s LIMIT 1
                """,
                (session_id,),
            )
            s = cur.fetchone()
            if not s:
                return jsonify({"error": "Không tìm thấy phiên."}), 404
            cur.execute(
                """
                SELECT alert_type, count FROM driving_session_alerts
                WHERE session_id = %s
                """,
                (session_id,),
            )
            alerts = {str(r["alert_type"]): int(r["count"]) for r in (cur.fetchall() or [])}
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify(
        {
            "session_id": int(s["id"]),
            "driver_id": s.get("driver_id"),
            "label": s.get("label"),
            "started_at": _session_dt_iso(s.get("started_at")),
            "ended_at": _session_dt_iso(s.get("ended_at")),
            "alerts": alerts,
        }
    )


try:
    import eventlet  # noqa: F401

    _async_mode = "eventlet"
except Exception:
    # Local run / environment may not have eventlet or EngineIO may not accept it.
    _async_mode = "threading"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode=_async_mode)


# phone pro
@socketio.on("phone_frame")
def handle_phone_frame(data):
    """
    Client gửi: { "image": "data:image/jpeg;base64,..." }
    Server trả: { "boxes": [...] } hoặc { "error": "..." }
    """
    if DISABLE_PHONE_YOLO:
        emit("phone_result", {"boxes": [], "disabled": True})
        return

    _ensure_yolo_loaded()
    if not _yolo_available():
        emit("phone_result", {"boxes": [], "error": "YOLO model not loaded"})
        return

    image_b64 = data.get("image", "")
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    try:
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            emit("phone_result", {"boxes": []})
            return

        # Ưu tiên ONNX (nhẹ, không cần PyTorch)
        if phone_yolo_onnx is not None:
            emit("phone_result", {"boxes": _yolo_onnx_detect(phone_yolo_onnx, img, conf_thres=0.4)})
            return

        results = phone_yolo_model(img, conf=0.55, iou=0.5, verbose=False)[0]
        boxes_out = []
        if results.boxes is not None and len(results.boxes) > 0:
            xywhn = results.boxes.xywhn.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            clss = results.boxes.cls.cpu().numpy().astype(int)
            names = results.names
            for (cx, cy, w, h), c, cls_idx in zip(xywhn, confs, clss):
                label = (
                    str(names.get(int(cls_idx), int(cls_idx)))
                    if isinstance(names, dict)
                    else str(int(cls_idx))
                )
                boxes_out.append({
                    "label": label,
                    "x": float(cx), "y": float(cy),
                    "w": float(w),  "h": float(h),
                    "prob": float(c),
                })
        emit("phone_result", {"boxes": boxes_out})
    except Exception as exc:
        emit("phone_result", {"boxes": [], "error": str(exc)})
        return

    # Important: phone_frame should ONLY run phone inference.
    return
    
    
    
    
    


@socketio.on("smoking_frame")
def handle_smoking_frame(data):
    """
    Client gửi: { "image": "data:image/jpeg;base64,..." }
    Server trả: { "label": "...", "prob": <float> } cho frontend smoking WS.
    """
    # Tạm tắt smoking để tập trung debug/tinh chỉnh phone detection.
    emit("smoking_result", {"label": "no_smoking", "prob": 0, "raw_label": "no_smoking"})
    return
        
    if smoking_model is None or not smoking_idx_to_label:
        emit(
            "smoking_result", {"label": "no_model", "prob": 0, "raw_label": "no_model"}
        )
        return
 
    image_b64 = data.get("image", "")
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]
 
    if not image_b64:
        emit("smoking_result", {"label": "no_face", "prob": 0, "raw_label": "no_face"})
        return
 
    try:
        vec = _image_base64_to_landmarks(image_b64)
    except Exception as exc:
        emit("smoking_result", {"label": "error", "prob": 0, "raw_label": str(exc)})
        return

    if vec is None:
        emit("smoking_result", {"label": "no_face", "prob": 0, "raw_label": "no_face"})
        return

    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

    try:
        pred_idx = int(smoking_model.predict(x)[0])
        raw_label = smoking_idx_to_label.get(pred_idx, str(pred_idx))

        if hasattr(smoking_model, "predict_proba"):
            proba = smoking_model.predict_proba(x)[0]
        else:
            proba = None
    except Exception as exc:
        emit("smoking_result", {"label": "error", "prob": 0, "raw_label": str(exc)})
        return

    scores: Dict[str, float] = {}
    if proba is not None:
        for i, p in enumerate(proba):
            scores[smoking_idx_to_label.get(i, str(i))] = float(p)

    best_prob = float(max(scores.values())) if scores else None

    # Hysteresis/threshold giống REST để giảm false-positive.
    SMOKING_HARD_THRESHOLD = 0.90
    label = raw_label
    if label == "smoking" and (best_prob is None or best_prob < SMOKING_HARD_THRESHOLD):
        label = "no_smoking"

    emit(
        "smoking_result",
        {
            "label": label,
            "prob": best_prob or 0,
            "raw_label": raw_label,
        },
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("DEBUG", "0").lower() in ("1", "true", "yes")
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=True,
    )
