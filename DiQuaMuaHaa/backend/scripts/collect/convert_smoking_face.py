from __future__ import annotations

"""
convert_smoking_face.py

Chuyển YOLO dataset hút thuốc:
    backend/dataset/train-smoking
    backend/dataset/valid-smoking

→ landmark CSV dùng MediaPipe FaceMesh, format:
    label, x1, y1, z1, x2, y2, z2, ..., x478, y478, z478

Tất cả mẫu đều gán nhãn: "smoking".
"""

import argparse
import csv
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

os.environ["GLOG_minloglevel"] = "3"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# Tắt log mediapipe khi import
_stderr = sys.stderr
sys.stderr = open(os.devnull, "w")
import mediapipe as mp  # type: ignore
sys.stderr = _stderr

import cv2  # type: ignore
import numpy as np

# ======================================================================
# ĐƯỜNG DẪN MẶC ĐỊNH
# ======================================================================

ROOT_DIR = Path(__file__).resolve().parents[2]  # .../backend
DEFAULT_TRAIN_ROOT = ROOT_DIR / "dataset" / "train-smoking"
DEFAULT_VALID_ROOT = ROOT_DIR / "dataset" / "valid-smoking"

# CSV output chung cho cả train + valid
DEFAULT_CSV_OUT = (
    ROOT_DIR / "driver_training" / "collect" / "data" / "smoking_landmarks.csv"
)

# Chỉ có 1 nhãn duy nhất
SMOKING_LABEL = "smoking"

mp_face_mesh = mp.solutions.face_mesh


# ======================================================================
# HELPER: duyệt YOLO dataset
# ======================================================================

def iter_yolo_samples(split_root: Path) -> List[Tuple[Path, bool]]:
    """
    Duyệt qua thư mục split (train-smoking hoặc valid-smoking).

    Mặc định cấu trúc:
        split_root/
            images/*.jpg, *.png
            labels/*.txt  (YOLO format)

    Trả về list (image_path, has_object)

    - Nếu file label có ít nhất 1 dòng → has_object=True (có người hút thuốc)
    - Nếu rỗng → bỏ qua
    """
    img_dir = split_root / "images"
    lbl_dir = split_root / "labels"

    if not img_dir.exists() or not lbl_dir.exists():
        print(f"⚠ Bỏ qua {split_root} vì không có images/ hoặc labels/")
        return []

    samples: List[Tuple[Path, bool]] = []

    for label_path in sorted(lbl_dir.glob("*.txt")):
        try:
            with label_path.open("r", encoding="utf-8") as f:
                content = [ln.strip() for ln in f.readlines() if ln.strip()]
        except OSError:
            continue

        if not content:
            # Không có bbox → không có người hút thuốc
            continue

        # Tên file ảnh giống tên file label (khác mỗi phần mở rộng)
        stem = label_path.stem
        img_path: Optional[Path] = None
        for ext in (".jpg", ".jpeg", ".png", ".bmp"):
            p = img_dir / f"{stem}{ext}"
            if p.exists():
                img_path = p
                break

        if img_path is None:
            # Không tìm được ảnh tương ứng → bỏ qua
            continue

        samples.append((img_path, True))

    return samples


# ======================================================================
# HELPER: ảnh → vector landmark
# ======================================================================

def image_to_landmarks_vector(face_mesh, img_bgr: np.ndarray) -> Optional[np.ndarray]:
    """
    Chạy MediaPipe Face Mesh trên ảnh BGR → vector 1434 (478×3)
    hoặc None nếu không thấy mặt.
    """
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_rgb.flags.writeable = False
    res = face_mesh.process(img_rgb)
    img_rgb.flags.writeable = True

    if not res.multi_face_landmarks:
        return None

    lms = res.multi_face_landmarks[0]
    coords: List[float] = []
    for lm in lms.landmark:
        coords.extend([lm.x, lm.y, lm.z])
    return np.asarray(coords, dtype=np.float32)


# ======================================================================
# MAIN: build CSV
# ======================================================================

def build_smoking_csv(
    train_root: Path,
    valid_root: Path,
    csv_out: Path,
    max_per_class: Optional[int] = None,
) -> None:
    csv_out.parent.mkdir(parents=True, exist_ok=True)

    train_samples = iter_yolo_samples(train_root)
    valid_samples = iter_yolo_samples(valid_root)

    all_samples: List[Tuple[Path, str]] = []
    for img_path, _ in train_samples:
        all_samples.append((img_path, "train"))
    for img_path, _ in valid_samples:
        all_samples.append((img_path, "valid"))

    if not all_samples:
        print(f"❌ Không tìm thấy ảnh/nhãn smoking trong: {train_root} hoặc {valid_root}")
        return

    print(f"🔍 Tìm thấy {len(all_samples)} ảnh có nhãn hút thuốc (train+valid).")

    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )

    counts: Dict[str, int] = {SMOKING_LABEL: 0}
    skipped_no_face = 0

    with csv_out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        for idx, (img_path, split) in enumerate(all_samples, start=1):
            if max_per_class is not None and counts[SMOKING_LABEL] >= max_per_class:
                break

            img = cv2.imread(str(img_path))
            if img is None:
                continue

            vec = image_to_landmarks_vector(face_mesh, img)
            if vec is None:
                skipped_no_face += 1
                continue

            writer.writerow([SMOKING_LABEL] + vec.tolist())
            counts[SMOKING_LABEL] += 1

            if idx % 50 == 0:
                print(
                    f"  → {idx}/{len(all_samples)} ảnh  |  smoking={counts[SMOKING_LABEL]}",
                    flush=True,
                )

    face_mesh.close()

    total = sum(counts.values())
    print("\n✅ Hoàn tất convert smoking → smoking_landmarks.csv")
    print(f"  CSV: {csv_out}")
    print(f"  Tổng mẫu: {total}")
    for lbl, c in counts.items():
        print(f"    {lbl:<10}: {c}")
    if skipped_no_face:
        print(f"  Bỏ qua {skipped_no_face} ảnh vì không detect được mặt.")


# ======================================================================
# CLI
# ======================================================================

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Convert YOLO smoking dataset (train/valid) → landmark CSV (MediaPipe FaceMesh)."
    )
    p.add_argument(
        "--train-root",
        type=str,
        default=str(DEFAULT_TRAIN_ROOT),
        help="Thư mục train-smoking (chứa images/ và labels/).",
    )
    p.add_argument(
        "--valid-root",
        type=str,
        default=str(DEFAULT_VALID_ROOT),
        help="Thư mục valid-smoking (chứa images/ và labels/).",
    )
    p.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_CSV_OUT),
        help="Đường dẫn file CSV output.",
    )
    p.add_argument(
        "--max-per-class",
        type=int,
        default=None,
        help="Giới hạn số mẫu tối đa (None = không giới hạn).",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    train_root = Path(args.train_root).resolve()
    valid_root = Path(args.valid_root).resolve()
    csv_out = Path(args.output).resolve()

    print(f"Train root : {train_root}")
    print(f"Valid root : {valid_root}")
    print(f"CSV output : {csv_out}")

    build_smoking_csv(train_root, valid_root, csv_out, max_per_class=args.max_per_class)


if __name__ == "__main__":
    main()