"""
train_phone.py (DETECTION-FIRST)

This script now standardizes phone training to YOLO object detection.
The old full-frame MLP classifier approach is intentionally retired because it
is more sensitive to noise for in-cabin phone use detection.

Recommended command (from backend/):
  python -m driver_training.train.train_phone

Equivalent to:
  python -m driver_training.train.train_phone_yolo --data-dir backend/dataset/phone-yolo
"""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from .train_phone_yolo import (
        DEFAULT_DATASET_DIR,
        DEFAULT_MODEL_OUT,
        DEFAULT_YAML_PATH,
        train_phone_yolo,
    )
except ImportError:
    from train_phone_yolo import (  # type: ignore
        DEFAULT_DATASET_DIR,
        DEFAULT_MODEL_OUT,
        DEFAULT_YAML_PATH,
        train_phone_yolo,
    )

ROOT_DIR = Path(__file__).resolve().parent.parent
LEGACY_CLASSIFICATION_DIR = ROOT_DIR.parent / "dataset" / "phone-using"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Train phone detector using YOLO (recommended, robust against noise). "
            "Legacy MLP classification is deprecated."
        )
    )
    p.add_argument(
        "--data-dir",
        type=str,
        default=str(DEFAULT_DATASET_DIR),
        help="YOLO dataset dir (images/train,val + labels/train,val).",
    )
    # Keep old arg name for compatibility, but map it to data-dir.
    p.add_argument(
        "--dataset-root",
        type=str,
        default="",
        help="Deprecated alias. Use --data-dir with YOLO dataset.",
    )
    p.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_MODEL_OUT),
        help="Output path for phone_yolo.pt",
    )
    p.add_argument(
        "--yaml",
        type=str,
        default=str(DEFAULT_YAML_PATH),
        help="YOLO data yaml path",
    )
    p.add_argument("--epochs", type=int, default=60, help="YOLO training epochs")
    p.add_argument("--imgsz", type=int, default=640, help="YOLO image size")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    data_dir = Path(args.data_dir)
    if args.dataset_root:
        data_dir = Path(args.dataset_root)

    # Friendly guidance if user accidentally points to old classification dataset.
    if data_dir.resolve() == LEGACY_CLASSIFICATION_DIR.resolve():
        raise SystemExit(
            "Deprecated dataset detected: backend/dataset/phone-using (classification).\n"
            "Please use YOLO detection dataset instead: backend/dataset/phone-yolo\n"
            "Tip: use driver_training.collect.convert_external_phone_to_yolo or "
            "build_phone_yolo_dataset.py before training."
        )

    print("Using detection-first training for phone (YOLO).")
    print(f"Dataset dir : {data_dir}")
    print(f"Output      : {args.output}")
    train_phone_yolo(
        dataset_dir=data_dir,
        model_out=Path(args.output),
        yaml_path=Path(args.yaml),
        epochs=int(args.epochs),
        imgsz=int(args.imgsz),
    )


if __name__ == "__main__":
    main()

