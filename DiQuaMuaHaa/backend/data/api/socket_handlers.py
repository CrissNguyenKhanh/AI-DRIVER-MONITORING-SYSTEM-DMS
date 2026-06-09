from flask_socketio import emit
# websocket_handlers.py (file có handle_phone_frame)
from flask_socketio import emit
from .runtime import *
import threading, queue, time

_phone_queue = queue.Queue(maxsize=2)
_phone_result_cache = {"boxes": [], "ts": 0}
_phone_last_sent: dict = {}

def _phone_worker():
    global _phone_result_cache
    while True:
        try:
            sid, img = _phone_queue.get(timeout=1.0)
        except queue.Empty:
            continue
        try:
            results = phone_yolo_model(
                img,
                classes=[67],
                conf=0.35,      # giảm từ 0.4 xuống 0.35
                verbose=False,
                imgsz=256       # giảm từ 320 xuống 256
            )[0]
            boxes_out = []
            if results.boxes is not None and len(results.boxes) > 0:
                xywhn = results.boxes.xywhn.cpu().numpy()
                confs = results.boxes.conf.cpu().numpy()
                for (cx, cy, w, h), c in zip(xywhn, confs):
                    boxes_out.append({
                        "label": "phone",
                        "x": float(cx), "y": float(cy),
                        "w": float(w),  "h": float(h),
                        "prob": float(c),
                    })
            _phone_result_cache = {"boxes": boxes_out, "ts": time.time()}
            socketio.emit("phone_result", {"boxes": boxes_out}, to=sid)
        except Exception as exc:
            socketio.emit("phone_result", {"boxes": [], "error": str(exc)}, to=sid)
        _phone_queue.task_done()

# Start worker 1 lần khi module load
if phone_yolo_model is not None:
    threading.Thread(target=_phone_worker, daemon=True).start()
    print("[INFO] Phone worker started")

@socketio.on("phone_frame")
def handle_phone_frame(data):
    if phone_yolo_model is None:
        emit("phone_result", {"boxes": [], "error": "YOLO COCO model not loaded"})
        return

    sid = request.sid
    now = time.time()
    if now - _phone_last_sent.get(sid, 0) < 0.15:
        emit("phone_result", _phone_result_cache)
        return
    _phone_last_sent[sid] = now

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

        try:
            _phone_queue.put_nowait((sid, img))
        except queue.Full:
            try:
                _phone_queue.get_nowait()
            except queue.Empty:
                pass
            _phone_queue.put_nowait((sid, img))

        emit("phone_result", _phone_result_cache)

    except Exception as exc:
        emit("phone_result", {"boxes": [], "error": str(exc)})
        return

@socketio.on("smoking_frame")
def handle_smoking_frame(data):
    """
    Client gửi: { "image": "data:image/jpeg;base64,..." }
    Server trả: { "label": "...", "prob": <float> } cho frontend smoking WS.
    """
    # Tạm tắt smoking để tập trung debug/tinh chỉnh phone detection.
    emit(
        "smoking_result", {"label": "no_smoking", "prob": 0, "raw_label": "no_smoking"}
    )
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
