from __future__ import annotations

"""
build_phone_yolo_dataset.py

Tạo nhanh dataset YOLO để detect ĐIỆN THOẠI
từ ảnh bạn đã thu bằng collect_phone.py.

Giả định:
  - Tất cả ảnh trong:
        backend/dataset/phone-using/phone/
    đều là ảnh đang dùng điện thoại.

Script này sẽ:
  - Copy ảnh sang:
        backend/dataset/phone-yolo/images/train/
        backend/dataset/phone-yolo/images/val/
  - Tạo file nhãn YOLO tương ứng:
        backend/dataset/phone-yolo/labels/train/*.txt
        backend/dataset/phone-yolo/labels/val/*.txt
    với bbox FULL FRAME:
        class_id cx cy w h  =  0 0.5 0.5 1.0 1.0

Lưu ý: bbox full-frame không chính xác vị trí điện thoại,
nhưng đủ để YOLO bắt đầu học “frame có điện thoại”.
Sau này nếu cần chính xác hơn, bạn có thể chỉnh lại nhãn bằng labelImg.

Chạy (từ thư mục backend):
  python -m driver_training.collect.build_phone_yolo_dataset
"""

import argparse
import shutil
import random
from pathlib import Path
from typing import List, Tuple


ROOT_DIR = Path(__file__).resolve().parents[2]  # .../backend

SRC_PHONE_DIR = ROOT_DIR / "dataset" / "phone-using" / "phone"
YOLO_ROOT = ROOT_DIR / "dataset" / "phone-yolo"
YOLO_IMG_TRAIN = YOLO_ROOT / "images" / "train"
YOLO_IMG_VAL = YOLO_ROOT / "images" / "val"
YOLO_LAB_TRAIN = YOLO_ROOT / "labels" / "train"
YOLO_LAB_VAL = YOLO_ROOT / "labels" / "val"

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}


def collect_images(src_dir: Path) -> List[Path]:
    return sorted(
        [p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS]
    )


def split_train_val(
    files: List[Path],
    val_ratio: float = 0.15,
    seed: int = 42,
) -> Tuple[List[Path], List[Path]]:
    rng = random.Random(seed)
    files_shuffled = files[:]
    rng.shuffle(files_shuffled)
    n_total = len(files_shuffled)
    n_val = max(1, int(n_total * val_ratio)) if n_total > 1 else 0
    val_files = files_shuffled[:n_val]
    train_files = files_shuffled[n_val:]
    return train_files, val_files


def ensure_dirs() -> None:
    for d in [YOLO_IMG_TRAIN, YOLO_IMG_VAL, YOLO_LAB_TRAIN, YOLO_LAB_VAL]:
        d.mkdir(parents=True, exist_ok=True)


def write_full_frame_label(label_path: Path, class_id: int = 0) -> None:
    """
    Ghi nhãn YOLO bbox full-frame:
      class_id cx cy w h = 0 0.5 0.5 1.0 1.0
    """
    label_path.write_text(f"{class_id} 0.5 0.5 1.0 1.0\n", encoding="utf-8")


def build_dataset(val_ratio: float = 0.15) -> None:
    if not SRC_PHONE_DIR.exists():
        raise FileNotFoundError(
            f"Không tìm thấy thư mục nguồn ảnh phone-using: {SRC_PHONE_DIR}"
        )

    files = collect_images(SRC_PHONE_DIR)
    if not files:
        raise FileNotFoundError(
            f"Không tìm thấy ảnh nào trong {SRC_PHONE_DIR}. Hãy chạy collect_phone.py trước."
        )

    ensure_dirs()

    train_files, val_files = split_train_val(files, val_ratio=val_ratio)

    print(f"📷 Tổng ảnh nguồn: {len(files)}")
    print(f"   → Train: {len(train_files)}  |  Val: {len(val_files)}")
    print(f"YOLO root: {YOLO_ROOT}")

    # Copy & gán nhãn train
    for img_path in train_files:
        dst_img = YOLO_IMG_TRAIN / img_path.name
        dst_lab = YOLO_LAB_TRAIN / (img_path.stem + ".txt")
        shutil.copy2(img_path, dst_img)
        write_full_frame_label(dst_lab, class_id=0)

    # Copy & gán nhãn val
    for img_path in val_files:
        dst_img = YOLO_IMG_VAL / img_path.name
        dst_lab = YOLO_LAB_VAL / (img_path.stem + ".txt")
        shutil.copy2(img_path, dst_img)
        write_full_frame_label(dst_lab, class_id=0)

    print("\n✅ Đã build xong YOLO dataset cho phone:")
    print(f"  - Ảnh train : {YOLO_IMG_TRAIN}")
    print(f"  - Nhãn train: {YOLO_LAB_TRAIN}")
    print(f"  - Ảnh val   : {YOLO_IMG_VAL}")
    print(f"  - Nhãn val  : {YOLO_LAB_VAL}")
    print("  (Tất cả bbox đang là FULL FRAME: class 0 = 'phone')")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Build YOLO dataset detect phone từ dataset/phone-using/phone."
    )
    p.add_argument(
        "--val-ratio",
        type=float,
        default=0.15,
        help="Tỉ lệ ảnh dùng cho validation (default: 0.15).",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    build_dataset(val_ratio=args.val_ratio)


if __name__ == "__main__":
    main()

