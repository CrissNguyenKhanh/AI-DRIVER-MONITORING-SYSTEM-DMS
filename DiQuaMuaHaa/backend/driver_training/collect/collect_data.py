"""
collect_data.py - Thu thập dataset lái xe bằng webcam + MediaPipe Face Mesh

Yêu cầu:
    pip install opencv-python mediapipe

Cách dùng:
    python collect_data.py

Phím tắt:
    Khuôn mặt:
        1 → drowsy (buồn ngủ)
        2 → yawning (ngáp)
        3 → safe (bình thường)
        4 → angry (tức giận)
        5 → stressed (căng thẳng)

    Tư thế ngồi (lưu full frame):
        6 → posture_correct
        7 → posture_leaning_left
        8 → posture_leaning_right
        9 → posture_too_close
        0 → posture_slouching

    Giữ phím → chụp liên tục 2 ảnh/giây
    ESC      → thoát
    S        → xem thống kê
    M        → bật/tắt hiển thị landmark
"""

import cv2
import time
import sys
import atexit
import signal
import mediapipe as mp
from pathlib import Path

# ─────────────────────────────────────────────
# CẤU HÌNH
# ─────────────────────────────────────────────
SAVE_DIR = Path(__file__).resolve().parent.parent / "dataset"
CAPTURE_INTERVAL = 0.5
FACE_IMG_SIZE = (224, 224)
FULL_IMG_SIZE = (224, 224)
FACE_PADDING = 0.25

KEY_CLASS_MAP = {
    ord("1"): ("face/drowsy",            "face"),
    ord("2"): ("face/yawning",           "face"),
    ord("3"): ("face/safe",              "face"),
    ord("4"): ("face/angry",             "face"),
    ord("5"): ("face/stressed",          "face"),
    ord("6"): ("posture/correct",        "posture"),
    ord("7"): ("posture/leaning_left",   "posture"),
    ord("8"): ("posture/leaning_right",  "posture"),
    ord("9"): ("posture/too_close",      "posture"),
    ord("0"): ("posture/slouching",      "posture"),
}

CLASS_COLORS = {
    "face/drowsy":            (0, 100, 255),
    "face/yawning":           (0, 200, 255),
    "face/safe":              (0, 220, 0),
    "face/angry":             (0, 0, 255),
    "face/stressed":          (0, 140, 255),
    "posture/correct":        (0, 220, 0),
    "posture/leaning_left":   (255, 180, 0),
    "posture/leaning_right":  (255, 180, 0),
    "posture/too_close":      (0, 0, 255),
    "posture/slouching":      (0, 100, 255),
}

# ─────────────────────────────────────────────
# MEDIAPIPE SETUP
# ─────────────────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# ─────────────────────────────────────────────
# GLOBAL RESOURCES (để cleanup khi thoát đột ngột)
# ─────────────────────────────────────────────
_cap = None
_face_mesh = None


def _cleanup():
    """Đảm bảo luôn giải phóng camera và đóng cửa sổ dù thoát cách nào."""
    global _cap, _face_mesh
    if _cap is not None:
        try:
            _cap.release()
        except Exception:
            pass
        _cap = None
    if _face_mesh is not None:
        try:
            _face_mesh.close()
        except Exception:
            pass
        _face_mesh = None
    try:
        cv2.destroyAllWindows()
        # Pump event loop để Windows thực sự đóng cửa sổ
        for _ in range(5):
            cv2.waitKey(1)
    except Exception:
        pass


# Đăng ký cleanup cho mọi trường hợp thoát
atexit.register(_cleanup)

def _signal_handler(sig, frame):
    _cleanup()
    sys.exit(0)

signal.signal(signal.SIGINT, _signal_handler)
if hasattr(signal, "SIGTERM"):
    signal.signal(signal.SIGTERM, _signal_handler)


