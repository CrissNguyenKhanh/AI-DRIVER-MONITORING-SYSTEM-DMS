"""
quick_test.py
Train model từ landmarks.csv rồi test live qua webcam ngay — không cần API.

Cách dùng (từ thư mục driver_training):
    python quick_test.py              ← tự tìm landmarks.csv
    python quick_test.py --retrain    ← train lại dù đã có pkl
    python quick_test.py --csv path/to/landmarks.csv

Phím:
    ESC → thoát
"""

import os, sys, argparse
os.environ["GLOG_minloglevel"]      = "3"
os.environ["TF_CPP_MIN_LOG_LEVEL"]  = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

_stderr = sys.stderr
sys.stderr = open(os.devnull, "w")
import mediapipe as mp
sys.stderr = _stderr

import cv2
import csv
import time
import joblib
import numpy as np
from pathlib import Path
from collections import deque

# ══════════════════════════════════════════════
# PATHS
# ══════════════════════════════════════════════
BASE        = Path(__file__).resolve().parent
CSV_PATH    = BASE / "collect" / "data" / "landmarks.csv"
MODEL_PATH  = BASE / "models" / "quick_model.pkl"
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

# ══════════════════════════════════════════════
# MÀU & NHÃN
# ══════════════════════════════════════════════
LABEL_COLOR = {
    "safe":    (0, 210, 0),
    "drowsy":  (0, 100, 255),
    "yawning": (0, 200, 255),
    "angry":   (0, 0, 255),
    "stressed":(0, 140, 255),
}
LABEL_VI = {
    "safe":    "BÌNH THƯỜNG",
    "drowsy":  "BUỒN NGỦ!",
    "yawning": "ĐANG NGÁP!",
    "angry":   "TỨC GIẬN!",
    "stressed":"CĂNG THẲNG!",
}

# ══════════════════════════════════════════════
# TRAIN
# ══════════════════════════════════════════════
def train(csv_path: Path, model_path: Path):
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report

    print(f"📂 Đọc CSV: {csv_path}")
    labels, features = [], []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if not row: continue
            labels.append(row[0])
            features.append([float(x) for x in row[1:]])

    X = np.array(features, dtype=np.float32)
    y = np.array(labels)

    from collections import Counter
    print("  Phân bố class:")
    for cls, cnt in sorted(Counter(y).items()):
        print(f"    {cls:<12}: {cnt}")

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Train: {len(X_train)}  |  Val: {len(X_val)}")

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", MLPClassifier(
            hidden_layer_sizes=(256, 128),
            activation="relu",
            solver="adam",
            max_iter=300,
            random_state=42,
            early_stopping=True,
            n_iter_no_change=15,
            verbose=False,
        )),
    ])

    print("🚀 Đang train...", flush=True)
    pipe.fit(X_train, y_train)

    y_pred = pipe.predict(X_val)
    classes = sorted(set(y))
    print("\n" + classification_report(y_val, y_pred, target_names=classes))

    joblib.dump({"model": pipe, "classes": classes}, model_path)
    print(f"💾 Model lưu: {model_path}\n")
    return pipe, classes


