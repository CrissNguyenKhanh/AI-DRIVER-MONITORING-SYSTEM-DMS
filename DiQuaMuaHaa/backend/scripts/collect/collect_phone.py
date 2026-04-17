"""
collect_phone.py

Thu thập HÌNH ẢNH có/không có điện thoại từ webcam
để train mô hình detect phone (YOLO, v.v).

Phím:
  1   → lưu batch ảnh "phone"     (bạn cầm / dùng điện thoại)
  2   → lưu batch ảnh "no_phone"  (không dùng điện thoại)
  S   → in thống kê
  ESC → thoát

FOMO overlay:
  - Bounding box bám vào vùng chuyển động (motion + contour)
  - Dot mesh landmark trải đều toàn frame
  - Corner box vàng + tọa độ + label badge + confidence bar
  - Eye FOMO ring ở trung tâm box + cặp mắt trang trí góc trên phải
  - Scan line động, REC dot nhấp nháy khi đang ghi
"""

import argparse
import os
import time
from pathlib import Path

import cv2
import numpy as np

# ─── Paths ───────────────────────────────────────────────────────────────────
ROOT_DIR     = Path(__file__).resolve().parents[2]
DATASET_ROOT = ROOT_DIR / "dataset" / "phone-using"
PHONE_DIR    = DATASET_ROOT / "phone"
NO_PHONE_DIR = DATASET_ROOT / "no_phone"
for d in (PHONE_DIR, NO_PHONE_DIR):
    d.mkdir(parents=True, exist_ok=True)

BATCH_SIZE = 20
KEY_MAP = {
    ord("1"): ("phone",    PHONE_DIR),
    ord("2"): ("no_phone", NO_PHONE_DIR),
}

# ─── FOMO tuning ─────────────────────────────────────────────────────────────
GRID_COLS  = 28
GRID_ROWS  = 20
DOT_R      = 2
MIN_AREA   = 2000   # px² minimum contour
MAX_BOXES  = 2      # top-N regions