# ─────────────────────────────────────────────
# TỰ ĐỘNG TÌM CAMERA
# ─────────────────────────────────────────────
def _try_open(index, use_dshow=False):
    """Thử mở camera, trả về cap nếu thành công, None nếu không."""
    try:
        if use_dshow and sys.platform == "win32":
            cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(index)

        if not cap.isOpened():
            cap.release()
            return None

        # Cần đọc ít nhất 1 frame để xác nhận camera thực sự hoạt động
        for _ in range(3):
            ret, frame = cap.read()
            if ret and frame is not None and frame.size > 0:
                return cap
            time.sleep(0.05)

        cap.release()
        return None
    except Exception:
        return None


def find_and_open_camera():
    """Tìm và mở camera, trả về cap object (đã mở sẵn) hoặc None."""
    print("🔍 Đang tìm webcam...")

    backends = []
    if sys.platform == "win32":
        backends = [(True, "DSHOW"), (False, "default")]
    else:
        backends = [(False, "default")]

    for use_dshow, backend_name in backends:
        for i in range(6):
            cap = _try_open(i, use_dshow)
            if cap is not None:
                print(f"✅ Mở webcam tại index {i} (backend: {backend_name})")
                return cap

    return None


# ─────────────────────────────────────────────
# HÀM TIỆN ÍCH
# ─────────────────────────────────────────────
def ensure_dirs():
    for class_name, _ in KEY_CLASS_MAP.values():
        (SAVE_DIR / class_name).mkdir(parents=True, exist_ok=True)


def count_images():
    counts = {}
    for class_name, _ in KEY_CLASS_MAP.values():
        folder = SAVE_DIR / class_name
        counts[class_name] = len(list(folder.glob("*.jpg"))) if folder.exists() else 0
    return counts


def next_filename(class_name: str) -> Path:
    folder = SAVE_DIR / class_name
    existing = list(folder.glob("img_*.jpg"))
    idx = len(existing) + 1
    return folder / f"img_{idx:05d}.jpg"


def get_face_bbox(landmarks, frame_h, frame_w, padding=FACE_PADDING):
    xs = [lm.x * frame_w for lm in landmarks.landmark]
    ys = [lm.y * frame_h for lm in landmarks.landmark]

    x_min, x_max = int(min(xs)), int(max(xs))
    y_min, y_max = int(min(ys)), int(max(ys))

    pad_x = int((x_max - x_min) * padding)
    pad_y = int((y_max - y_min) * padding)

    x1 = max(0, x_min - pad_x)
    y1 = max(0, y_min - pad_y)
    x2 = min(frame_w, x_max + pad_x)
    y2 = min(frame_h, y_max + pad_y)

    return x1, y1, x2, y2


def draw_landmark_mesh(frame, face_landmarks):
    try:
        mp_drawing.draw_landmarks(
            image=frame,
            landmark_list=face_landmarks,
            connections=mp_face_mesh.FACEMESH_TESSELATION,
            landmark_drawing_spec=None,
            connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_tesselation_style(),
        )
        mp_drawing.draw_landmarks(
            image=frame,
            landmark_list=face_landmarks,
            connections=mp_face_mesh.FACEMESH_CONTOURS,
            landmark_drawing_spec=None,
            connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_contours_style(),
        )
        mp_drawing.draw_landmarks(
            image=frame,
            landmark_list=face_landmarks,
            connections=mp_face_mesh.FACEMESH_IRISES,
            landmark_drawing_spec=None,
            connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_iris_connections_style(),
        )
    except Exception:
        pass  # Không crash nếu vẽ mesh lỗi


