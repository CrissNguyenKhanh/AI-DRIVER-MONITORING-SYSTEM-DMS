from __future__ import annotations
from flask_socketio import SocketIO, emit
import base64
import hmac
import os
from functools import wraps
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
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

try:
    from ultralytics import YOLO  # type: ignore

    YOLO_AVAILABLE = True
except Exception:  # ImportError, RuntimeError, ...
    YOLO_AVAILABLE = False


app = Flask(__name__)
from data.security import cors_origins
from data.db_sql import upsert_row, insert_id
from data.auth import (
    Principal,
    ensure_auth_tables,
    extract_bearer_token,
    generate_secret,
    hash_secret,
    parse_database_datetime,
)

CORS_ORIGINS = cors_origins()
CORS(app, origins=CORS_ORIGINS, supports_credentials=True)

# Tránh lỗi server khi client gửi base64 ảnh quá lớn
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25MB



def _api_error(status=500):
    app.logger.exception("Request failed: %s", request.path)
    return jsonify({"error": "Service unavailable" if status == 503 else "Internal server error"}), status


@app.errorhandler(Exception)
def unexpected_error(error):
    if isinstance(error, HTTPException):
        return jsonify({"error": error.name}), error.code
    return _api_error()


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
    "cursorclass": pymysql.cursors.DictCursor if MYSQL_AVAILABLE else None,
    "connect_timeout": 5,
    "read_timeout": 10,
    "write_timeout": 10,
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
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
AUTH_SESSION_TTL_HOURS = int(os.getenv("DMS_AUTH_SESSION_TTL_HOURS", "168"))
ADMIN_SESSION_TTL_HOURS = int(os.getenv("DMS_ADMIN_SESSION_TTL_HOURS", "12"))
ENROLLMENT_CODE_TTL_MINUTES = int(os.getenv("DMS_ENROLLMENT_CODE_TTL_MINUTES", "15"))
TELEGRAM_BIND_CODE_TTL_MINUTES = int(os.getenv("DMS_TELEGRAM_BIND_CODE_TTL_MINUTES", "10"))


artifact: Dict[str, Any] | None = None
model = None
idx_to_label: Dict[int, str] = {}

hand_artifact: Dict[str, Any] | None = None
hand_model = None
hand_idx_to_label: Dict[int, str] = {}
hand_vec_len: int = 126  # khớp artifact vec_len (63 = collect_hands normalize + dominant hand)

phone_artifact: Dict[str, Any] | None = None
phone_model = None
phone_idx_to_label: Dict[int, str] = {}
phone_image_size: int | None = None

phone_yolo_model = None          # ultralytics YOLO (fallback, cần PyTorch)
phone_yolo_onnx  = None          # onnxruntime InferenceSession (ưu tiên, nhẹ ~40MB)


DATABASE_URL = os.getenv("DATABASE_URL", "")  # Render PostgreSQL internal URL
DB_BACKEND = os.getenv("DB_BACKEND", "mysql").strip().lower()
if DB_BACKEND not in ("mysql", "postgres"):
    raise ValueError("DB_BACKEND must be mysql or postgres")
POSTGRES_ACTIVE = DB_BACKEND == "postgres"


def get_mysql_conn():
    """Kết nối database:
    - Render: set DB_BACKEND=postgres (+ DATABASE_URL) để dùng PostgreSQL
    - Local: mặc định DB_BACKEND=mysql để dùng MariaDB/MySQL
    """
    if POSTGRES_ACTIVE:
        if not DATABASE_URL or not POSTGRES_AVAILABLE:
            raise RuntimeError("PostgreSQL requires DATABASE_URL and psycopg2")
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor,
                                connect_timeout=5, options="-c statement_timeout=10000")
        return conn
    if not MYSQL_AVAILABLE:
        raise RuntimeError(
            "DB_BACKEND=mysql nhưng thiếu PyMySQL. Cài PyMySQL hoặc đặt DB_BACKEND=postgres trên Render."
        )
    return pymysql.connect(**MYSQL_CONFIG)


def _utc_string(value: datetime | None = None) -> str:
    return (value or datetime.utcnow()).strftime("%Y-%m-%d %H:%M:%S")


