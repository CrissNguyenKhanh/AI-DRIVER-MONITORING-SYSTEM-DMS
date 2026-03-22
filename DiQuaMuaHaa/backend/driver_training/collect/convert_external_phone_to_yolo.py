"""
convert_external_phone_to_yolo.py

Chuyển dataset phone từ Kaggle / Roboflow (đã tải và giải nén)
về đúng cấu trúc backend/dataset/phone-yolo để train_phone_yolo chạy.

Cách dùng (từ thư mục backend):

  python -m driver_training.collect.convert_external_phone_to_yolo --source "C:/Users/.../phone-detection-yolo-from-roboflow"
  python -m driver_training.collect.convert_external_phone_to_yolo --source "D:/Downloads/cellphone_dataset" --output dataset/phone-yolo

Các cấu trúc nguồn được hỗ trợ (tự detect):
  - .../train/images/, .../train/labels/, .../valid/images/, .../valid/labels/
  - .../images/train/, .../labels/train/, .../images/val/, .../labels/val/
  - .../train/images/, .../train/labels/, .../val/images/, .../val/labels/
  - .../data/train/images/, .../data/train/labels/ (và valid nếu có)
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT_DIR / "dataset" / "phone-yolo"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}


def find_train_val_dirs(source: Path) -> Tuple[Optional[Path], Optional[Path], Optional[Path], Optional[Path]]:
    """Trả về (train_images, train_labels, val_images, val_labels)."""
    source = source.resolve()
    # Roboflow / Kaggle thường: train/images, train/labels, valid/images, valid/labels
    for train_name, val_name in [("train", "valid"), ("train", "val"), ("train", "validation")]:
        ti = source / train_name / "images"
        tl = source / train_name / "labels"
        vi = source / val_name / "images"
        vl = source / val_name / "labels"
        if ti.exists() and tl.exists():
            return (ti, tl, vi if vi.exists() else None, vl if vl.exists() else None)
    # Hoặc images/train, labels/train
    ti = source / "images" / "train"
    tl = source / "labels" / "train"
    if ti.exists() and tl.exists():
        vi = source / "images" / "valid"
        if not vi.exists():
            vi = source / "images" / "val"
        vl = source / "labels" / "valid"
        if not vl.exists():
            vl = source / "labels" / "val"
        return (ti, tl, vi if vi.exists() else None, vl if vl.exists() else None)
    # data/train
    ti = source / "data" / "train" / "images"
    tl = source / "data" / "train" / "labels"
    if ti.exists() and tl.exists():
        vi = source / "data" / "valid" / "images"
        vl = source / "data" / "valid" / "labels"
        return (ti, tl, vi if vi.exists() else None, vl if vl.exists() else None)
    return (None, None, None, None)


def list_images(folder: Path) -> List[Path]:
    return [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS]


def normalize_label_file(src_label: Path, dst_label: Path, target_class: int = 0) -> None:
    """
    Đọc file YOLO label, chuẩn hóa class id về target_class (0 = phone), ghi ra dst_label.
    """
    if not src_label.exists():
        return
    lines = []
    for line in src_label.read_text(encoding="utf-8").strip().splitlines():
        parts = line.split()
        if len(parts) >= 5:
            try:
                cx, cy, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                lines.append(f"{target_class} {cx} {cy} {w} {h}")
            except ValueError:
                continue
    if lines:
        dst_label.parent.mkdir(parents=True, exist_ok=True)
        dst_label.write_text("\n".join(lines) + "\n", encoding="utf-8")


def copy_split(
    src_images: Path,
    src_labels: Path,
    dst_images: Path,
    dst_labels: Path,
    target_class: int = 0,
) -> int:
    count = 0
    for img_path in list_images(src_images):
        stem = img_path.stem
        dst_img = dst_images / img_path.name
        dst_images.mkdir(parents=True, exist_ok=True)
        shutil.copy2(img_path, dst_img)
        # Tìm file label cùng tên (có thể .txt hoặc trong thư mục labels)
        for ext in (".txt",):
            src_label = src_labels / (stem + ext)
            if src_label.exists():
                dst_label = dst_labels / (stem + ext)
                normalize_label_file(src_label, dst_label, target_class)
                count += 1
                break
    return count


def main() -> None:
    ap = argparse.ArgumentParser(description="Chuyển dataset phone (Kaggle/Roboflow) sang phone-yolo.")
    ap.add_argument("--source", type=str, required=True, help="Thư mục đã giải nén (chứa train/valid hoặc images/train, ...)")
    ap.add_argument("--output", type=str, default=str(DEFAULT_OUT), help="Thư mục phone-yolo đích")
    ap.add_argument("--class-id", type=int, default=0, help="Class id cho phone (default: 0)")
    args = ap.parse_args()

    source = Path(args.source).resolve()
    out = Path(args.output).resolve()

    if not source.exists():
        raise SystemExit(f"Không tìm thấy thư mục nguồn: {source}")

    train_img, train_lb, val_img, val_lb = find_train_val_dirs(source)
    if train_img is None or train_lb is None:
        raise SystemExit(
            f"Không nhận diện được cấu trúc YOLO trong {source}. "
            "Cần có train/images và train/labels (hoặc images/train, labels/train)."
        )

    out_train_img = out / "images" / "train"
    out_train_lb = out / "labels" / "train"
    out_val_img = out / "images" / "val"
    out_val_lb = out / "labels" / "val"

    n_train = copy_split(train_img, train_lb, out_train_img, out_train_lb, args.class_id)
    print(f"Train: {n_train} ảnh + labels → {out_train_img}")

    if val_img and val_lb:
        n_val = copy_split(val_img, val_lb, out_val_img, out_val_lb, args.class_id)
        print(f"Val:   {n_val} ảnh + labels → {out_val_img}")
    else:
        print("Val:   (không có) bỏ qua")

    print(f"\n✅ Đã chuyển xong. Train YOLO: py -m driver_training.train.train_phone_yolo")


if __name__ == "__main__":
    main()
