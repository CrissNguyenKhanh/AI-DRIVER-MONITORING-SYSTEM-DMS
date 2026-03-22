"""
collect_hands.py  –  v2 (smooth edition)
Thu thập landmark bàn tay từ webcam → lưu CSV
Tối ưu hiệu suất: threaded capture, dynamic resolution, skip frames

Phím:
    1-9, 0 → chọn class + capture liên tục
    A → toggle augmentation
    M → toggle mesh
    S → thống kê
    ESC → thoát
"""

import os, sys, csv, time, threading, queue, atexit
os.environ["GLOG_minloglevel"]      = "3"
os.environ["TF_CPP_MIN_LOG_LEVEL"]  = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

_stderr = sys.stderr
sys.stderr = open(os.devnull, "w")
import mediapipe as mp
sys.stderr = _stderr

import cv2
import numpy as np
from pathlib import Path
from collections import deque

# ══════════════════════════════════════════════
# CẤU HÌNH
# ══════════════════════════════════════════════
try:
    from .paths import DATA_DIR, HAND_CSV_PATH
except ImportError:
    DATA_DIR = Path(__file__).parent / "data"
    HAND_CSV_PATH = DATA_DIR / "hand_landmarks.csv"

CSV_PATH = HAND_CSV_PATH
TARGET      = 200
CAPTURE_FPS = 2          # mẫu/giây

# Camera: thử độ phân giải từ cao xuống thấp cho đến khi đạt 30fps
RES_OPTIONS = [(1280,720), (960,540), (640,480)]
MIN_FPS     = 25         # fps tối thiểu cần đạt

NUM_LM = 21
VEC_LEN = NUM_LM * 3 * 2   # 126

KEY_MAP = {
    ord("1"): "stop",
    ord("2"): "go",
    ord("3"): "turn_left",
    ord("4"): "turn_right",
    ord("5"): "slow_down",
    ord("6"): "help",
    ord("7"): "ok",
    ord("8"): "thank_you",
    ord("9"): "no_sign",
    ord("0"): "emergency",
    ord("k"): "sukuna",
}

COLORS = {
    "stop":       (  0,  0, 255),
    "go":         (  0,220,   0),
    "turn_left":  (255,180,   0),
    "turn_right": (255,180,   0),
    "slow_down":  (  0,165, 255),
    "help":       (  0,140, 255),
    "ok":         (  0,220,   0),
    "thank_you":  (180,220,   0),
    "no_sign":    (150,150, 150),
    "emergency":  (  0,  0, 255),
    "sukuna":     (255,  0, 255), 
}

# ══════════════════════════════════════════════
# MEDIAPIPE
# ══════════════════════════════════════════════
mp_hands    = mp.solutions.hands
mp_drawing  = mp.solutions.drawing_utils
mp_styles   = mp.solutions.drawing_styles

DATA_DIR.mkdir(parents=True, exist_ok=True)


# ══════════════════════════════════════════════
# THREADED CAMERA READER
# Đọc frame trong thread riêng → main thread không bao giờ bị block
# ══════════════════════════════════════════════
class CameraThread:
    def __init__(self, cap: cv2.VideoCapture):
        self.cap    = cap
        self._frame = None
        self._lock  = threading.Lock()
        self._stop  = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            ret, frame = self.cap.read()
            if ret and frame is not None:
                with self._lock:
                    self._frame = frame

    def read(self):
        with self._lock:
            return self._frame is not None, (
                self._frame.copy() if self._frame is not None else None
            )

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=2)
        self.cap.release()