def _insert_session(cur, principal: Principal, ttl_hours: int) -> tuple[str, str]:
    token = generate_secret()
    now_dt = datetime.utcnow()
    expires_dt = now_dt + timedelta(hours=max(1, ttl_hours))
    cur.execute(
        """
        INSERT INTO dms_auth_sessions
            (token_hash, driver_id, role, created_at, expires_at, revoked_at)
        VALUES (%s, %s, %s, %s, %s, NULL)
        """,
        (
            hash_secret(token),
            principal.driver_id,
            principal.role,
            _utc_string(now_dt),
            _utc_string(expires_dt),
        ),
    )
    return token, _utc_string(expires_dt)


def _insert_one_time_code(cur, driver_id: str, purpose: str, ttl_minutes: int) -> tuple[str, str]:
    code = generate_secret()
    now_dt = datetime.utcnow()
    expires_dt = now_dt + timedelta(minutes=max(1, ttl_minutes))
    cur.execute(
        """
        UPDATE dms_one_time_codes
        SET used_at = %s
        WHERE driver_id = %s AND purpose = %s AND used_at IS NULL
        """,
        (_utc_string(now_dt), driver_id, purpose),
    )
    cur.execute(
        """
        INSERT INTO dms_one_time_codes
            (code_hash, driver_id, purpose, created_at, expires_at, used_at)
        VALUES (%s, %s, %s, %s, %s, NULL)
        """,
        (
            hash_secret(code),
            driver_id,
            purpose,
            _utc_string(now_dt),
            _utc_string(expires_dt),
        ),
    )
    return code, _utc_string(expires_dt)


def _authenticate_request() -> Principal | None:
    token = extract_bearer_token(request.headers.get("Authorization"))
    if token is None:
        return None

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
            cur.execute(
                """
                SELECT driver_id, role, expires_at, revoked_at
                FROM dms_auth_sessions
                WHERE token_hash = %s
                LIMIT 1
                """,
                (hash_secret(token),),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row or row.get("revoked_at") is not None:
        return None
    try:
        if parse_database_datetime(row["expires_at"]) <= datetime.utcnow():
            return None
    except (KeyError, TypeError, ValueError):
        return None

    role = str(row.get("role") or "")
    driver_id = str(row.get("driver_id") or "").strip() or None
    if role not in ("admin", "driver") or (role == "driver" and not driver_id):
        return None
    return Principal(role=role, driver_id=driver_id)


def require_auth(*, admin: bool = False):
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            principal = _authenticate_request()
            if principal is None:
                return jsonify({"error": "Authentication required"}), 401
            if admin and not principal.is_admin:
                return jsonify({"error": "Admin access required"}), 403
            g.auth_principal = principal
            return view(*args, **kwargs)

        return wrapped

    return decorate


def _authorize_driver(driver_id: str) -> Any | None:
    principal: Principal = g.auth_principal
    if principal.is_admin or principal.driver_id == driver_id:
        return None
    return jsonify({"error": "Access denied"}), 403


def _authorize_session_row(cur, session_id: int) -> tuple[Dict[str, Any] | None, Any | None]:
    cur.execute(
        "SELECT id, driver_id FROM driving_sessions WHERE id = %s LIMIT 1",
        (session_id,),
    )
    row = cur.fetchone()
    if not row:
        return None, (jsonify({"error": "session_id khong ton tai."}), 404)
    denied = _authorize_driver(str(row.get("driver_id") or ""))
    return row, denied


@app.post("/api/auth/admin/session")
def create_admin_session() -> Any:
    configured_secret = os.getenv("DMS_ADMIN_BOOTSTRAP_SECRET", "").strip()
    if not configured_secret:
        return jsonify({"error": "Admin authentication unavailable"}), 503
    payload = request.get_json(silent=True) or {}
    supplied_secret = str(payload.get("bootstrap_secret") or "")
    if not supplied_secret or not hmac.compare_digest(supplied_secret, configured_secret):
        return jsonify({"error": "Invalid credentials"}), 401

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
            token, expires_at = _insert_session(
                cur, Principal(role="admin"), ADMIN_SESSION_TTL_HOURS
            )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"access_token": token, "token_type": "Bearer", "expires_at": expires_at})


