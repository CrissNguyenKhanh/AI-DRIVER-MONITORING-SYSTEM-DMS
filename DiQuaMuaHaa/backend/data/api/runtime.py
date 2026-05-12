from __future__ import annotations
from flask_socketio import SocketIO, emit
import base64
import os
from pathlib import Path
from typing import Any, Dict, List

import cv2
import joblib
import mediapipe as mp
import numpy as np
import pymysql
import json
from datetime import datetime, timedelta
from urllib import parse, request as urlrequest
from flask import Flask, jsonify, request
from flask_cors import CORS

# Import from refactored modules
from src.core.config import (
    MYSQL_CONFIG,
    IDENTITY_SIM_THRESHOLD,
    IDENTITY_MIN_REGISTER_SAMPLES,
    IDENTITY_MIN_VERIFY_SAMPLES,
    IDENTITY_DECISION_TIMEOUT_SEC,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET,
    MODEL_PATH,
    HAND_MODEL_PATH,
    SMOKING_MODEL_PATH,
    PHONE_MODEL_PATH,
    PHONE_YOLO_MODEL_PATH,
)
from src.services.model_loader import (
    artifact, model, idx_to_label,
    hand_artifact, hand_model, hand_idx_to_label, hand_vec_len,
    smoking_artifact, smoking_model, smoking_idx_to_label,
    phone_artifact, phone_model, phone_idx_to_label, phone_image_size,
    phone_yolo_model, phone_yolo_onnx, YOLO_AVAILABLE,
)
from src.repositories.db_connection import (
    get_mysql_conn,
    _ensure_identity_tables,
    _ensure_driving_session_tables,
    DRIVING_ALERT_TYPES,
)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Tránh lỗi server khi client gửi base64 ảnh quá lớn
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25MB


@app.errorhandler(413)
def too_large(_err):
    return jsonify({"error": "Request payload too large"}), 413


# Database helpers now imported from src.repositories.db_connection


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


def _yolo_letterbox(img, new_size: int = 640):
    h, w = img.shape[:2]
    scale = min(new_size / h, new_size / w)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    img_r = cv2.resize(img, (nw, nh))
    pad_w = (new_size - nw) / 2
    pad_h = (new_size - nh) / 2
    top, bottom = int(round(pad_h - 0.1)), int(round(pad_h + 0.1))
    left, right = int(round(pad_w - 0.1)), int(round(pad_w + 0.1))
    img_p = cv2.copyMakeBorder(
        img_r, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114)
    )
    return img_p, scale, (pad_w, pad_h)


def _yolo_onnx_detect(session, img_bgr, conf_thres: float = 0.4, iou_thres: float = 0.5):
    orig_h, orig_w = img_bgr.shape[:2]
    img_pad, scale, (pad_w, pad_h) = _yolo_letterbox(img_bgr, 640)
    inp = cv2.cvtColor(img_pad, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    inp = np.transpose(inp, (2, 0, 1))[np.newaxis]

    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: inp})[0]
    preds = output[0].T  # (8400, 5)
    mask = preds[:, 4] >= conf_thres
    preds = preds[mask]
    if len(preds) == 0:
        return []

    cx, cy, w, h = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2
    confs = preds[:, 4]

    boxes_cv = np.stack([x1, y1, w, h], axis=1).tolist()
    scores_cv = confs.tolist()
    indices = cv2.dnn.NMSBoxes(boxes_cv, scores_cv, conf_thres, iou_thres)
    if len(indices) == 0:
        return []
    indices = [int(i) for i in (indices.flatten() if hasattr(indices, "flatten") else indices)]

    result = []
    for idx in indices:
        bx1 = (float(x1[idx]) - pad_w) / scale
        by1 = (float(y1[idx]) - pad_h) / scale
        bx2 = (float(x2[idx]) - pad_w) / scale
        by2 = (float(y2[idx]) - pad_h) / scale

        bx1 = max(0.0, bx1 / orig_w)
        by1 = max(0.0, by1 / orig_h)
        bx2 = min(1.0, bx2 / orig_w)
        by2 = min(1.0, by2 / orig_h)
        bw = bx2 - bx1
        bh = by2 - by1
        if bw <= 0 or bh <= 0:
            continue
        result.append(
            {
                "label": "phone",
                "x": float(bx1 + bw / 2),
                "y": float(by1 + bh / 2),
                "w": float(bw),
                "h": float(bh),
                "prob": float(confs[idx]),
            }
        )
    return result


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


def _image_base64_to_landmarks(image_b64: str, flip: bool = False) -> List[float] | None:
    """
    Decode base64 → MediaPipe Face Mesh → vector 1434 số.
    Trả về None nếu không detect được mặt (để API trả no_face thay vì lỗi).
    flip=True: lật ngang ảnh trước khi chạy MediaPipe (khớp với collect_landmarks.py dùng cv2.flip(frame,1)).
    """
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    if flip:
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



socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

__all__ = [name for name in globals() if not name.startswith("__")]