# ══════════════════════════════════════════════
# LIVE TEST
# ══════════════════════════════════════════════
def run_webcam(model, classes):
    _mp   = mp.solutions.face_mesh
    _draw = mp.solutions.drawing_utils
    _sty  = mp.solutions.drawing_styles

    # Tìm webcam
    print("🔍 Tìm webcam...", flush=True)
    cap = None
    for idx in range(5):
        c = cv2.VideoCapture(idx, cv2.CAP_DSHOW) if sys.platform == "win32" \
            else cv2.VideoCapture(idx)
        if c.isOpened():
            ret, f = c.read()
            if ret and f is not None:
                cap = c
                print(f"✅ Webcam index {idx}", flush=True)
                break
        c.release()

    if cap is None:
        print("❌ Không tìm thấy webcam!")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    for _ in range(8): cap.read()   # warm-up

    face_mesh = _mp.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.55,
    )

    print("✅ Đang chạy live test... (ESC để thoát)\n", flush=True)

    # Smooth predictions: lấy trung bình 5 frame gần nhất
    history  = deque(maxlen=5)
    fail     = 0
    fps_time = time.time()
    fps      = 0.0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            fail += 1
            if fail > 15: break
            time.sleep(0.05); continue
        fail = 0

        frame = cv2.flip(frame, 1)
        h, w  = frame.shape[:2]

        # FPS
        now  = time.time()
        fps  = 0.9 * fps + 0.1 * (1.0 / max(now - fps_time, 1e-6))
        fps_time = now

        key = cv2.waitKey(8) & 0xFF
        if key == 27: break

        # MediaPipe
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = face_mesh.process(rgb)
        rgb.flags.writeable = True

        has_face = res.multi_face_landmarks is not None
        lms      = res.multi_face_landmarks[0] if has_face else None

        label      = None
        confidence = 0.0
        all_scores = {}

        if lms:
            # Vẽ mesh nhẹ
            _draw.draw_landmarks(frame, lms, _mp.FACEMESH_CONTOURS,
                None, _sty.get_default_face_mesh_contours_style())

            # Predict
            vec    = np.array([c for lm in lms.landmark
                                for c in (lm.x, lm.y, lm.z)],
                              dtype=np.float32).reshape(1, -1)
            proba  = model.predict_proba(vec)[0]
            idx    = int(np.argmax(proba))
            label  = classes[idx]
            confidence = float(proba[idx])
            all_scores = dict(zip(classes, proba))

            history.append(label)

        # Smooth label: lấy label xuất hiện nhiều nhất trong history
        smooth_label = max(set(history), key=history.count) if history else None

        # ── VẼ UI ──
        # Panel kết quả (góc phải)
        pw = 280
        ov = frame.copy()
        cv2.rectangle(ov, (w-pw, 0), (w, h), (15,15,15), -1)
        cv2.addWeighted(ov, 0.7, frame, 0.3, 0, frame)

        cv2.putText(frame, "LIVE PREDICTION", (w-pw+8, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 1)
        cv2.line(frame, (w-pw+8, 30), (w-8, 30), (55,55,55), 1)

        if smooth_label:
            col = LABEL_COLOR.get(smooth_label, (180,180,180))
            vi  = LABEL_VI.get(smooth_label, smooth_label.upper())

            # Label to
            cv2.putText(frame, vi, (w-pw+8, 65),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2)
            cv2.putText(frame, f"{confidence*100:.1f}%", (w-pw+8, 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1)

            # Bar chart từng class
            y_bar = 110
            for cls in classes:
                score = all_scores.get(cls, 0.0)
                c     = LABEL_COLOR.get(cls, (150,150,150))
                bw    = int(160 * score)
                cv2.rectangle(frame, (w-pw+8, y_bar),
                              (w-pw+8+bw, y_bar+14), c, -1)
                cv2.rectangle(frame, (w-pw+8, y_bar),
                              (w-pw+168, y_bar+14), (50,50,50), 1)
                cv2.putText(frame, f"{cls:<10} {score*100:4.1f}%",
                            (w-pw+8, y_bar+11),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35,
                            (10,10,10) if bw > 40 else (200,200,200), 1)
                y_bar += 20
        else:
            dot = (0,0,200) if not has_face else (100,100,100)
            cv2.putText(frame, "NO FACE" if not has_face else "DETECTING...",
                        (w-pw+8, 65),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, dot, 2)

        # FPS + ESC hint
        cv2.rectangle(frame, (0, h-32), (w, h), (12,12,12), -1)
        cv2.putText(frame, f"FPS: {fps:.1f}   |   ESC: thoat",
                    (8, h-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (80,80,80), 1)

        cv2.imshow("Quick Test - Driver Behavior", frame)

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()
    print("✅ Đã thoát!")


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--csv",      default=str(CSV_PATH))
    p.add_argument("--retrain",  action="store_true",
                   help="Train lại dù đã có pkl")
    return p.parse_args()


def main():
    args     = parse_args()
    csv_path = Path(args.csv)

    if not csv_path.exists():
        print(f"❌ Không tìm thấy CSV: {csv_path}")
        print("   Chạy convert_kaggle_face.py hoặc collect_landmarks.py trước!")
        return

    # Train hoặc load pkl
    if MODEL_PATH.exists() and not args.retrain:
        print(f"📦 Load model có sẵn: {MODEL_PATH}")
        print("   (dùng --retrain để train lại)\n")
        bundle = joblib.load(MODEL_PATH)
        model, classes = bundle["model"], bundle["classes"]
    else:
        model, classes = train(csv_path, MODEL_PATH)

    run_webcam(model, classes)


if __name__ == "__main__":
    main()