@app.post("/api/admin/enrollment-code")
@require_auth(admin=True)
def create_enrollment_code() -> Any:
    payload = request.get_json(silent=True) or {}
    driver_id = str(payload.get("driver_id") or "").strip()
    if not driver_id:
        return jsonify({"error": "Missing driver_id"}), 400

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
            code, expires_at = _insert_one_time_code(
                cur, driver_id, "driver_enrollment", ENROLLMENT_CODE_TTL_MINUTES
            )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"driver_id": driver_id, "enrollment_code": code, "expires_at": expires_at})


@app.post("/api/auth/enroll")
def enroll_driver_session() -> Any:
    payload = request.get_json(silent=True) or {}
    driver_id = str(payload.get("driver_id") or "").strip()
    code = str(payload.get("enrollment_code") or "").strip()
    if not driver_id or not code:
        return jsonify({"error": "driver_id and enrollment_code are required"}), 400

    now_dt = datetime.utcnow()
    now = _utc_string(now_dt)
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
            cur.execute(
                """
                SELECT driver_id, purpose, expires_at, used_at
                FROM dms_one_time_codes
                WHERE code_hash = %s
                LIMIT 1
                """,
                (hash_secret(code),),
            )
            row = cur.fetchone()
            try:
                valid = bool(
                    row
                    and row.get("used_at") is None
                    and str(row.get("purpose")) == "driver_enrollment"
                    and str(row.get("driver_id")) == driver_id
                    and parse_database_datetime(row.get("expires_at")) > now_dt
                )
            except (TypeError, ValueError):
                valid = False
            if not valid:
                return jsonify({"error": "Invalid or expired enrollment code"}), 401
            cur.execute(
                """
                UPDATE dms_one_time_codes
                SET used_at = %s
                WHERE code_hash = %s AND used_at IS NULL AND expires_at > %s
                """,
                (now, hash_secret(code), now),
            )
            if cur.rowcount != 1:
                return jsonify({"error": "Invalid or expired enrollment code"}), 401
            token, expires_at = _insert_session(
                cur, Principal(role="driver", driver_id=driver_id), AUTH_SESSION_TTL_HOURS
            )
        conn.commit()
    finally:
        conn.close()
    return jsonify(
        {
            "access_token": token,
            "token_type": "Bearer",
            "expires_at": expires_at,
            "driver_id": driver_id,
        }
    )


@app.get("/api/auth/me")
@require_auth()
def auth_me() -> Any:
    principal: Principal = g.auth_principal
    return jsonify({"role": principal.role, "driver_id": principal.driver_id})


@app.post("/api/auth/logout")
@require_auth()
def auth_logout() -> Any:
    token = extract_bearer_token(request.headers.get("Authorization"))
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
            cur.execute(
                "UPDATE dms_auth_sessions SET revoked_at = %s WHERE token_hash = %s",
                (_utc_string(), hash_secret(token or "")),
            )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True})


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
                embedding_json LONGTEXT NOT NULL,
                image_base64   LONGTEXT,
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

    # Persist lazy schema creation also on read-only/early-return requests.
    cur.connection.commit()


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

    cur.connection.commit()


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
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not data.get("ok"):
                raise RuntimeError("Telegram rejected the request")
            return data
    except Exception as error:
        # URL includes the token: never propagate an HTTP exception's URL/body.
        app.logger.error(
            "Telegram request failed method=%s type=%s status=%s",
            method,
            type(error).__name__,
            getattr(error, "code", None),
        )
        raise RuntimeError("Telegram request failed") from None


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
    """Load a trusted local artifact without training or rewriting it."""
    return joblib.load(path)


