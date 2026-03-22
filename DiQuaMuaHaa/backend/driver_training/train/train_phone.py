"""
train_phone.py

Train mô hình phân loại frame có/không có ĐIỆN THOẠI
từ ảnh mà bạn đã thu bằng:
  backend/driver_training/collect/collect_phone.py

Cấu trúc dataset (do collect_phone.py tạo):
  backend/dataset/phone-using/phone/*.jpg      → class "phone"
  backend/dataset/phone-using/no_phone/*.jpg   → class "no_phone"

Mô hình: Pipeline(StandardScaler -> MLPClassifier) dùng scikit-learn,
tương tự các model khác của project.

Cách chạy (từ thư mục backend):
  python -m driver_training.train.train_phone
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2  # type: ignore
import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ROOT_DIR = Path(__file__).resolve().parent.parent  # .../backend/driver_training
DEFAULT_DATASET_ROOT = ROOT_DIR.parent / "dataset" / "phone-using"
DEFAULT_MODEL_PATH = ROOT_DIR / "models" / "phone_model.pkl"

IMAGE_SIZE = 160  # ảnh sẽ resize về 160x160


# ======================================================================
# ĐỌC DATASET ẢNH
# ======================================================================


def _load_images_from_folder(
    folder: Path,
    label: str,
    image_size: int = IMAGE_SIZE,
) -> Tuple[List[np.ndarray], List[str]]:
    xs: List[np.ndarray] = []
    ys: List[str] = []

    if not folder.exists():
        return xs, ys

    for img_path in sorted(folder.iterdir()):
        if not img_path.is_file():
            continue
        if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp"}:
            continue
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        # chuyển sang grayscale cho đơn giản, sau đó resize
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (image_size, image_size), interpolation=cv2.INTER_AREA)
        # chuẩn hóa về [0,1]
        arr = gray.astype("float32") / 255.0
        xs.append(arr.flatten())
        ys.append(label)
    return xs, ys


def load_phone_dataset(
    dataset_root: Path | str = DEFAULT_DATASET_ROOT,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, int]]:
    """
    Đọc ảnh từ:
      dataset_root/phone      → label "phone"
      dataset_root/no_phone   → label "no_phone"

    Trả về:
      X: [num_samples, num_features]
      y: [num_samples] (int label index)
      label_to_idx: mapping {label: idx}
    """
    root = Path(dataset_root)
    phone_dir = root / "phone"
    no_phone_dir = root / "no_phone"

    xs: List[np.ndarray] = []
    ys: List[str] = []

    xs_p, ys_p = _load_images_from_folder(phone_dir, "phone")
    xs.extend(xs_p)
    ys.extend(ys_p)

    xs_n, ys_n = _load_images_from_folder(no_phone_dir, "no_phone")
    xs.extend(xs_n)
    ys.extend(ys_n)

    if not xs:
        raise ValueError(f"Không tìm thấy ảnh trong {phone_dir} hoặc {no_phone_dir}")

    X = np.stack(xs).astype("float32")
    unique_labels = sorted(set(ys))
    label_to_idx = {lbl: i for i, lbl in enumerate(unique_labels)}
    y = np.asarray([label_to_idx[lbl] for lbl in ys], dtype=np.int64)

    return X, y, label_to_idx


# ======================================================================
# BUILD MODEL
# ======================================================================


def build_model(random_state: int = 42) -> Pipeline:
    """
    Pipeline:
      - StandardScaler
      - MLPClassifier
    """
    clf = MLPClassifier(
        hidden_layer_sizes=(256, 128),
        activation="relu",
        solver="adam",
        alpha=1e-4,
        batch_size=64,
        learning_rate_init=1e-3,
        max_iter=40,
        random_state=random_state,
        verbose=False,
    )

    pipe = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("clf", clf),
        ]
    )
    return pipe


# ======================================================================
# TRAIN
# ======================================================================


def train_phone_model(
    dataset_root: Path | str = DEFAULT_DATASET_ROOT,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    test_size: float = 0.2,
    random_state: int = 42,
) -> Tuple[Pipeline, Dict[str, int]]:
    """
    Train model phone/no_phone từ ảnh full-frame.
    """
    dataset_root = Path(dataset_root)
    model_path = Path(model_path)
    model_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"📂 Dataset root: {dataset_root}")
    X, y, label_to_idx = load_phone_dataset(dataset_root)

    print(f"   - Số mẫu     : {X.shape[0]}")
    print(f"   - Kích thước : {X.shape[1]} feature (gray {IMAGE_SIZE}x{IMAGE_SIZE})")
    print(f"   - Class      : {len(label_to_idx)} ({list(label_to_idx.keys())})")

    if len(label_to_idx) < 2:
        raise ValueError(
            "Dataset phone hiện chỉ có 1 class. "
            "Hãy đảm bảo có cả ảnh 'phone' và 'no_phone' trước khi train."
        )

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    print(f"📊 Train: {X_train.shape[0]} mẫu  |  Val: {X_val.shape[0]} mẫu")

    model = build_model(random_state=random_state)
    print("🚀 Bắt đầu train model phone (MLP trên ảnh)...")
    model.fit(X_train, y_train)
    print("✅ Train xong.")

    # Đánh giá
    y_pred = model.predict(X_val)
    print("\n=== REPORT TRÊN TẬP VAL (PHONE) ===")
    target_names = [lbl for lbl, _ in sorted(label_to_idx.items(), key=lambda kv: kv[1])]
    print(
        classification_report(
            y_val,
            y_pred,
            target_names=target_names,
            digits=3,
        )
    )
    print("Confusion matrix:")
    print(confusion_matrix(y_val, y_pred))

    # Lưu model
    artifact: Dict[str, Any] = {
        "model": model,
        "label_to_idx": label_to_idx,
        "image_size": IMAGE_SIZE,
    }
    joblib.dump(artifact, model_path)
    print(f"\n💾 Đã lưu phone model vào: {model_path}")

    return model, label_to_idx


# ======================================================================
# CLI
# ======================================================================


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train phone/no_phone classifier từ ảnh collect_phone.")
    p.add_argument(
        "--dataset-root",
        type=str,
        default=str(DEFAULT_DATASET_ROOT),
        help="Thư mục chứa phone-using/phone, phone-using/no_phone",
    )
    p.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_MODEL_PATH),
        help="Đường dẫn file .pkl để lưu model",
    )
    p.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Tỷ lệ data dùng cho validation (default: 0.2)",
    )
    p.add_argument(
        "--seed",
        type=int,
        default=42,
        help="random_state cho train/test split và model",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    train_phone_model(
        dataset_root=args.dataset_root,
        model_path=args.output,
        test_size=args.test_size,
        random_state=args.seed,
    )


if __name__ == "__main__":
    main()

