from __future__ import annotations
from flask_socketio import SocketIO, emit
import base64
from pathlib import Path
from typing import Any, Dict, List

import cv2
import joblib
import mediapipe as mp
import numpy as np
import pymysql
import json
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from ultralytics import YOLO  # type: ignore

    YOLO_AVAILABLE = True
except Exception:  # ImportError, RuntimeError, ...
    YOLO_AVAILABLE = False


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


BASE_DIR = Path(__file__).resolve().parents[2]  # .../backend
MODEL_PATH = BASE_DIR / "driver_training" / "models" / "landmark_model.pkl"
HAND_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "hand_model.pkl"
SMOKING_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "smoking_model.pkl"
PHONE_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_model.pkl"
PHONE_YOLO_MODEL_PATH = BASE_DIR / "driver_training" / "models" / "phone_yolo.pt"

# MySQL (XAMPP) config cho module xác thực danh tính tài xế
MYSQL_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",  # TODO: chỉnh lại cho đúng user MySQL của bạn
    "password": "",  # TODO: điền mật khẩu nếu có
    "database": "diquamuaha",  # TODO: tạo database này hoặc đổi sang tên bạn đang dùng
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

IDENTITY_SIM_THRESHOLD = 0.90


artifact: Dict[str, Any] | None = None
model = None
idx_to_label: Dict[int, str] = {}

hand_artifact: Dict[str, Any] | None = None
hand_model = None
hand_idx_to_label: Dict[int, str] = {}

smoking_artifact: Dict[str, Any] | None = None
smoking_model = None
smoking_idx_to_label: Dict[int, str] = {}

phone_artifact: Dict[str, Any] | None = None
phone_model = None
phone_idx_to_label: Dict[int, str] = {}
phone_image_size: int | None = None

phone_yolo_model = None


def get_mysql_conn():
    return pymysql.connect(**MYSQL_CONFIG)


def load_model() -> None:
    global artifact, model, idx_to_label
    if not MODEL_PATH.exists():
        artifact = None
        model = None
        idx_to_label = {}
        return

    artifact = joblib.load(MODEL_PATH)
    model = artifact.get("model")
    label_to_idx = artifact.get("label_to_idx", {})
    idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_hand_model() -> None:
    global hand_artifact, hand_model, hand_idx_to_label
    if not HAND_MODEL_PATH.exists():
        hand_artifact = None
        hand_model = None
        hand_idx_to_label = {}
        return

    hand_artifact = joblib.load(HAND_MODEL_PATH)
    hand_model = hand_artifact.get("model")
    label_to_idx = hand_artifact.get("label_to_idx", {})
    hand_idx_to_label = {v: k for k, v in label_to_idx.items()}


def load_smoking_model() -> None:
    global smoking_artifact, smoking_model, smoking_idx_to_label
    if not SMOKING_MODEL_PATH.exists():
        smoking_artifact = None
        smoking_model = None
        smoking_idx_to_label = {}
        return

    smoking_artifact = joblib.load(SMOKING_MODEL_PATH)
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

    phone_artifact = joblib.load(PHONE_MODEL_PATH)
    phone_model = phone_artifact.get("model")
    label_to_idx = phone_artifact.get("label_to_idx", {})
    phone_idx_to_label = {v: k for k, v in label_to_idx.items()}
    img_sz = phone_artifact.get("image_size")
    try:
        phone_image_size = int(img_sz) if img_sz is not None else None
    except (TypeError, ValueError):
        phone_image_size = None


def load_phone_yolo_model() -> None:
    global phone_yolo_model
    if not PHONE_YOLO_MODEL_PATH.exists() or not YOLO_AVAILABLE:
        phone_yolo_model = None
        return
    try:
        phone_yolo_model = YOLO(str(PHONE_YOLO_MODEL_PATH))
    except Exception:
        phone_yolo_model = None


load_model()
load_hand_model()
load_smoking_model()
load_phone_model()
load_phone_yolo_model()


# MediaPipe Face Mesh - khớp với collect_landmarks/convert_kaggle_face để inference chuẩn
_face_mesh = mp.solutions.face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.55,
    min_tracking_confidence=0.55,
    static_image_mode=True,  # mỗi request là 1 ảnh tĩnh → detect chuẩn hơn
)

