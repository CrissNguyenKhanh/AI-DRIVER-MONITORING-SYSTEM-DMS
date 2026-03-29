"""
collect_landmarks.py
Thu thập tọa độ landmark khuôn mặt từ webcam → lưu vào CSV

Phím:
    1-5  → bắt đầu thu batch 30 frame liên tục (không cần giữ)
    S    → thống kê
    ESC  → thoát
"""

import os, sys
os.environ["GLOG_minloglevel"]      = "3"
os.environ["TF_CPP_MIN_LOG_LEVEL"]  = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

_stderr = sys.stderr
sys.stderr = open(os.devnull, "w")
import mediapipe as mp
sys.stderr = _stderr

import cv2, csv, time
import numpy as np
from pathlib import Path

try:
    from .paths import FACE_CSV_PATH
except ImportError:
    FACE_CSV_PATH = Path(__file__).parent / "data" / "landmarks.csv"

# ══════════════════════════════════════════════
# CẤU HÌNH
# ══════════════════════════════════════════════
CSV_PATH = FACE_CSV_PATH
TARGET              = 200
BATCH_SIZE          = 30    # số mẫu thu mỗi lần nhấn phím
MIN_FRAME_INTERVAL  = 0.05  # 0.05s = tối đa 20 mẫu/giây

KEY_MAP = {
    ord("1"): "drowsy",
    ord("2"): "yawning",
    ord("3"): "safe",
    ord("4"): "angry",
    ord("5"): "stressed",
}
COLORS = {
    "drowsy":   (0, 100, 255),
    "yawning":  (0, 200, 255),
    "safe":     (0, 220,   0),
    "angry":    (0,   0, 255),
    "stressed": (0, 140, 255),
}

_mp   = mp.solutions.face_mesh
_draw = mp.solutions.drawing_utils
_sty  = mp.solutions.drawing_styles
CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

# ══════════════════════════════════════════════
# HELPER
# ══════════════════════════════════════════════
def count_samples():
    counts = {cls: 0 for cls in KEY_MAP.values()}
    if not CSV_PATH.exists():
        return counts
    with open(CSV_PATH, newline="") as f:
        for row in csv.reader(f):
            if row and row[0] in counts:
                counts[row[0]] += 1
    return counts

def save_sample(label, vec):
    with open(CSV_PATH, "a", newline="") as f:
        csv.writer(f).writerow([label] + vec.tolist())

def lms_to_vec(lms):
    return np.array([c for lm in lms.landmark
                     for c in (lm.x, lm.y, lm.z)], dtype=np.float32)