# ══════════════════════════════════════════════
# CAMERA SETUP – tìm resolution tốt nhất
# ══════════════════════════════════════════════
def open_camera():
    """Mở webcam với resolution cao nhất vẫn đạt MIN_FPS."""
    print("🔍 Tìm webcam...", flush=True)
    for idx in range(5):
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        cap = cv2.VideoCapture(idx, backend)
        if not cap.isOpened():
            continue
        ret, f = cap.read()
        if not ret or f is None:
            cap.release()
            continue

        # Thử resolution
        best_w, best_h = 640, 480
        for w, h in RES_OPTIONS:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  w)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
            # Đo FPS thực tế qua 20 frame
            t0 = time.time()
            ok = 0
            for _ in range(20):
                r, _ = cap.read()
                if r: ok += 1
            dt  = time.time() - t0
            fps = ok / max(dt, 0.001)
            print(f"   {w}×{h}: {fps:.0f} fps", flush=True)
            if fps >= MIN_FPS:
                best_w, best_h = w, h
                break   # lấy cao nhất đạt ngưỡng

        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  best_w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, best_h)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # ← giảm buffer lag
        for _ in range(5): cap.read()          # flush buffer cũ

        print(f"✅ Webcam #{idx} — {best_w}×{best_h}", flush=True)
        return cap, best_w, best_h

    return None, 0, 0


# ══════════════════════════════════════════════
# DATA HELPERS
# ══════════════════════════════════════════════
def count_samples():
    counts = {cls: 0 for cls in KEY_MAP.values()}
    if not CSV_PATH.exists():
        return counts
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if row and row[0] in counts:
                counts[row[0]] += 1
    return counts


def hands_to_vector(multi_lm, multi_hand):
    left  = [0.0] * (NUM_LM * 3)
    right = [0.0] * (NUM_LM * 3)
    if not multi_lm:
        return left + right
    for i, hlm in enumerate(multi_lm):
        label = "Left"
        if multi_hand and i < len(multi_hand):
            label = multi_hand[i].classification[0].label
        coords = []
        for lm in hlm.landmark:
            coords += [lm.x, lm.y, lm.z]
        if label == "Left":
            left = coords
        else:
            right = coords
    return left + right


def augment_vector(vec: list) -> list[list]:
    """Sinh thêm biến thể: flip + jitter."""
    pts = np.array(vec, dtype=np.float32).reshape(-1, 3)
    results = []
    for _ in range(3):
        p = pts.copy()
        if np.random.rand() > 0.5:
            p[:, 0] = 1.0 - p[:, 0]   # flip ngang
        p += np.random.normal(0, 0.004, p.shape).astype(np.float32)
        results.append(p.flatten().tolist())
    return results


def save_sample(label: str, vec: list, augment: bool = True):
    rows = [[label] + vec]
    if augment:
        rows += [[label] + av for av in augment_vector(vec)]
    with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    return len(rows)


def print_stats(counts):
    print("\n" + "═"*50)
    print("  HAND SIGN DATASET STATS")
    print("═"*50)
    total = 0
    for cls, cnt in counts.items():
        pct = min(cnt/TARGET, 1.0)
        bar = "█"*int(pct*20) + "░"*(20-int(pct*20))
        print(f"  {cls:<14} {cnt:>4}/{TARGET}  [{bar}] {pct*100:.0f}%")
        total += cnt
    tgt = len(KEY_MAP)*TARGET
    print(f"\n  TOTAL: {total}/{tgt}")
    print("═"*50+"\n")


# ══════════════════════════════════════════════
# FPS COUNTER
# ══════════════════════════════════════════════
class FPSCounter:
    def __init__(self, window=30):
        self.times = deque(maxlen=window)

    def tick(self):
        self.times.append(time.perf_counter())

    def fps(self) -> float:
        if len(self.times) < 2:
            return 0.0
        return (len(self.times)-1) / (self.times[-1] - self.times[0] + 1e-9)