# MediaPipe Hands - khớp với collect_hands
_hands = mp.solutions.hands.Hands(
    static_image_mode=True,  # mỗi request là 1 ảnh tĩnh
    max_num_hands=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

NUM_LANDMARKS_PER_HAND = 21


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


def _image_base64_to_landmarks(image_b64: str) -> List[float] | None:
    """
    Decode base64 → MediaPipe Face Mesh → vector 1434 số.
    Trả về None nếu không detect được mặt (để API trả no_face thay vì lỗi).
    """
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


def _image_base64_to_hand_landmarks(image_b64: str) -> List[float]:
    """Decode base64 image → chạy MediaPipe Hands → trả về vector 126 số."""
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = _hands.process(rgb)
    return _hands_to_vector(results.multi_hand_landmarks, results.multi_handedness)


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


def _get_face_embedding_from_image(image_b64: str) -> List[float] | None:
    """
    Lấy embedding khuôn mặt dùng trực tiếp vector landmark (1434 số).
    Nếu sau này muốn thay bằng model embedding khác thì chỉ cần đổi hàm này.
    """
    vec = _image_base64_to_landmarks(image_b64)
    return vec


@app.get("/health")
def health() -> Any:
    return jsonify(
        {
            "status": "ok",
            "model_loaded": model is not None,
            "model_path": str(MODEL_PATH),
            "labels": list(idx_to_label.values()),
            "landmark_model_loaded": model is not None,
            "landmark_model_path": str(MODEL_PATH),
            "landmark_labels": list(idx_to_label.values()),
            "hand_model_loaded": hand_model is not None,
            "hand_model_path": str(HAND_MODEL_PATH),
            "hand_labels": list(hand_idx_to_label.values()),
            "smoking_model_loaded": smoking_model is not None,
            "smoking_model_path": str(SMOKING_MODEL_PATH),
            "smoking_labels": list(smoking_idx_to_label.values()),
            "phone_model_loaded": phone_model is not None,
            "phone_model_path": str(PHONE_MODEL_PATH),
            "phone_labels": list(phone_idx_to_label.values()),
        }
    )


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

    return jsonify(
        {
            "label": label,
            "prob": float(max(scores.values())) if scores else None,
            "scores": scores,
        }
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
    if phone_yolo_model is None:
        return (
            jsonify(
                {
                    "error": "YOLO phone model chưa được load. Hãy train và lưu phone_yolo.pt, sau đó restart API.",
                    "model_path": str(PHONE_YOLO_MODEL_PATH),
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

    # Run YOLO
    try:
        results = phone_yolo_model(img, conf=0.4, iou=0.5, verbose=False)[0]  # type: ignore[attr-defined]
    except Exception as exc:
        return jsonify({"error": f"Lỗi YOLO detect: {exc}"}), 500

    boxes_out: List[Dict[str, Any]] = []

    if results.boxes is not None and len(results.boxes) > 0:  # type: ignore[truthy-function]
        # xywhn: normalized center x,y,w,h in [0,1]
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
    Nhận vector 126 số (hand landmarks) → dự đoán ký hiệu tay.
    Body JSON: { "landmarks": [x1, y1, z1, ..., x126] }
    """
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


@app.post("/api/hand/predict_from_frame")
def hand_predict_from_frame() -> Any:
    """
    Nhận ảnh base64 (từ webcam), chạy MediaPipe Hands để trích landmark,
    rồi dùng hand model đã train để dự đoán ký hiệu tay.
    Body JSON: { "image": "data:image/jpeg;base64,..." hoặc "base64_string" }
    """
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
    image_b64 = payload.get("image")

    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    try:
        embedding = _get_face_embedding_from_image(image_b64)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if embedding is None:
        return jsonify({"error": "Không detect được khuôn mặt để đăng ký."}), 400

    embedding_json = json.dumps(embedding)
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS driver_identity (
                    driver_id      VARCHAR(64) PRIMARY KEY,
                    name           VARCHAR(255),
                    embedding_json LONGTEXT NOT NULL,
                    image_base64   LONGTEXT,
                    created_at     DATETIME NOT NULL
                )
                """
            )
            cur.execute(
                """
                INSERT INTO driver_identity (driver_id, name, embedding_json, image_base64, created_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    embedding_json = VALUES(embedding_json),
                    image_base64 = VALUES(image_base64),
                    created_at = VALUES(created_at)
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
    image_b64 = payload.get("image")

    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400
    if not image_b64 or not isinstance(image_b64, str):
        return jsonify({"error": "Thiếu trường 'image' (base64) trong JSON body."}), 400

    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]

    # Lấy embedding hiện tại
    try:
        embedding_now = _get_face_embedding_from_image(image_b64)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if embedding_now is None:
        return jsonify({"error": "Không detect được khuôn mặt hiện tại."}), 400

    # Lấy embedding đã đăng ký
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT embedding_json FROM driver_identity WHERE driver_id = %s",
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

    return jsonify(
        {
            "driver_id": driver_id,
            "has_registered": True,
            "is_owner": bool(similarity >= threshold),
            "similarity": float(similarity),
            "threshold": float(threshold),
        }
    )


socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
# phone pro
@socketio.on("phone_frame")
def handle_phone_frame(data):
    """
    Client gửi: { "image": "data:image/jpeg;base64,..." }
    Server trả: { "boxes": [...] } hoặc { "error": "..." }
    """
    if phone_yolo_model is None:
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

        results = phone_yolo_model(img, conf=0.4, iou=0.5, verbose=False)[0]
        boxes_out = []
        if results.boxes is not None and len(results.boxes) > 0:
            xywhn = results.boxes.xywhn.cpu().numpy()
            confs  = results.boxes.conf.cpu().numpy()
            clss   = results.boxes.cls.cpu().numpy().astype(int)
            names  = results.names
            for (cx, cy, w, h), c, cls_idx in zip(xywhn, confs, clss):
                label = str(names.get(int(cls_idx), int(cls_idx))) if isinstance(names, dict) else str(int(cls_idx))
                boxes_out.append({"label": label, "x": float(cx), "y": float(cy), "w": float(w), "h": float(h), "prob": float(c)})

        emit("phone_result", {"boxes": boxes_out})
    except Exception as exc:
        emit("phone_result", {"boxes": [], "error": str(exc)})
        
    if smoking_model is None or not smoking_idx_to_label:
        emit("smoking_result", {"label": "no_model", "prob": 0, "raw_label": "no_model"})
        return
 
    image_b64 = data.get("image", "")
    if image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[-1]
 
    if not image_b64:
        emit("smoking_result", {"label": "no_face", "prob": 0, "raw_label": "no_face"})
        return
 
    try:
        result = _run_smoking_inference(image_b64)
        emit("smoking_result", {
            "label":     result["label"],
            "prob":      result["prob"] or 0,
            "raw_label": result["raw_label"],
        })
    except Exception as exc:
        emit("smoking_result", {"label": "error", "prob": 0, "raw_label": str(exc)})


if __name__ == "__main__":
      socketio.run(app, host="0.0.0.0", port=8000, debug=True, allow_unsafe_werkzeug=True)

