"""
collect_hands.py  –  v3 (fixed edition)
Thu thập landmark bàn tay từ webcam → lưu CSV

Fix so với v2:
  - Normalize landmark theo wrist + scale → invariant với khoảng cách camera
  - Chỉ dùng 1 tay (dominant hand) → vector 63 chiều thay vì 126, train nhanh gấp đôi
  - Không cache landmark cũ khi skip frame → không save data bẩn
  - Augment đúng: chỉ jitter, không flip (flip đổi ngữ nghĩa gesture)
  - Cooldown sau mỗi lần save → tránh duplicate quá gần nhau
  - Hiển thị confidence score để biết khi nào tay detected tốt

Phím:
    1-5   → chọn class + giữ để capture liên tục
    A     → toggle augmentation
    M     → toggle mesh
    S     → thống kê
    ESC   → thoát
"""

import os, sys, csv, time, threading, atexit
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

try:
    from .paths import HAND_CSV_PATH as CSV_PATH
except ImportError:
    CSV_PATH = Path(__file__).resolve().parent / "hand_dataset.csv"

# ══════════════════════════════════════════════
# CẤU HÌNH — chỉnh tại đây
# ══════════════════════════════════════════════
TARGET      = 300                        # mẫu/class (sau augment)
CAPTURE_FPS = 3                          # snapshot/giây khi giữ phím
MIN_CONF    = 0.70                       # chỉ save khi confidence >= ngưỡng này

# Class mapping — đổi theo project của bạn
KEY_MAP = {
    ord("1"): "no_sign",
    ord("2"): "open",
    ord("3"): "map",
    ord("4"): "music",
    ord("5"): "phonecall",
}

COLORS = {
    "no_sign":   (150, 150, 150),
    "open":      (  0, 220,   0),
    "map":       (255, 180,   0),
    "music":     (  0, 165, 255),
    "phonecall": (255,   0, 180),
}

NUM_LM  = 21
VEC_LEN = NUM_LM * 3   # 63 — chỉ 1 tay, đã normalize

# ══════════════════════════════════════════════
# NORMALIZE — quan trọng nhất, fix "lỏ lỏ"
# ══════════════════════════════════════════════
def normalize_landmarks(hand_landmarks) -> list[float] | None:
    """
    Chuẩn hóa landmark về không gian tương đối:
    1. Trừ wrist (điểm 0) → translation invariant
    2. Chia scale (max abs value) → scale invariant
    3. Flatten → vector 63 chiều

    Kết quả: model không bị ảnh hưởng bởi tay gần/xa camera
    hay tay ở góc nào của frame.
    """
    if hand_landmarks is None:
        return None

    pts = np.array(
        [(lm.x, lm.y, lm.z) for lm in hand_landmarks.landmark],
        dtype=np.float32
    )  # shape (21, 3)

    # Bước 1: translation — lấy wrist làm gốc
    pts -= pts[0]

    # Bước 2: scale — normalize theo khoảng cách lớn nhất
    scale = np.max(np.abs(pts))
    if scale < 1e-6:
        return None   # tay quá nhỏ hoặc không rõ
    pts /= scale

    return pts.flatten().tolist()   # 63 phần tử


def get_dominant_hand(multi_lm, multi_handedness):
    """
    Lấy tay có confidence cao nhất.
    Trả về (landmarks, confidence) hoặc (None, 0).
    """
    if not multi_lm:
        return None, 0.0

    best_lm   = None
    best_conf = 0.0
    for i, hlm in enumerate(multi_lm):
        conf = 0.0
        if multi_handedness and i < len(multi_handedness):
            conf = multi_handedness[i].classification[0].score
        if conf > best_conf:
            best_conf = conf
            best_lm   = hlm

    return best_lm, best_conf