# ══════════════════════════════════════════════
# UI DRAW – vẽ nhẹ, không dùng addWeighted nhiều lần
# ══════════════════════════════════════════════
def draw_ui(frame, active, counts, saved_count,
            hands_detected, mesh_on, aug_on, fps: float):
    h, w = frame.shape[:2]

    # ── Left panel (1 lần blend duy nhất)
    panel = np.zeros((h, 262, 3), dtype=np.uint8)
    panel[:] = (12, 12, 16)
    # blend chỉ vùng panel
    frame[:, :262] = cv2.addWeighted(
        frame[:, :262], 0.20,
        panel, 0.80, 0
    )

    # Title
    cv2.putText(frame, "HAND SIGN COLLECTOR", (8,22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220,220,220), 1, cv2.LINE_AA)

    # FPS badge
    fps_col = (0,200,0) if fps>=25 else (0,180,220) if fps>=15 else (0,50,255)
    cv2.putText(frame, f"FPS:{fps:.0f}", (185,22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, fps_col, 1, cv2.LINE_AA)

    cv2.line(frame, (8,28), (254,28), (40,40,40), 1)

    # Hand status
    dot = (0,200,0) if hands_detected else (30,30,255)
    cv2.circle(frame, (15,44), 5, dot, -1, cv2.LINE_AA)
    cv2.putText(frame, "HAND OK" if hands_detected else "NO HAND",
                (26,48), cv2.FONT_HERSHEY_SIMPLEX, 0.38, dot, 1, cv2.LINE_AA)

    # Toggles
    cv2.putText(frame,
                f"[M]Mesh:{'ON' if mesh_on else 'OF'}  [A]Aug:{'ON' if aug_on else 'OF'}",
                (8,66), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (65,65,85), 1, cv2.LINE_AA)
    cv2.line(frame, (8,74), (254,74), (35,35,35), 1)

    # Class list
    y = 90
    for k, cls in KEY_MAP.items():
        on  = (cls == active)
        col = COLORS[cls]
        cnt = counts.get(cls, 0)
        done = cnt >= TARGET

        if done:
            cv2.rectangle(frame, (3,y-12),(258,y+4),(18,38,18),-1)
            cv2.putText(frame, f"[{chr(k)}] {cls:<12} ✓", (8,y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0,170,0), 1, cv2.LINE_AA)
        else:
            if on:
                cv2.rectangle(frame,(3,y-12),(258,y+4),col,-1)
                tc = (10,10,10)
            else:
                tc = col
            bw = int(38 * min(cnt/TARGET,1.0))
            cv2.rectangle(frame,(214,y-9),(254,y+1),(30,30,30),-1)
            if bw:
                cv2.rectangle(frame,(214,y-9),(214+bw,y+1),
                              (10,10,10) if on else col,-1)
            cv2.putText(frame, f"[{chr(k)}] {cls:<12} {cnt:>3}",
                        (8,y), cv2.FONT_HERSHEY_SIMPLEX, 0.35, tc, 1, cv2.LINE_AA)
        y += 18

    # Bottom bar
    cv2.rectangle(frame,(0,h-44),(w,h),(8,8,10),-1)
    cv2.line(frame,(0,h-44),(w,h-44),(30,30,30),1)

    if active:
        col = COLORS[active]
        if not hands_detected:
            txt, col = "⚠ KHÔNG THẤY TAY!", (30,40,255)
        else:
            txt = f"● REC  {active.upper()}"
        if int(time.time()*3)%3 != 0:
            cv2.circle(frame,(w-18,h-24),7,col,-1,cv2.LINE_AA)
        cv2.putText(frame, txt, (274,h-26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.58, col, 2, cv2.LINE_AA)
        cv2.putText(frame, f"saved: {saved_count}", (274,h-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0,150,0), 1, cv2.LINE_AA)
    else:
        cv2.putText(frame, "Nhan 1-9,0 → thu thap  |  S: stats  |  ESC: thoat",
                    (274,h-26), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (65,65,75), 1, cv2.LINE_AA)
    return frame


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def main():
    cap, cam_w, cam_h = open_camera()
    if cap is None:
        print("❌ Không tìm thấy webcam!")
        return

    # Threaded reader
    cam = CameraThread(cap)
    atexit.register(cam.stop)

    # MediaPipe – dùng model_complexity=0 cho tốc độ
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=0,          # ← 0=fast, 1=accurate
        min_detection_confidence=0.55,
        min_tracking_confidence=0.55,
    )
    atexit.register(hands.close)
    atexit.register(cv2.destroyAllWindows)

    print(f"✅ Dataset: {CSV_PATH}", flush=True)
    print_stats(count_samples())
    print("🎯 Nhấn phím để thu thập. ESC thoát.\n")

    counts      = count_samples()
    saved_count = sum(counts.values())
    interval    = 1.0 / CAPTURE_FPS
    last_save   = 0.0
    mesh_on     = True
    aug_on      = True
    fps_counter = FPSCounter()
    frame_skip  = 0          # xử lý MediaPipe mỗi N frame

    # Resize nhỏ để mediapipe xử lý nhanh hơn
    PROC_W, PROC_H = min(cam_w, 640), min(cam_h, 480)

    while True:
        ret, frame = cam.read()
        if not ret or frame is None:
            time.sleep(0.01)
            continue

        fps_counter.tick()
        current_fps = fps_counter.fps()

        # Dynamic skip: nếu fps thấp thì skip nhiều frame hơn
        skip = 1 if current_fps >= 25 else 2 if current_fps >= 18 else 3
        frame_skip = (frame_skip + 1) % skip

        key = cv2.waitKey(1) & 0xFF   # ← waitKey(1) thay vì (8)

        if key == 27: break
        if key in (ord("s"),ord("S")):
            counts = count_samples(); print_stats(counts)
        if key in (ord("m"),ord("M")):
            mesh_on = not mesh_on
        if key in (ord("a"),ord("A")):
            aug_on = not aug_on

        frame = cv2.flip(frame, 1)

        # ── MediaPipe: chỉ xử lý khi đến lượt
        multi_lm   = None
        multi_hand = None

        if frame_skip == 0:
            # Resize xuống để inference nhanh
            small = cv2.resize(frame, (PROC_W, PROC_H))
            rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            res = hands.process(rgb)
            rgb.flags.writeable = True
            multi_lm   = res.multi_hand_landmarks
            multi_hand = res.multi_handedness
        else:
            # Giữ kết quả frame trước (đã lưu ngoài vòng lặp)
            pass

        # Lưu kết quả để dùng cho skip frames
        if frame_skip == 0:
            _cached_lm   = multi_lm
            _cached_hand = multi_hand
        else:
            try:
                multi_lm   = _cached_lm
                multi_hand = _cached_hand
            except NameError:
                multi_lm = multi_hand = None

        hands_detected = multi_lm is not None

        # Vẽ landmarks (scale lại về frame gốc)
        if mesh_on and multi_lm:
            # Scale factor
            sx = frame.shape[1] / PROC_W
            sy = frame.shape[0] / PROC_H
            for hlm in multi_lm:
                # Scale landmark về kích thước frame gốc
                scaled = mp.solutions.hands.HandLandmark
                mp_drawing.draw_landmarks(
                    frame, hlm,
                    mp_hands.HAND_CONNECTIONS,
                    mp_styles.get_default_hand_landmarks_style(),
                    mp_styles.get_default_hand_connections_style(),
                )

        # Thu thập
        active = None
        cls    = KEY_MAP.get(key)
        if cls:
            active = cls
            now    = time.time()
            done   = counts.get(cls, 0) >= TARGET

            if done:
                pass   # đủ mẫu rồi
            elif not hands_detected:
                pass   # không thấy tay
            elif now - last_save >= interval:
                vec = hands_to_vector(multi_lm, multi_hand)
                n   = save_sample(cls, vec, augment=aug_on)
                counts[cls] = counts.get(cls, 0) + n
                saved_count += n
                last_save    = now
                aug_str = f"(+{n-1} aug)" if aug_on else ""
                print(f"✅ [{cls}] {counts[cls]}/{TARGET} {aug_str}", flush=True)
                if counts[cls] >= TARGET:
                    print(f"🎉 [{cls}] ĐỦ MẪU!", flush=True)

        frame = draw_ui(frame, active, counts, saved_count,
                        hands_detected, mesh_on, aug_on, current_fps)
        cv2.imshow("Hand Sign Collector", frame)

    print("\n✅ Thoát!")
    print_stats(count_samples())


if __name__ == "__main__":
    main()