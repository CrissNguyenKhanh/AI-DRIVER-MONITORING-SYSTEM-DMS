from .runtime import *


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

    # Thử flip=False trước (khớp training Kaggle — ảnh thẳng), fallback flip=True
    vec = None
    for flip_val in (False, True):
        try:
            vec = _image_base64_to_landmarks(image_b64, flip=flip_val)
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

    # Ngưỡng tối thiểu: nếu model không tự tin, coi là "safe" (bình thường)
    # Đặc biệt quan trọng khi model chỉ có 2 class (drowsy/yawning) mà không có "safe"
    CONFIDENCE_THRESHOLD = float(os.getenv("LANDMARK_MIN_CONFIDENCE", "0.52"))
    MARGIN_THRESHOLD = float(os.getenv("LANDMARK_MIN_MARGIN", "0.05"))
    if scores and len(scores) >= 2:
        sorted_probs = sorted(scores.values(), reverse=True)
        margin = sorted_probs[0] - sorted_probs[1]
        if best_prob is not None and (best_prob < CONFIDENCE_THRESHOLD or margin < MARGIN_THRESHOLD):
            label = "safe"

    return jsonify(
        {
            "label": label,
            "prob": best_prob,
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
    if phone_yolo_model is None and phone_yolo_onnx is None:
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
        if phone_yolo_onnx is not None:
            return jsonify({"boxes": _yolo_onnx_detect(phone_yolo_onnx, img, conf_thres=0.4)})
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
    Nhận vector landmark tay (63 sau normalize như collect_hands, hoặc 126 legacy)
    → dự đoán ký hiệu tay.
    Body JSON: { "landmarks": [...] } độ dài khớp vec_len của model đã train.
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


# ═══════════════════════════════════════════════════════════════
# IDENTITY API (xác thực tài xế chính chủ bằng khuôn mặt)
# ═══════════════════════════════════════════════════════════════


