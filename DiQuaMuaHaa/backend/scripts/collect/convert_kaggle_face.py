"""
convert_kaggle_face.py

Chuyển ảnh từ dataset Kaggle "open_closed_eyes_and_yawning_labelled"
→ landmark CSV cùng format với `collect_landmarks.py`.

Pipeline:
    ảnh (eyes open / eyes closed / yawning)
    → MediaPipe Face Mesh
    → vector 1434 số (478 landmark × 3 tọa độ x,y,z)
    → collect/data/landmarks.csv

Mặc định mapping class của dataset:
    0 → eyes closed  → drowsy
    1 → eyes open    → safe
    2 → yawning      → yawning

Yêu cầu:
    pip install mediapipe opencv-python

Cấu trúc thư mục mặc định (sau khi giải nén Kaggle):
    backend/driver_training/dataset/yawning/merged_dataset/
        train/images/*.jpg,*.png
        train/labels/*.txt  (YOLO format)
        val/images, val/labels
        test/images, test/labels

Cách dùng (từ thư mục backend):
    cd backend
    py -m driver_training.collect.convert_kaggle_face

Hoặc chỉ định root dataset khác:
    py -m driver_training.collect.convert_kaggle_face ^
        --dataset-root driver_training/dataset/yawning/merged_dataset
"""

from __future__ import annotations

import argparse
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
import csv
import numpy as np


try:
    from .paths import FACE_CSV_PATH
except ImportError:
    FACE_CSV_PATH = Path(__file__).parent / "data" / "landmarks.csv"

ROOT_DIR = Path(__file__).resolve().parent.parent  # .../driver_training
DEFAULT_DATASET_ROOT = ROOT_DIR / "dataset" / "yawning" / "merged_dataset"
CSV_PATH = FACE_CSV_PATH

# class_id (YOLO) → label dùng trong project hiện tại
CLASS_ID_TO_LABEL: Dict[int, str] = {
    0: "drowsy",   # eyes closed
    1: "safe",     # eyes open
    2: "yawning",  # yawning
}

# Giới hạn số mẫu mỗi class để file CSV không quá nặng (có thể chỉnh)
MAX_PER_CLASS = 2000


mp_face_mesh = mp.solutions.face_mesh


def iter_yolo_samples(dataset_root: Path) -> List[Tuple[Path, int]]:
    """
    Duyệt qua train/val/test, trả về list (image_path, class_id).
    Mỗi ảnh lấy class_id từ dòng đầu tiên trong file label tương ứng.
    """
    samples: List[Tuple[Path, int]] = []
    for split in ("train", "val", "test"):
        img_dir = dataset_root / split / "images"
        lbl_dir = dataset_root / split / "labels"
        if not img_dir.exists() or not lbl_dir.exists():
            continue

        for label_path in lbl_dir.glob("*.txt"):
            try:
                with label_path.open("r", encoding="utf-8") as f:
                    first_line = f.readline().strip()
            except OSError:
                continue

            if not first_line:
                continue

            parts = first_line.split()
            try:
                class_id = int(parts[0])
            except (ValueError, IndexError):
                continue

            stem = label_path.stem  # ví dụ: _0_jpg.rf.XXXX
            # Thử các phần mở rộng phổ biến
            img_path: Optional[Path] = None
            for ext in (".jpg", ".jpeg", ".png", ".bmp"):
                p = img_dir / f"{stem}{ext}"
                if p.exists():
                    img_path = p
                    break

            if img_path is None:
                continue

            samples.append((img_path, class_id))

    return samples


def image_to_landmarks_vector(face_mesh, img_bgr: np.ndarray) -> Optional[np.ndarray]:
    """Chạy MediaPipe Face Mesh trên ảnh BGR → vector 1434 (478×3) hoặc None nếu không thấy mặt."""
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


def build_csv_from_kaggle(
    dataset_root: Path,
    csv_path: Path = CSV_PATH,
    max_per_class: int = MAX_PER_CLASS,
) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    samples = iter_yolo_samples(dataset_root)
    if not samples:
        print(f"❌ Không tìm thấy ảnh/nhãn trong: {dataset_root}")
        return

    print(f"🔍 Tìm thấy {len(samples)} ảnh có nhãn YOLO trong {dataset_root}")

    # Khởi tạo MediaPipe Face Mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )

    counts: Dict[str, int] = {lbl: 0 for lbl in CLASS_ID_TO_LABEL.values()}
    skipped_no_face = 0
    skipped_unknown_class = 0

    # Ghi mới file CSV (overwrite)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        for idx, (img_path, class_id) in enumerate(samples, start=1):
            label = CLASS_ID_TO_LABEL.get(class_id)
            if label is None:
                skipped_unknown_class += 1
                continue

            if counts[label] >= max_per_class:
                continue

            img = cv2.imread(str(img_path))
            if img is None:
                continue

            vec = image_to_landmarks_vector(face_mesh, img)
            if vec is None:
                skipped_no_face += 1
                continue

            writer.writerow([label] + vec.tolist())
            counts[label] += 1

            if idx % 100 == 0:
                print(
                    f"  → Đã xử lý {idx}/{len(samples)} ảnh  |  "
                    f"drowsy={counts['drowsy']}  safe={counts['safe']}  yawning={counts['yawning']}",
                    flush=True,
                )

    face_mesh.close()

    total = sum(counts.values())
    print("\n✅ Hoàn tất convert Kaggle → landmarks.csv")
    print(f"  File CSV: {csv_path}")
    print(f"  Tổng mẫu: {total}")
    for lbl, c in counts.items():
        print(f"    {lbl:<8}: {c}")
    if skipped_no_face:
        print(f"  Bỏ qua {skipped_no_face} ảnh vì không detect được mặt.")
    if skipped_unknown_class:
        print(f"  Bỏ qua {skipped_unknown_class} nhãn YOLO không map được.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert Kaggle open/closed eyes + yawning YOLO dataset → landmarks.csv (MediaPipe Face Mesh)."
    )
    parser.add_argument(
        "--dataset-root",
        type=str,
        default=str(DEFAULT_DATASET_ROOT),
        help="Thư mục gốc merged_dataset (mặc định: driver_training/dataset/yawning/merged_dataset)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(CSV_PATH),
        help="Đường dẫn file landmarks.csv output.",
    )
    parser.add_argument(
        "--max-per-class",
        type=int,
        default=MAX_PER_CLASS,
        help="Giới hạn số mẫu tối đa mỗi class.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_root = Path(args.dataset_root).resolve()
    csv_out = Path(args.output).resolve()

    print(f"Dataset root: {dataset_root}")
    print(f"CSV output : {csv_out}")

    if not dataset_root.exists():
        print(f"❌ Không tồn tại thư mục dataset: {dataset_root}")
        return

    build_csv_from_kaggle(dataset_root, csv_out, max_per_class=args.max_per_class)


if __name__ == "__main__":
  main()