# ─── Dataset helpers ─────────────────────────────────────────────────────────
def count_images():
    def _cnt(p):
        if not p.exists():
            return 0
        return len([f for f in p.iterdir()
                    if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png"}])
    return {"phone": _cnt(PHONE_DIR), "no_phone": _cnt(NO_PHONE_DIR)}


def print_stats():
    counts = count_images()
    print("\n========== PHONE IMAGE DATASET ==========")
    for k, v in counts.items():
        print(f"  {k:<10}: {v:4d} anh")
    print("=========================================\n")


def save_frame(label, folder, frame, idx):
    ts   = int(time.time() * 1000)
    path = folder / f"{label}_{ts}_{idx:04d}.jpg"
    cv2.imwrite(str(path), frame)


# ─── Motion detector ─────────────────────────────────────────────────────────
class MotionDetector:
    def __init__(self):
        self._bg = cv2.createBackgroundSubtractorMOG2(
            history=120, varThreshold=40, detectShadows=False)

    def detect_boxes(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mask = self._bg.apply(gray)
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kern, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kern, iterations=1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes = []
        for c in contours:
            area = cv2.contourArea(c)
            if area < MIN_AREA:
                continue
            x, y, bw, bh = cv2.boundingRect(c)
            ar = bh / (bw + 1e-5)
            if 0.3 < ar < 5.0:
                boxes.append((x, y, bw, bh, area))
        boxes.sort(key=lambda b: -b[4])
        return [b[:4] for b in boxes[:MAX_BOXES]]


# ─── Draw helpers ────────────────────────────────────────────────────────────
def draw_dot_mesh(canvas, h, w, color, alpha=0.22):
    overlay = canvas.copy()
    sx = w // GRID_COLS
    sy = h // GRID_ROWS
    for row in range(GRID_ROWS + 1):
        for col in range(GRID_COLS + 1):
            cx = col * sx
            cy = row * sy
            jx = int(np.sin(row * 3.7 + col * 1.2) * 3)
            jy = int(np.cos(col * 2.9 + row * 1.8) * 3)
            px = min(w - 1, max(0, cx + jx))
            py = min(h - 1, max(0, cy + jy))
            cv2.circle(overlay, (px, py), DOT_R, color, -1)
    cv2.addWeighted(overlay, alpha, canvas, 1 - alpha, 0, canvas)


def draw_scan_line(canvas, frame_idx, h, w, color):
    y = int((frame_idx * 3) % h)
    ov = canvas.copy()
    cv2.line(ov, (0, y), (w, y), color, 1)
    cv2.addWeighted(ov, 0.2, canvas, 0.8, 0, canvas)


def draw_corner_box(canvas, x, y, bw, bh, color, thickness=2, cs=22):
    pts = [
        ((x,      y),      ( 1,  1)),
        ((x + bw, y),      (-1,  1)),
        ((x,      y + bh), ( 1, -1)),
        ((x + bw, y + bh), (-1, -1)),
    ]
    for (cx, cy), (dx, dy) in pts:
        cv2.line(canvas, (cx, cy), (cx + dx * cs, cy), color, thickness)
        cv2.line(canvas, (cx, cy), (cx, cy + dy * cs), color, thickness)


def draw_conf_bar(canvas, x, y, value, label, color, bar_w=64, bar_h=6):
    fill = int(np.clip(value, 0, 1) * bar_w)
    cv2.rectangle(canvas, (x, y), (x + bar_w, y + bar_h), (25, 25, 25), -1)
    cv2.rectangle(canvas, (x, y), (x + fill,  y + bar_h), color, -1)
    cv2.putText(canvas, f"{label} {value:.2f}",
                (x, y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)


def draw_eye_fomo(canvas, cx, cy, r, color, blink=False):
    """Iris-tracker style eye ring."""
    if r < 4:
        return
    # outer ring
    cv2.circle(canvas, (cx, cy), int(r * 1.55), color, 1)
    # iris
    cv2.circle(canvas, (cx, cy), r, color, 1)
    # pupil
    cv2.circle(canvas, (cx, cy), max(2, int(r * 0.38)), (0, 0, 0), -1)
    # highlight
    cv2.circle(canvas,
               (cx - max(1, int(r * 0.2)), cy - max(1, int(r * 0.25))),
               max(1, int(r * 0.12)), (255, 255, 255), -1)
    # spokes
    for i in range(8):
        a  = i / 8 * 2 * np.pi
        x1 = int(cx + np.cos(a) * r * 0.45)
        y1 = int(cy + np.sin(a) * r * 0.45)
        x2 = int(cx + np.cos(a) * r * 0.90)
        y2 = int(cy + np.sin(a) * r * 0.90)
        cv2.line(canvas, (x1, y1), (x2, y2), color, 1)
    if blink:
        cv2.putText(canvas, "BLINK",
                    (cx - 14, cy + r + 11),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 200, 60), 1)


def dark_strip(canvas, x1, y1, x2, y2, alpha=0.55):
    ov = canvas.copy()
    cv2.rectangle(ov, (x1, y1), (x2, y2), (0, 0, 0), -1)
    cv2.addWeighted(ov, alpha, canvas, 1 - alpha, 0, canvas)


# ─── Main ────────────────────────────────────────────────────────────────────
def main(camera_index: int = 0):
    print(f"Mo webcam index {camera_index} ...")
    cap = (cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
           if os.name == "nt" else cv2.VideoCapture(camera_index))
    if not cap.isOpened():
        print(f"Khong mo duoc camera index={camera_index}")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("San sang!")
    print("  1 = ghi batch anh co DIEN THOAI (phone)")
    print("  2 = ghi batch anh KHONG dien thoai (no_phone)")
    print("  S = xem thong ke,  ESC = thoat\n")
    print_stats()

    detector       = MotionDetector()
    current_label  = None
    current_folder = None
    batch_left     = 0
    frame_idx      = 0
    fps_time       = time.time()
    fps            = 0.0
    fps_count      = 0
    blink_timer    = 0
    blink_state    = False
    cached_counts  = count_images()
    count_refresh  = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            time.sleep(0.02)
            continue

        frame     = cv2.flip(frame, 1)
        h, w      = frame.shape[:2]
        frame_idx += 1

        # FPS
        fps_count += 1
        now = time.time()
        if now - fps_time >= 1.0:
            fps       = fps_count / (now - fps_time)
            fps_count = 0
            fps_time  = now

        # Blink simulation (decorative)
        blink_timer += 1
        if blink_timer > 90 + int(np.random.rand() * 50):
            blink_state = True
            blink_timer = 0
        if blink_state and blink_timer > 5:
            blink_state = False

        # Refresh count every 30 frames
        count_refresh += 1
        if count_refresh >= 30:
            cached_counts = count_images()
            count_refresh = 0

        # Detect moving regions
        boxes = detector.detect_boxes(frame)

        # ── Color scheme ──────────────────────────────────────────
        if current_label == "phone" and batch_left > 0:
            mesh_color   = (0, 220, 255)
            box_color    = (0, 220, 255)
            mode_str     = f"REC PHONE  {BATCH_SIZE - batch_left + 1}/{BATCH_SIZE}"
        elif current_label == "no_phone" and batch_left > 0:
            mesh_color   = (100, 100, 255)
            box_color    = (100, 100, 255)
            mode_str     = f"REC NO_PHONE  {BATCH_SIZE - batch_left + 1}/{BATCH_SIZE}"
        else:
            mesh_color   = (0, 200, 200)
            box_color    = (0, 200, 200)
            mode_str     = "STANDBY"

        display = frame.copy()

        # ── 1. Dot mesh ───────────────────────────────────────────
        draw_dot_mesh(display, h, w, mesh_color, alpha=0.18)

        # ── 2. Scan line ──────────────────────────────────────────
        draw_scan_line(display, frame_idx, h, w, mesh_color)

        # ── 3. Detection boxes ────────────────────────────────────
        for bx, by, bw2, bh2 in boxes:
            pad = 12
            rx  = max(0, bx - pad)
            ry  = max(0, by - pad)
            rw  = min(w - rx, bw2 + pad * 2)
            rh  = min(h - ry, bh2 + pad * 2)

            # Subtle fill
            ov = display.copy()
            cv2.rectangle(ov, (rx, ry), (rx + rw, ry + rh), box_color, -1)
            cv2.addWeighted(ov, 0.06, display, 0.94, 0, display)

            # Corner box
            draw_corner_box(display, rx, ry, rw, rh, box_color, thickness=2)

            # Coordinates
            c1 = f"{rx / w * 100:.1f}"
            c2 = f"{(rx + rw) / w * 100:.1f}"
            cv2.putText(display, c1,
                        (rx - 2, ry - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, box_color, 1)
            cv2.putText(display, c2,
                        (rx + rw - 28, ry - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, box_color, 1)

            # Label badge
            badge = "PHONE?" if current_label == "phone" else "MOTION"
            (tw, th2), _ = cv2.getTextSize(badge, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
            cv2.rectangle(display,
                          (rx, ry - th2 - 7),
                          (rx + tw + 8, ry),
                          box_color, -1)
            cv2.putText(display, badge,
                        (rx + 4, ry - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 0, 0), 1)

            # Confidence bar
            conf  = min(1.0, rw * rh / (w * h * 0.18))
            bar_y = ry + rh + 14
            if bar_y + 10 < h:
                draw_conf_bar(display, rx + 4, bar_y, conf, "CONF", box_color)

            # Eye FOMO ring at box centre
            ecx = rx + rw // 2
            ecy = ry + rh // 2
            er  = min(rw, rh) // 6
            draw_eye_fomo(display, ecx, ecy, er, box_color, blink=blink_state)

        # ── 4. HUD top-left ───────────────────────────────────────
        hud_lines = [
            f"FPS    : {fps:.0f}",
            f"Boxes  : {len(boxes)}",
            f"Mode   : {current_label or 'standby'}",
            f"Phone  : {cached_counts['phone']:4d}",
            f"No_ph  : {cached_counts['no_phone']:4d}",
        ]
        hud_h = len(hud_lines) * 20 + 12
        dark_strip(display, 0, 0, 180, hud_h, alpha=0.6)
        for i, line in enumerate(hud_lines):
            cv2.putText(display, line,
                        (8, 20 + i * 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, mesh_color, 1)

        # ── 5. Decorative eye pair top-right ─────────────────────
        dark_strip(display, w - 150, 0, w, 72, alpha=0.5)
        for ex, side in [(w - 110, "L"), (w - 50, "R")]:
            draw_eye_fomo(display, ex, 36, 18, mesh_color, blink=blink_state)
            cv2.putText(display, side,
                        (ex - 4, 62),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.34, mesh_color, 1)

        # ── 6. Bottom status bar ──────────────────────────────────
        dark_strip(display, 0, h - 52, w, h, alpha=0.65)
        cv2.putText(display,
                    "PHONE COLLECTOR  |  1:phone  2:no_phone  S:stats  ESC:exit",
                    (10, h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 200, 180), 1)
        cv2.putText(display, mode_str,
                    (10, h - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, mesh_color, 2)

        # REC blink dot
        if current_label and batch_left > 0:
            dot_col = (0, 0, 255) if (frame_idx // 10) % 2 == 0 else (20, 20, 20)
            cv2.circle(display, (w - 20, h - 20), 8, dot_col, -1)
            cv2.circle(display, (w - 20, h - 20), 8, (255, 80, 80), 1)

        # ── Key handling ──────────────────────────────────────────
        key = cv2.waitKey(1) & 0xFF
        if key == 27:
            break
        if key in (ord("s"), ord("S")):
            print_stats()

        mapping = KEY_MAP.get(key)
        if mapping is not None:
            current_label, current_folder = mapping
            batch_left = BATCH_SIZE
            print(f"\nBat dau ghi {BATCH_SIZE} anh cho class '{current_label}' ...")

        # ── Batch capture ─────────────────────────────────────────
        if current_label and current_folder is not None and batch_left > 0:
            save_frame(current_label, current_folder, frame, batch_left)
            batch_left -= 1
            if batch_left == 0:
                print(f"Hoan thanh batch cho '{current_label}'.")
                print_stats()
                current_label  = None
                current_folder = None

        cv2.imshow("collect_phone  |  1:phone  2:no_phone  ESC:exit", display)

    cap.release()
    cv2.destroyAllWindows()
    print("\nThoat collect_phone.")
    print_stats()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Thu thap anh co/khong dien thoai tu webcam voi FOMO overlay.")
    parser.add_argument("--camera", type=int, default=0,
                        help="Index camera (mac dinh 0)")
    args = parser.parse_args()
    main(camera_index=args.camera)