def draw_ui(frame, active_class, counts, last_saved, face_detected, show_landmark):
    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (265, h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    cv2.putText(frame, "DRIVER DATA COLLECTOR", (8, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)
    cv2.line(frame, (8, 33), (258, 33), (70, 70, 70), 1)

    fd_color = (0, 220, 0) if face_detected else (0, 0, 220)
    fd_text = "FACE DETECTED" if face_detected else "NO FACE"
    cv2.putText(frame, fd_text, (8, 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.44, fd_color, 1)

    lm_text = "[M] mesh ON" if show_landmark else "[M] mesh OFF"
    cv2.putText(frame, lm_text, (8, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (140, 140, 140), 1)

    cv2.line(frame, (8, 72), (258, 72), (50, 50, 50), 1)

    labels = [
        ("1", "drowsy",       "face/drowsy"),
        ("2", "yawning",      "face/yawning"),
        ("3", "safe",         "face/safe"),
        ("4", "angry",        "face/angry"),
        ("5", "stressed",     "face/stressed"),
        (None, None, None),
        ("6", "correct",      "posture/correct"),
        ("7", "lean left",    "posture/leaning_left"),
        ("8", "lean right",   "posture/leaning_right"),
        ("9", "too close",    "posture/too_close"),
        ("0", "slouching",    "posture/slouching"),
    ]

    y = 88
    for key, label, class_name in labels:
        if class_name is None:
            cv2.line(frame, (8, y - 4), (258, y - 4), (50, 50, 50), 1)
            y += 8
            continue

        is_active = (class_name == active_class)
        color = CLASS_COLORS.get(class_name, (180, 180, 180))
        count = counts.get(class_name, 0)

        if is_active:
            cv2.rectangle(frame, (4, y - 13), (258, y + 5), color, -1)
            txt_color = (10, 10, 10)
        else:
            txt_color = color

        progress = min(count / 300.0, 1.0)
        bar_w = int(50 * progress)
        cv2.rectangle(frame, (200, y - 10), (255, y + 2), (50, 50, 50), -1)
        if bar_w > 0:
            bar_color = color if not is_active else (10, 10, 10)
            cv2.rectangle(frame, (200, y - 10), (200 + bar_w, y + 2), bar_color, -1)

        text = f"[{key}] {label:<13} {count:>3}"
        cv2.putText(frame, text, (8, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.41, txt_color, 1)
        y += 21

    cv2.rectangle(frame, (0, h - 55), (w, h), (15, 15, 15), -1)

    if active_class:
        color = CLASS_COLORS.get(active_class, (0, 220, 0))
        status = f"REC: {active_class.split('/')[-1].upper()}"

        if active_class.startswith("face/") and not face_detected:
            status = "WARNING: KHONG THAY MAT!"
            color = (0, 60, 255)

        cv2.putText(frame, status, (275, h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
        if int(time.time() * 2) % 2 == 0:
            cv2.circle(frame, (w - 25, h - 30), 8, color, -1)
    else:
        cv2.putText(frame, "Giu phim de chup  |  S: stats  |  ESC: thoat",
                    (275, h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (110, 110, 110), 1)

    if last_saved:
        cv2.putText(frame, f"saved: {last_saved}", (275, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 190, 0), 1)

    return frame


def print_stats(counts):
    print("\n" + "=" * 48)
    print("  THONG KE DATASET")
    print("=" * 48)
    total = 0
    section = ""
    for class_name, count in counts.items():
        cur_section = class_name.split("/")[0]
        if cur_section != section:
            section = cur_section
            print(f"\n  [{section.upper()}]")
        bar = "█" * (count // 5) + "░" * max(0, (300 - count) // 30)
        label = class_name.split("/")[1]
        print(f"    {label:<20} {count:>4}/300  {bar}")
        total += count
    target = len(KEY_CLASS_MAP) * 300
    print("\n" + "-" * 48)
    print(f"  TONG: {total} / {target} anh  ({min(100, int(total/target*100))}%)")
    print("=" * 48 + "\n")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    global _cap, _face_mesh

    ensure_dirs()

    # ── Tìm và mở camera ──
    cap = find_and_open_camera()
    if cap is None:
        print("\n❌ Không tìm thấy webcam nào!")
        print("   Kiểm tra:")
        print("   1. Webcam đã cắm chưa?")
        print("   2. Zoom / Teams / OBS đang chiếm webcam? → Đóng lại")
        print("   3. Device Manager → Cameras có dấu chấm than không?")
        input("Nhấn Enter để thoát...")
        return

    _cap = cap  # Đăng ký vào global để atexit cleanup được

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Giảm buffer lag

    # ── MediaPipe ──
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )
    _face_mesh = face_mesh  # Đăng ký vào global để atexit cleanup được

    print("✅ Webcam OK! Đang mở cửa sổ...")
    print("   Phím 1-5: chụp khuôn mặt")
    print("   Phím 6-0: chụp tư thế ngồi")
    print("   M: bật/tắt mesh  |  S: thống kê  |  ESC: thoát\n")
    print_stats(count_images())

    last_capture_time = 0.0
    last_saved_name = ""
    counts = count_images()
    show_landmark = True
    fail_count = 0
    WINDOW_NAME = "Driver Data Collector"

    # Tạo cửa sổ trước để tránh lỗi trên một số OS
    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)

    try:
        while True:
            ret, frame = cap.read()

            # ── Xử lý mất frame ──
            if not ret or frame is None or frame.size == 0:
                fail_count += 1
                if fail_count % 5 == 0:
                    print(f"⚠ Frame lỗi liên tiếp ({fail_count}), chờ...")
                time.sleep(0.05)
                if fail_count >= 30:
                    print("❌ Mất kết nối webcam! Thoát.")
                    break
                # Pump event loop để cửa sổ không bị treo
                if cv2.waitKey(1) & 0xFF == 27:
                    break
                continue
            fail_count = 0

            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]

            # ── Đọc phím (1ms là đủ, không sleep thêm) ──
            key = cv2.waitKey(1) & 0xFF

            if key == 27:  # ESC
                break
            if key in (ord("s"), ord("S")):
                counts = count_images()
                print_stats(counts)
            if key in (ord("m"), ord("M")):
                show_landmark = not show_landmark

            # ── MediaPipe Face Mesh ──
            face_detected = False
            face_landmarks = None
            try:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                rgb.flags.writeable = False
                results = face_mesh.process(rgb)
                rgb.flags.writeable = True
                face_detected = results.multi_face_landmarks is not None
                if face_detected:
                    face_landmarks = results.multi_face_landmarks[0]
            except Exception as e:
                print(f"⚠ MediaPipe lỗi: {e}")

            if show_landmark and face_landmarks:
                draw_landmark_mesh(frame, face_landmarks)

            if face_landmarks:
                x1, y1, x2, y2 = get_face_bbox(face_landmarks, h, w)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 0), 2)
                cv2.putText(frame, "FACE", (x1, y1 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 0), 1)

            # ── Xử lý phím chụp ──
            active_class = None
            info = KEY_CLASS_MAP.get(key)

            if info:
                class_name, kind = info
                active_class = class_name
                now = time.time()

                if now - last_capture_time >= CAPTURE_INTERVAL:
                    should_save = True
                    save_img = None

                    if kind == "face":
                        if not face_landmarks:
                            print("⚠  Không detect được mặt, bỏ qua!")
                            should_save = False
                        else:
                            x1, y1, x2, y2 = get_face_bbox(face_landmarks, h, w)
                            crop = frame[y1:y2, x1:x2]
                            if crop.size == 0:
                                should_save = False
                            else:
                                save_img = cv2.resize(crop, FACE_IMG_SIZE)
                    else:
                        save_img = cv2.resize(frame, FULL_IMG_SIZE)

                    if should_save and save_img is not None:
                        try:
                            save_path = next_filename(class_name)
                            cv2.imwrite(str(save_path), save_img)
                            counts[class_name] = counts.get(class_name, 0) + 1
                            last_capture_time = now
                            last_saved_name = save_path.name
                            print(f"📸 [{class_name}] {save_path.name}  ({counts[class_name]}/300)")
                        except Exception as e:
                            print(f"❌ Lỗi lưu ảnh: {e}")

            # ── Vẽ UI và hiển thị ──
            try:
                display = draw_ui(frame, active_class, counts, last_saved_name,
                                  face_detected, show_landmark)
                cv2.imshow(WINDOW_NAME, display)
            except Exception as e:
                print(f"⚠ Lỗi hiển thị: {e}")

    finally:
        # Luôn được gọi dù thoát bình thường hay exception
        print("\n🔄 Đang giải phóng tài nguyên...")
        _cleanup()
        print("✅ Đã thoát!")
        print_stats(count_images())


if __name__ == "__main__":
    main()