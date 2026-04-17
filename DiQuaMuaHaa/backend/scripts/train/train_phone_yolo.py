"""
train_phone_yolo.py

Train YOLO model detect điện thoại (object detection) từ dataset đã gán bbox.

Yêu cầu:
  pip install ultralytics

Dataset (gợi ý cấu trúc YOLO):
  backend/dataset/phone-yolo/
    images/train/*.jpg
    images/val/*.jpg
    labels/train/*.txt
    labels/val/*.txt

Mỗi .txt là file YOLO format:
  class_id cx cy w h
với toạ độ chuẩn hoá [0,1]. Ví dụ chỉ có 1 class "phone" → class_id = 0.

Script này sẽ:
  - Tạo file data YAML tạm thời (phone_yolo.yaml) trỏ đến dataset trên.
  - Train YOLO và lưu weights vào:
      backend/driver_training/models/phone_yolo.pt

Chạy (từ thư mục backend):
  python -m driver_training.train.train_phone_yolo
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO  # type: ignore


ROOT_DIR = Path(__file__).resolve().parent.parent  # .../backend/driver_training
BACKEND_DIR = ROOT_DIR.parent

DEFAULT_DATASET_DIR = BACKEND_DIR / "dataset" / "phone-yolo"
DEFAULT_MODEL_OUT = ROOT_DIR / "models" / "phone_yolo.pt"
DEFAULT_YAML_PATH = ROOT_DIR / "dataset" / "phone_yolo.yaml"


def ensure_yaml(
    yaml_path: Path,
    dataset_dir: Path,
    nc: int = 1,
    class_names: list[str] | None = None,
) -> Path:
    """
    Tạo file YAML cho YOLO nếu chưa tồn tại.
    """
    yaml_path.parent.mkdir(parents=True, exist_ok=True)
    class_names = class_names or ["phone"]

    train_images = dataset_dir / "images" / "train"
    val_images = dataset_dir / "images" / "val"

    content = [
        f"path: {dataset_dir.as_posix()}",
        f"train: images/train",
        f"val: images/val",
        "",
        f"nc: {nc}",
        "names:",
    ]
    for idx, name in enumerate(class_names):
        content.append(f"  {idx}: {name}")

    yaml_path.write_text("\n".join(content), encoding="utf-8")
    return yaml_path


def train_phone_yolo(
    dataset_dir: Path | str = DEFAULT_DATASET_DIR,
    model_out: Path | str = DEFAULT_MODEL_OUT,
    yaml_path: Path | str = DEFAULT_YAML_PATH,
    epochs: int = 50,
    imgsz: int = 640,
) -> None:
    dataset_dir = Path(dataset_dir)
    model_out = Path(model_out)
    yaml_path = Path(yaml_path)

    print(f"📂 YOLO dataset dir: {dataset_dir}")
    print(f"📄 YAML config     : {yaml_path}")
    print(f"💾 Model output    : {model_out}")

    if not dataset_dir.exists():
        raise FileNotFoundError(
            f"Không tìm thấy thư mục dataset YOLO: {dataset_dir}\n"
            f"Hãy tổ chức dataset theo cấu trúc YOLO (images/train, images/val, labels/train, labels/val)."
        )

    yaml_path = ensure_yaml(yaml_path, dataset_dir, nc=1, class_names=["phone"])

    # Dùng YOLOv8n (nhẹ) cho realtime
    print("🚀 Bắt đầu train YOLO (yolov8n) detect phone...")
    model = YOLO("yolov8n.pt")  # type: ignore[arg-type]
    results = model.train(
        data=str(yaml_path),
        epochs=epochs,
        imgsz=imgsz,
        project=str(ROOT_DIR / "runs" / "detect"),
        name="phone_yolo",
        exist_ok=True,
    )

    # Lấy best weights (Ultralytics có thể trả path qua results.best hoặc chỉ lưu dưới runs/)
    best: Path | None = None
    if results is not None and hasattr(results, "best") and results.best:  # type: ignore[attr-defined]
        cand = Path(str(results.best))  # type: ignore[attr-defined]
        if cand.exists():
            best = cand
    if best is None:
        fallback = ROOT_DIR / "runs" / "detect" / "phone_yolo" / "weights" / "best.pt"
        if fallback.exists():
            best = fallback
    if best is None or not best.exists():
        print("⚠ Không tìm thấy best.pt trong results, hãy kiểm tra thư mục runs/detect/phone_yolo.")
        return

    model_out.parent.mkdir(parents=True, exist_ok=True)
    model_out.write_bytes(best.read_bytes())
    print(f"✅ Đã copy best weights sang: {model_out}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train YOLO detect điện thoại từ dataset YOLO.")
    p.add_argument(
        "--data-dir",
        type=str,
        default=str(DEFAULT_DATASET_DIR),
        help="Thư mục dataset YOLO (chứa images/, labels/).",
    )
    p.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_MODEL_OUT),
        help="Đường dẫn file phone_yolo.pt output.",
    )
    p.add_argument(
        "--yaml",
        type=str,
        default=str(DEFAULT_YAML_PATH),
        help="Đường dẫn file YAML config cho YOLO.",
    )
    p.add_argument("--epochs", type=int, default=50, help="Số epoch train.")
    p.add_argument("--imgsz", type=int, default=640, help="Kích thước input (imgsz).")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    train_phone_yolo(
        dataset_dir=args.data_dir,
        model_out=args.output,
        yaml_path=args.yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
    )


if __name__ == "__main__":
    main()