# ══════════════════════════════════════════════
# AUGMENTATION — chỉ jitter, không flip
# ══════════════════════════════════════════════
def augment_vector(vec: list, n: int = 3) -> list[list]:
    """
    Sinh biến thể bằng Gaussian jitter nhỏ.
    KHÔNG flip vì flip đổi ngữ nghĩa (left ↔ right hand).
    n=3 → mỗi sample gốc sinh thêm 3 sample → tổng ×4.
    """
    pts = np.array(vec, dtype=np.float32)
    results = []
    for _ in range(n):
        noise = np.random.normal(0, 0.006, pts.shape).astype(np.float32)
        results.append((pts + noise).tolist())
    return results


# ══════════════════════════════════════════════
# DATA HELPERS
# ══════════════════════════════════════════════
def count_samples() -> dict:
    counts = {cls: 0 for cls in KEY_MAP.values()}
    if not CSV_PATH.exists():
        return counts
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if row and row[0] in counts:
                counts[row[0]] += 1
    return counts


def save_sample(label: str, vec: list, augment: bool = True) -> int:
    rows = [[label] + [f"{v:.6f}" for v in vec]]
    if augment:
        rows += [[label] + [f"{v:.6f}" for v in av]
                 for av in augment_vector(vec)]

    # Ghi header nếu file chưa tồn tại
    write_header = not CSV_PATH.exists()
    with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(["label"] + [f"f{i}" for i in range(VEC_LEN)])
        writer.writerows(rows)
    return len(rows)


def print_stats(counts: dict):
    print("\n" + "═" * 52)
    print("  HAND DATASET STATS")
    print("═" * 52)
    total = 0
    for cls, cnt in counts.items():
        pct = min(cnt / TARGET, 1.0)
        bar = "█" * int(pct * 20) + "░" * (20 - int(pct * 20))
        status = "✓ DONE" if cnt >= TARGET else f"{cnt:>4}/{TARGET}"
        print(f"  {cls:<12} {status}  [{bar}]")
        total += cnt
    tgt = len(KEY_MAP) * TARGET
    print(f"\n  TOTAL: {total} / {tgt}  ({total/tgt*100:.0f}%)")
    print("═" * 52 + "\n")


# ══════════════════════════════════════════════
# CAMERA THREAD
# ══════════════════════════════════════════════
class CameraThread:
    def __init__(self, cap):
        self.cap    = cap
        self._frame = None
        self._lock  = threading.Lock()
        self._stop  = threading.Event()
        self._t     = threading.Thread(target=self._run, daemon=True)
        self._t.start()

    def _run(self):
        while not self._stop.is_set():
            ret, frame = self.cap.read()
            if ret and frame is not None:
                with self._lock:
                    self._frame = frame

    def read(self):
        with self._lock:
            return (True, self._frame.copy()) if self._frame is not None else (False, None)

    def stop(self):
        self._stop.set()
        self._t.join(timeout=2)
        self.cap.release()


def open_camera():
    print("🔍 Tìm webcam...", flush=True)
    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    for idx in range(4):
        cap = cv2.VideoCapture(idx, backend)
        if not cap.isOpened():
            continue
        ret, f = cap.read()
        if not ret or f is None:
            cap.release()
            continue
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        for _ in range(5):
            cap.read()
        print(f"✅ Webcam #{idx} — 640×480", flush=True)
        return cap
    return None


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
        return (len(self.times) - 1) / (self.times[-1] - self.times[0] + 1e-9)