def print_stats(counts):
    print("\n" + "="*42)
    print("  LANDMARK DATASET STATS")
    print("="*42)
    total = 0
    for cls, cnt in counts.items():
        bar = "█"*(cnt//5) + "░"*max(0,(TARGET-cnt)//10)
        print(f"  {cls:<12} {cnt:>4}/{TARGET}  {bar}")
        total += cnt
    tgt = len(KEY_MAP)*TARGET
    print(f"\n  TOTAL: {total}/{tgt}  ({min(100,total*100//max(tgt,1))}%)")
    print("="*42+"\n")

def draw_ui(frame, active, batch_left, counts, total, has_face):
    h, w = frame.shape[:2]
    ov = frame.copy()
    cv2.rectangle(ov,(0,0),(245,h),(15,15,15),-1)
    cv2.addWeighted(ov,0.75,frame,0.25,0,frame)

    cv2.putText(frame,"LANDMARK COLLECTOR",(8,22),
                cv2.FONT_HERSHEY_SIMPLEX,0.5,(255,255,255),1)
    cv2.line(frame,(8,28),(237,28),(55,55,55),1)

    dot = (0,200,0) if has_face else (0,0,200)
    cv2.circle(frame,(15,42),6,dot,-1)
    cv2.putText(frame,"FACE OK" if has_face else "NO FACE",(26,46),
                cv2.FONT_HERSHEY_SIMPLEX,0.4,dot,1)
    cv2.line(frame,(8,54),(237,54),(45,45,45),1)

    y = 70
    for k, cls in KEY_MAP.items():
        on  = (cls == active)
        col = COLORS[cls]
        cnt = counts.get(cls, 0)

        if on:
            cv2.rectangle(frame,(3,y-13),(237,y+5),col,-1)
            tc = (10,10,10)
        else:
            tc = col

        bw = int(46*min(cnt/TARGET,1.0))
        cv2.rectangle(frame,(186,y-10),(234,y+2),(35,35,35),-1)
        if bw:
            cv2.rectangle(frame,(186,y-10),(186+bw,y+2),
                          (10,10,10) if on else col,-1)

        cv2.putText(frame,f"[{chr(k)}] {cls:<10} {cnt:>3}",(8,y),
                    cv2.FONT_HERSHEY_SIMPLEX,0.38,tc,1)
        y += 20

    # Bottom bar
    cv2.rectangle(frame,(0,h-44),(w,h),(12,12,12),-1)
    if active and batch_left > 0:
        col = COLORS[active]
        prog = int((BATCH_SIZE - batch_left) / BATCH_SIZE * (w - 260))
        cv2.rectangle(frame,(250,h-38),(250+prog,h-26),col,-1)
        cv2.rectangle(frame,(250,h-38),(w-8,h-26),(50,50,50),1)
        cv2.putText(frame,f"REC {active.upper()}  {BATCH_SIZE-batch_left}/{BATCH_SIZE}",
                    (250,h-10),cv2.FONT_HERSHEY_SIMPLEX,0.55,col,2)
    else:
        cv2.putText(frame,f"Nhan 1-5 thu {BATCH_SIZE} mau  |  S: stats  |  ESC: thoat",
                    (250,h-20),cv2.FONT_HERSHEY_SIMPLEX,0.38,(90,90,90),1)
        cv2.putText(frame,f"total: {total}",
                    (250,h-6),cv2.FONT_HERSHEY_SIMPLEX,0.35,(0,160,0),1)
    return frame

# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def main():
    print("🔍 Tìm webcam...", flush=True)
    cap = None
    for idx in range(5):
        c = cv2.VideoCapture(idx, cv2.CAP_DSHOW) if sys.platform=="win32" \
            else cv2.VideoCapture(idx)
        if c.isOpened():
            ret, f = c.read()
            if ret and f is not None:
                cap = c
                print(f"✅ Webcam index {idx}", flush=True)
                break
        c.release()

    if cap is None:
        print("❌ Không tìm thấy webcam!"); return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    for _ in range(8): cap.read()

    face_mesh = _mp.FaceMesh(
        max_num_faces=1, refine_landmarks=True,
        min_detection_confidence=0.55, min_tracking_confidence=0.55,
    )

    print(f"✅ Sẵn sàng! Nhấn 1-5 để thu {BATCH_SIZE} mẫu/lần\n", flush=True)
    print_stats(count_samples())

    counts        = count_samples()
    total         = sum(counts.values())
    current_label = None
    batch_left    = 0
    last_save     = 0.0
    has_face      = False
    lms           = None
    fail          = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            fail += 1
            if fail > 15: break
            time.sleep(0.02); continue
        fail = 0

        frame = cv2.flip(frame, 1)
        key   = cv2.waitKey(1) & 0xFF

        if key == 27: break
        if key in (ord("s"), ord("S")):
            counts = count_samples(); print_stats(counts)

        # Nhấn phím → bắt batch mới (nhấn lại giữa chừng cũng được)
        cls = KEY_MAP.get(key)
        if cls:
            current_label = cls
            batch_left    = BATCH_SIZE
            print(f"\n🎯 [{cls}] Thu {BATCH_SIZE} mẫu...", flush=True)

        # MediaPipe
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = face_mesh.process(rgb)
        rgb.flags.writeable = True
        has_face = res.multi_face_landmarks is not None
        lms      = res.multi_face_landmarks[0] if has_face else None

        if lms:
            _draw.draw_landmarks(frame, lms, _mp.FACEMESH_CONTOURS,
                None, _sty.get_default_face_mesh_contours_style())

        # Thu mẫu trong batch - nhanh nhất có thể
        if current_label and batch_left > 0:
            now = time.time()
            if now - last_save >= MIN_FRAME_INTERVAL:
                if lms:
                    vec = lms_to_vec(lms)
                    save_sample(current_label, vec)
                    counts[current_label] = counts.get(current_label, 0) + 1
                    total     += 1
                    batch_left -= 1
                    last_save  = now
                    print(f"  {BATCH_SIZE - batch_left}/{BATCH_SIZE}", end="\r", flush=True)
                    if batch_left == 0:
                        print(f"\n✅ [{current_label}] tổng: {counts[current_label]}", flush=True)
                        current_label = None

        frame = draw_ui(frame, current_label, batch_left, counts, total, has_face)
        cv2.imshow("Landmark Collector", frame)

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()
    print("\n✅ Thoát!")
    print_stats(count_samples())

if __name__ == "__main__":
    main()