from flask_socketio import emit
from .runtime import *


@socketio.on("phone_frame")
def handle_phone_frame(data):
    """
    Client gửi: { "image": "data:image/jpeg;base64,..." }
    Server trả: { "boxes": [...] } hoặc { "error": "..." }
    """
    if phone_yolo_model is None and phone_yolo_onnx is None:
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