# ══════════════════════════════════════════════
# UI DRAW
# ══════════════════════════════════════════════
def draw_ui(frame, active_cls, counts, last_saved_n,
            hand_conf, mesh_on, aug_on, fps):
    h, w = frame.shape[:2]

    # Left panel background
    panel = np.zeros((h, 240, 3), dtype=np.uint8)
    panel[:] = (14, 14, 18)
    frame[:, :240] = cv2.addWeighted(frame[:, :240], 0.15, panel, 0.85, 0)

    # Title + FPS
    cv2.putText(frame, "HAND COLLECTOR v3", (8, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, cv2.LINE_AA)
    fps_col = (0, 200, 0) if fps >= 25 else (0, 180, 220) if fps >= 15 else (0, 50, 255)
    cv2.putText(frame, f"FPS:{fps:.0f}", (175, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, fps_col, 1, cv2.LINE_AA)
    cv2.line(frame, (8, 28), (232, 28), (40, 40, 40), 1)

    # Hand confidence bar
    conf_color = (0, 200, 0) if hand_conf >= MIN_CONF else (0, 100, 255) if hand_conf > 0 else (60, 60, 60)
    cv2.putText(frame, f"CONF: {hand_conf:.2f}", (8, 46),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, conf_color, 1, cv2.LINE_AA)
    bar_w = int(120 * hand_conf)
    cv2.rectangle(frame, (80, 36), (200, 48), (30, 30, 30), -1)
    if bar_w:
        cv2.rectangle(frame, (80, 36), (80 + bar_w, 48), conf_color, -1)

    # Toggles
    cv2.putText(frame, f"[M]Mesh:{'ON' if mesh_on else 'OF'}  [A]Aug:{'ON' if aug_on else 'OF'}",
                (8, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (65, 65, 85), 1, cv2.LINE_AA)
    cv2.line(frame, (8, 70), (232, 70), (35, 35, 35), 1)

    # Class list
    y = 88
    for k, cls in KEY_MAP.items():
        on   = (cls == active_cls)
        col  = COLORS.get(cls, (150, 150, 150))
        cnt  = counts.get(cls, 0)
        done = cnt >= TARGET

        if done:
            cv2.rectangle(frame, (3, y - 12), (236, y + 4), (18, 38, 18), -1)
            cv2.putText(frame, f"[{chr(k)}] {cls:<11} ✓",
                        (8, y), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 180, 0), 1, cv2.LINE_AA)
        else:
            if on:
                cv2.rectangle(frame, (3, y - 12), (236, y + 4), col, -1)
                tc = (10, 10, 10)
            else:
                tc = col
            # mini progress bar
            bw = int(36 * min(cnt / TARGET, 1.0))
            cv2.rectangle(frame, (198, y - 9), (234, y + 1), (30, 30, 30), -1)
            if bw:
                cv2.rectangle(frame, (198, y - 9), (198 + bw, y + 1),
                              (10, 10, 10) if on else col, -1)
            cv2.putText(frame, f"[{chr(k)}] {cls:<11} {cnt:>3}",
                        (8, y), cv2.FONT_HERSHEY_SIMPLEX, 0.36, tc, 1, cv2.LINE_AA)
        y += 20

    # Bottom status bar
    cv2.rectangle(frame, (0, h - 44), (w, h), (8, 8, 10), -1)
    cv2.line(frame, (0, h - 44), (w, h - 44), (30, 30, 30), 1)

    if active_cls:
        col = COLORS.get(active_cls, (150, 150, 150))
        if hand_conf < MIN_CONF:
            msg = f"⚠ CONF THẤP ({hand_conf:.2f} < {MIN_CONF}) — KHÔNG SAVE"
            col = (30, 40, 255)
        elif last_saved_n:
            aug_str = f" +{last_saved_n - 1} aug" if aug_on else ""
            msg = f"✓ SAVED{aug_str}  →  {active_cls.upper()}"
        else:
            msg = f"● GIỮ PHÍM  {active_cls.upper()}"
        cv2.putText(frame, msg, (248, h - 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 2, cv2.LINE_AA)
    else:
        cv2.putText(frame, "Giữ 1-5 để thu  |  S: stats  |  ESC: thoát",
                    (248, h - 26), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (65, 65, 75), 1, cv2.LINE_AA)

    cv2.putText(frame, f"Vec: {VEC_LEN}D  |  Target: {TARGET}/class  |  MinConf: {MIN_CONF}",
                (248, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (45, 45, 55), 1, cv2.LINE_AA)
    return frame


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def main():
    cap = open_camera()
    if cap is None:
        print("❌ Không tìm thấy webcam!")
        return

    cam = CameraThread(cap)
    atexit.register(cam.stop)

    hands_detector = mp.solutions.hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=1,           # 1 = accurate (tay 1 tay quan trọng hơn tốc độ)
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )
    mp_draw   = mp.solutions.drawing_utils
    mp_styles = mp.solutions.drawing_styles
    atexit.register(hands_detector.close)
    atexit.register(cv2.destroyAllWindows)

    print(f"\n📂 Dataset: {CSV_PATH.resolve()}", flush=True)
    print(f"🎯 Target: {TARGET} samples/class  |  MinConf: {MIN_CONF}\n")
    counts = count_samples()
    print_stats(counts)

    interval    = 1.0 / CAPTURE_FPS
    last_save   = 0.0
    last_saved_n = 0
    mesh_on     = True
    aug_on      = True
    fps_counter = FPSCounter()

    # MediaPipe result cache (cập nhật mỗi frame, không dùng cache cũ)
    cur_lm   = None
    cur_hand = None
    cur_conf = 0.0

    while True:
        ret, frame = cam.read()
        if not ret or frame is None:
            time.sleep(0.005)
            continue

        fps_counter.tick()
        key = cv2.waitKey(1) & 0xFF

        # Xử lý phím không phải capture
        if key == 27:
            break
        if key in (ord("s"), ord("S")):
            counts = count_samples()
            print_stats(counts)
        if key in (ord("m"), ord("M")):
            mesh_on = not mesh_on
        if key in (ord("a"), ord("A")):
            aug_on = not aug_on

        frame = cv2.flip(frame, 1)

        # ── MediaPipe inference — MỌI frame, không skip
        # (skip frame là nguyên nhân chính gây data bẩn ở v2)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = hands_detector.process(rgb)
        rgb.flags.writeable = True

        cur_lm   = res.multi_hand_landmarks
        cur_hand = res.multi_handedness

        # Lấy tay dominant
        best_lm, cur_conf = get_dominant_hand(cur_lm, cur_hand)

        # Vẽ mesh
        if mesh_on and cur_lm:
            for hlm in cur_lm:
                mp_draw.draw_landmarks(
                    frame, hlm,
                    mp.solutions.hands.HAND_CONNECTIONS,
                    mp_styles.get_default_hand_landmarks_style(),
                    mp_styles.get_default_hand_connections_style(),
                )

        # ── Thu thập khi giữ phím số
        active_cls   = KEY_MAP.get(key)
        last_saved_n = 0

        if active_cls:
            now  = time.time()
            done = counts.get(active_cls, 0) >= TARGET

            if done:
                pass   # đủ rồi
            elif cur_conf < MIN_CONF:
                pass   # confidence thấp → không save
            elif now - last_save < interval:
                pass   # chưa đến lượt
            else:
                vec = normalize_landmarks(best_lm)
                if vec is not None:
                    n = save_sample(active_cls, vec, augment=aug_on)
                    counts[active_cls] = counts.get(active_cls, 0) + n
                    last_saved_n = n
                    last_save    = now
                    aug_str = f" (+{n-1} aug)" if aug_on else ""
                    print(f"✅ [{active_cls}] {counts[active_cls]}/{TARGET}{aug_str}  conf={cur_conf:.2f}", flush=True)
                    if counts[active_cls] >= TARGET:
                        print(f"🎉 [{active_cls}] ĐỦ MẪU!", flush=True)

        frame = draw_ui(
            frame, active_cls, counts, last_saved_n,
            cur_conf, mesh_on, aug_on, fps_counter.fps()
        )
        cv2.imshow("Hand Sign Collector v3", frame)

    print("\n✅ Thoát!")
    counts = count_samples()
    print_stats(counts)
    cam.stop()


if __name__ == "__main__":
    main()