def load_model() -> None:
    global artifact, model, idx_to_label
    artifact = None
    model = None
    idx_to_label = {}

    if not MODEL_PATH.exists():
        return

    try:
        artifact = _compat_joblib_load(MODEL_PATH)
    except Exception:
        app.logger.exception("Landmark model artifact is incompatible or invalid")
        return

    if artifact is None:
        return

    model = artifact.get("model")
    label_to_idx = artifact.get("label_to_idx", {})
    idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_hand_model() -> None:
    global hand_artifact, hand_model, hand_idx_to_label, hand_vec_len
    hand_artifact = None
    hand_model = None
    hand_idx_to_label = {}
    hand_vec_len = 126

    if not HAND_MODEL_PATH.exists():
        return

    try:
        hand_artifact = _compat_joblib_load(HAND_MODEL_PATH)
    except Exception:
        app.logger.exception("Hand model artifact is incompatible or invalid")
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
_models_load_attempted = False
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
    global _models_loaded, _models_load_attempted, _hands, joblib

    _ensure_face_mesh_loaded()

    if _models_load_attempted:
        return

    import joblib as _joblib  # noqa: PLC0415

    joblib = _joblib

    load_model()  # landmark sklearn model (luôn cần)

    if not DISABLE_HAND_DETECT:
        load_hand_model()
        if hand_model is not None and hand_idx_to_label and _hands is None:
            import mediapipe as mp  # noqa: PLC0415
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
    _models_load_attempted = True


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
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    register_url = f"{frontend_url}/test5" if frontend_url else "/test5"
    html = f"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DMS Backend</title>
  <style>
    :root {{
      color-scheme: dark;
    }}
    * {{
      box-sizing: border-box;
      font-family: Inter, Segoe UI, Roboto, Arial, sans-serif;
    }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 20% 20%, #1f2a44, #0b1220 55%);
      color: #e5e7eb;
      padding: 24px;
    }}
    .card {{
      width: min(560px, 96vw);
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: rgba(15, 23, 42, 0.75);
      border-radius: 18px;
      padding: 28px;
      backdrop-filter: blur(6px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    }}
    h1 {{
      margin: 0 0 12px;
      font-size: 28px;
    }}
    p {{
      margin: 8px 0;
      color: #cbd5e1;
      line-height: 1.55;
    }}
    .actions {{
      margin-top: 22px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }}
    .btn {{
      border: 0;
      border-radius: 12px;
      padding: 11px 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }}
    .btn-primary {{
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: #fff;
    }}
    .btn-secondary {{
      background: #1f2937;
      color: #e5e7eb;
      border: 1px solid #374151;
    }}
    code {{
      color: #93c5fd;
      background: rgba(30, 41, 59, 0.7);
      padding: 2px 6px;
      border-radius: 6px;
    }}
  </style>
</head>
<body>
  <main class="card">
    <h1>AI Driver Monitoring System</h1>
    <p>Backend đang hoạt động bình thường.</p>
    <p>Bạn có thể vào trang đăng ký khuôn mặt để bắt đầu nhận diện tài xế.</p>
    <div class="actions">
      <a class="btn btn-primary" href="{register_url}">Dang ky khuon mat</a>
      <a class="btn btn-secondary" href="/api/ping-db">Kiem tra ket noi DB</a>
    </div>
    <p style="margin-top: 16px;">Duong dan dang ky: <code>{register_url}</code></p>
  </main>
</body>
</html>"""
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


def _database_available():
    conn = None
    try:
        conn = get_mysql_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        app.logger.exception("Database health probe failed")
        return False
    finally:
        if conn is not None:
            conn.close()


@app.get("/api/ping-db")
def ping_db() -> Any:
    available = _database_available()
    return jsonify({"status": "ok" if available else "unavailable", "backend": DB_BACKEND}), 200 if available else 503


@app.get("/health")
def health() -> Any:
    available = _database_available()
    models = {}
    for name, path, loaded, enabled in [
        ("landmark", MODEL_PATH, model is not None, True),
        ("hand", HAND_MODEL_PATH, hand_model is not None, not DISABLE_HAND_DETECT),
        ("smoking", SMOKING_MODEL_PATH, False, False),
        ("phone", PHONE_YOLO_ONNX_PATH if PHONE_YOLO_ONNX_PATH.exists() else PHONE_YOLO_MODEL_PATH,
         _yolo_available(), not DISABLE_PHONE_YOLO),
    ]:
        models[name] = {"artifact_present": path.is_file(), "loaded": loaded, "enabled": enabled}
    models["smoking"]["reason"] = _smoking_unavailable()["reason"]
    return jsonify({"status": "ok" if available else "degraded",
                    "database": {"available": available, "backend": DB_BACKEND},
                    "models": models}), 200 if available else 503


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
        return jsonify({"error": "Invalid request data"}), 400

    x = np.asarray(vec, dtype=np.float32).reshape(1, -1)

    try:
        pred_idx = int(model.predict(x)[0])  # type: ignore[arg-type]
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(x)[0]  # type: ignore[arg-type]
        else:
            proba = None
    except Exception as exc:
        return _api_error()

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
        except Exception:
            return _api_error(503)

        if model is None or not idx_to_label:
            return (
                jsonify(
                    {
                        "error": "Model chưa được load. Hãy train model trước (train_landmarks.py).",
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
                return jsonify({"error": "Invalid request data"}), 400
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
            return _api_error()

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
    except Exception:
        return _api_error()


# ═══════════════════════════════════════════════════════════════
# SMOKING API (hút thuốc)
# ═══════════════════════════════════════════════════════════════


def _smoking_unavailable():
    # Artifact is absent in this checkout. Presence alone must not enable an
    # unvalidated pipeline or fabricate a negative safety classification.
    return {"label": "unavailable", "prob": None, "available": False,
            "reason": "model_missing" if not SMOKING_MODEL_PATH.is_file() else "validation_required",
            "error": "Smoking detection unavailable"}


@app.post("/api/smoking/predict_from_frame")
def smoking_predict_from_frame() -> Any:
    return jsonify(_smoking_unavailable()), 503


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
        return _api_error()

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
        return _api_error()

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
        return jsonify({"error": "Hand inference unavailable"}), 503

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
        return jsonify({"error": "Invalid request data"}), 400

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
        return _api_error()

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
        except Exception:
            return _api_error(503)

        if hand_model is None or not hand_idx_to_label:
            return jsonify({"error": "Hand inference unavailable"}), 503

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
            return jsonify({"error": "Invalid request data"}), 400

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
            return _api_error()

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
    except Exception:
        return _api_error()


# ═══════════════════════════════════════════════════════════════
# IDENTITY API (xác thực tài xế chính chủ bằng khuôn mặt)
# ═══════════════════════════════════════════════════════════════


@app.post("/api/identity/register")
@require_auth()
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
    denied = _authorize_driver(driver_id)
    if denied:
        return denied

    images = _extract_images_from_payload(payload)
    if not images:
        return jsonify({"error": "Thiếu 'image' hoặc 'images' trong JSON body."}), 400

    try:
        embeddings = _collect_face_embeddings(images)
    except ValueError as exc:
        return jsonify({"error": "Invalid request data"}), 400

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
            upsert_row(
                cur, "driver_identity",
                ("driver_id", "name", "embedding_json", "image_base64", "created_at"),
                (driver_id, name, embedding_json, image_b64, created_at),
                ("driver_id",), ("name", "embedding_json", "image_base64", "created_at"),
                postgres=POSTGRES_ACTIVE,
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
@require_auth()
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
    denied = _authorize_driver(driver_id)
    if denied:
        return denied

    images = _extract_images_from_payload(payload)
    if not images:
        return jsonify({"error": "Thiếu 'image' hoặc 'images' trong JSON body."}), 400

    try:
        current_embeddings = _collect_face_embeddings(images)
    except ValueError as exc:
        return jsonify({"error": "Invalid request data"}), 400

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
@require_auth()
def identity_driver_profile() -> Any:
    """Trả về tên + ảnh đăng ký + ngày tạo (dùng cho UI sau khi mở khóa / Telegram accept)."""
    driver_id = str(request.args.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu driver_id."}), 400
    denied = _authorize_driver(driver_id)
    if denied:
        return denied

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
@require_auth(admin=True)
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
            upsert_row(
                cur, "driver_telegram_owner",
                ("driver_id", "telegram_chat_id", "telegram_user_id", "created_at", "updated_at"),
                (driver_id, chat_id, user_id, now, now),
                ("driver_id",), ("telegram_chat_id", "telegram_user_id", "updated_at"),
                postgres=POSTGRES_ACTIVE,
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


@app.post("/api/identity/telegram/bind-code")
@require_auth()
def create_telegram_bind_code() -> Any:
    payload = request.get_json(silent=True) or {}
    principal: Principal = g.auth_principal
    driver_id = (
        str(payload.get("driver_id") or "").strip()
        if principal.is_admin
        else str(principal.driver_id or "")
    )
    if not driver_id:
        return jsonify({"error": "Missing driver_id"}), 400
    denied = _authorize_driver(driver_id)
    if denied:
        return denied

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
            code, expires_at = _insert_one_time_code(
                cur, driver_id, "telegram_bind", TELEGRAM_BIND_CODE_TTL_MINUTES
            )
        conn.commit()
    finally:
        conn.close()
    return jsonify(
        {
            "driver_id": driver_id,
            "binding_code": code,
            "expires_at": expires_at,
            "command": f"/bind {code}",
        }
    )


@app.post("/api/identity/request_decision")
@require_auth()
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
    denied = _authorize_driver(driver_id)
    if denied:
        return denied

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
            request_id = insert_id(
                cur,
                "INSERT INTO identity_decision_requests "
                "(driver_id, status, reason, similarity, threshold, requested_at, expires_at, telegram_chat_id) "
                "VALUES (%s, 'pending', %s, %s, %s, %s, %s, %s)",
                (driver_id, reason, similarity_val, threshold_val, now, expires, chat_id),
                "request_id", postgres=POSTGRES_ACTIVE,
            )

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
                    (now, "telegram_error", request_id),
                )
                conn.commit()
                return _api_error()

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
@require_auth()
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

            denied = _authorize_driver(str(row.get("driver_id") or ""))
            if denied:
                return denied

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
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_WEBHOOK_SECRET:
        return jsonify({"ok": False, "error": "Telegram unavailable"}), 503
    if TELEGRAM_WEBHOOK_SECRET:
        got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not got or not hmac.compare_digest(got, TELEGRAM_WEBHOOK_SECRET):
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

        command = text.split(maxsplit=1)[0].split("@", 1)[0] if text else ""
        if command == "/bind":
            parts = text.split()
            if len(parts) < 2:
                _telegram_send_text(chat_id, "Cach dung: /bind <binding_code>")
                return jsonify({"ok": True})
            binding_code = parts[1].strip()
            if not binding_code:
                _telegram_send_text(chat_id, "Ma lien ket khong hop le.")
                return jsonify({"ok": True})

            now_dt = datetime.utcnow()
            now = _utc_string(now_dt)
            conn = get_mysql_conn()
            try:
                with conn.cursor() as cur:
                    _ensure_identity_tables(cur)
                    ensure_auth_tables(cur, postgres=POSTGRES_ACTIVE)
                    code_hash = hash_secret(binding_code)
                    cur.execute(
                        """
                        SELECT driver_id, purpose, expires_at, used_at
                        FROM dms_one_time_codes
                        WHERE code_hash = %s
                        LIMIT 1
                        """,
                        (code_hash,),
                    )
                    code_row = cur.fetchone()
                    try:
                        code_valid = bool(
                            code_row
                            and code_row.get("used_at") is None
                            and str(code_row.get("purpose")) == "telegram_bind"
                            and parse_database_datetime(code_row.get("expires_at")) > now_dt
                        )
                    except (TypeError, ValueError):
                        code_valid = False
                    if not code_valid:
                        _telegram_send_text(chat_id, "Ma lien ket khong hop le hoac da het han.")
                        return jsonify({"ok": True})
                    driver_id = str(code_row.get("driver_id") or "")
                    cur.execute(
                        """
                        UPDATE dms_one_time_codes
                        SET used_at = %s
                        WHERE code_hash = %s AND used_at IS NULL AND expires_at > %s
                        """,
                        (now, code_hash, now),
                    )
                    if cur.rowcount != 1:
                        _telegram_send_text(chat_id, "Ma lien ket da duoc su dung.")
                        return jsonify({"ok": True})
                    upsert_row(
                        cur, "driver_telegram_owner",
                        ("driver_id", "telegram_chat_id", "telegram_user_id", "created_at", "updated_at"),
                        (driver_id, chat_id, user_id, now, now),
                        ("driver_id",), ("telegram_chat_id", "telegram_user_id", "updated_at"),
                        postgres=POSTGRES_ACTIVE,
                    )
                conn.commit()
            finally:
                conn.close()

            _telegram_send_text(chat_id, f"Da bind thanh cong cho driver_id: {driver_id}")
            return jsonify({"ok": True})

        if text.startswith("/start"):
            _telegram_send_text(chat_id, "Xin chao. Tao ma tren ung dung, sau do dung: /bind <binding_code>.")
            return jsonify({"ok": True})

    return jsonify({"ok": True})


@app.post("/api/driving/session/start")
@require_auth()
def driving_session_start() -> Any:
    """Bắt đầu phiên lái (sau khi tài xế đã active)."""
    payload = request.get_json(silent=True) or {}
    requested_driver_id = str(payload.get("driver_id") or "").strip() or None
    principal: Principal = g.auth_principal
    if not principal.is_admin and requested_driver_id not in (None, principal.driver_id):
        return jsonify({"error": "Access denied"}), 403
    driver_id = requested_driver_id if principal.is_admin else principal.driver_id
    if not driver_id:
        return jsonify({"error": "Missing driver_id"}), 400
    label = (payload.get("label") or "").strip() or None
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            sid = insert_id(
                cur,
                "INSERT INTO driving_sessions (driver_id, label, started_at, ended_at) VALUES (%s, %s, %s, NULL)",
                (driver_id, label, now), "id", postgres=POSTGRES_ACTIVE,
            )
        conn.commit()
    except Exception as exc:
        return _api_error()
    finally:
        conn.close()

    return jsonify({"session_id": int(sid), "started_at": now, "driver_id": driver_id})


@app.post("/api/driving/session/end")
@require_auth()
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
            _session, denied = _authorize_session_row(cur, session_id)
            if denied:
                return denied
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
        return _api_error()
    finally:
        conn.close()

    if not n:
        return jsonify({"error": "session_id không tồn tại hoặc đã kết thúc."}), 404
    return jsonify({"ok": True, "session_id": session_id, "ended_at": now})


@app.post("/api/driving/session/alert")
@require_auth()
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
            _session, denied = _authorize_session_row(cur, session_id)
            if denied:
                return denied
            upsert_row(
                cur, "driving_session_alerts", ("session_id", "alert_type", "count"),
                (session_id, alert_type, delta), ("session_id", "alert_type"), ("count",),
                postgres=POSTGRES_ACTIVE, increments=("count",),
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
        return _api_error()
    finally:
        conn.close()

    return jsonify(
        {"ok": True, "session_id": session_id, "alert_type": alert_type, "count": total}
    )


@app.get("/api/driving/sessions")
@require_auth()
def driving_sessions_list() -> Any:
    """Danh sách phiên gần đây (kèm tổng cảnh báo)."""
    try:
        limit = min(100, max(1, int(request.args.get("limit", "30"))))
    except ValueError:
        limit = 30
    requested_driver_id = (request.args.get("driver_id") or "").strip() or None
    principal: Principal = g.auth_principal
    if not principal.is_admin and requested_driver_id not in (None, principal.driver_id):
        return jsonify({"error": "Access denied"}), 403
    driver_id = requested_driver_id if principal.is_admin else principal.driver_id

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
        return _api_error()
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
@require_auth()
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
            denied = _authorize_driver(str(s.get("driver_id") or ""))
            if denied:
                return denied
            cur.execute(
                """
                SELECT alert_type, count FROM driving_session_alerts
                WHERE session_id = %s
                """,
                (session_id,),
            )
            alerts = {str(r["alert_type"]): int(r["count"]) for r in (cur.fetchall() or [])}
    except Exception as exc:
        return _api_error()
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

socketio = SocketIO(app, cors_allowed_origins=CORS_ORIGINS, async_mode=_async_mode)


@socketio.on_error_default
def socket_error(_error):
    app.logger.exception("Socket request failed")
    event = getattr(request, "event", {}).get("message")
    if event == "phone_frame":
        emit("phone_result", {"boxes": [], "error": "Inference unavailable"})
    elif event == "smoking_frame":
        emit("smoking_result", {"label": "unavailable", "prob": None, "error": "Inference unavailable"})


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
        app.logger.exception("Phone inference failed")
        emit("phone_result", {"boxes": [], "error": "Inference unavailable"})
        return

    # Important: phone_frame should ONLY run phone inference.
    return
    
    
    
    
    


@socketio.on("smoking_frame")
def handle_smoking_frame(_data):
    emit("smoking_result", _smoking_unavailable())

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
