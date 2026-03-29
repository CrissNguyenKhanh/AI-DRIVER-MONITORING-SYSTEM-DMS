"""
train_smoking.py

Train mô hình phát hiện hành vi hút thuốc từ CSV landmark
được tạo bởi `collect/convert_smoking_face.py`.

CSV format:
    label, x1, y1, z1, ..., x478, y478, z478

Thông thường:
    label chỉ có 1 class "smoking".
    (Nếu sau này bạn thêm class "no_smoking" thì script này vẫn chạy bình thường.)

Cách dùng (từ thư mục backend):
    cd backend
    python -m driver_training.train.train_smoking

Model output:
    backend/driver_training/models/smoking_model.pkl

File .pkl chứa:
    {
        "model": sklearn Pipeline (StandardScaler + MLPClassifier),
        "label_to_idx": {label: int},
    }
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, Tuple, List

import csv
import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CSV_PATH = (
    ROOT_DIR / "collect" / "data" / "smoking_landmarks_binary.csv"
)
DEFAULT_MODEL_PATH = ROOT_DIR / "models" / "smoking_model.pkl"


# ======================================================================
# ĐỌC CSV LANDMARKS HÚT THUỐC
# ======================================================================


def load_smoking_csv(
    csv_path: Path | str = DEFAULT_CSV_PATH,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, int]]:
    """
    Đọc file CSV landmark hút thuốc và trả về:
        X: np.ndarray [num_samples, num_features]
        y: np.ndarray [num_samples] (label index)
        label_to_idx: mapping từ tên label -> index
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file CSV: {csv_path}")

    labels: List[str] = []
    feats: List[List[float]] = []

    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            label = row[0].strip()
            try:
                vec = [float(v) for v in row[1:]]
            except ValueError:
                # bỏ qua dòng hỏng
                continue
            labels.append(label)
            feats.append(vec)

    if not feats:
        raise ValueError(f"CSV rỗng hoặc không đọc được dữ liệu: {csv_path}")

    X = np.asarray(feats, dtype=np.float32)
    unique_labels = sorted(set(labels))
    label_to_idx = {lbl: i for i, lbl in enumerate(unique_labels)}
    y = np.asarray([label_to_idx[lbl] for lbl in labels], dtype=np.int64)

    return X, y, label_to_idx


# ======================================================================
# BUILD MODEL
# ======================================================================


def build_model(random_state: int = 42) -> Pipeline:
    """
    Pipeline:
        StandardScaler -> MLPClassifier
    """
    clf = MLPClassifier(
        hidden_layer_sizes=(128, 64),
        activation="relu",
        solver="adam",
        alpha=1e-4,
        batch_size=64,
        learning_rate_init=1e-3,
        max_iter=200,
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


def train_smoking_model(
    csv_path: Path | str = DEFAULT_CSV_PATH,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    test_size: float = 0.2,
    random_state: int = 42,
) -> Tuple[Pipeline, Dict[str, int]]:
    """
    Train model hút thuốc từ CSV và lưu ra file .pkl.

    Trả về:
        model (Pipeline), label_to_idx (dict)
    """
    csv_path = Path(csv_path)
    model_path = Path(model_path)
    model_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"🔎 Đọc dữ liệu smoking landmarks từ: {csv_path}")
    X, y, label_to_idx = load_smoking_csv(csv_path)

    print(f"   - Số mẫu      : {X.shape[0]}")
    print(f"   - Số feature   : {X.shape[1]}")
    print(f"   - Số class     : {len(label_to_idx)} ({list(label_to_idx.keys())})")

    if X.shape[0] < 20:
        print("⚠ Dữ liệu quá ít (< 20 mẫu). Nên thu thêm trước khi train.")

    if len(label_to_idx) < 2:
        raise ValueError(
            "Dataset smoking hiện chỉ có 1 class. "
            "Không thể train mô hình phân loại đúng được.\n"
            "   Hãy bổ sung thêm dữ liệu class 'no_smoking' (mặt KHÔNG hút thuốc) "
            "và đảm bảo trong CSV có cả 'smoking' và 'no_smoking' rồi train lại."
        )

    # Split train / val
    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y if len(np.unique(y)) > 1 else None,
    )

    print(f"📊 Train: {X_train.shape[0]} mẫu  |  Val: {X_val.shape[0]} mẫu")

    model = build_model(random_state=random_state)

    print("🚀 Bắt đầu train model smoking (MLP)...")
    model.fit(X_train, y_train)
    print("✅ Train xong.")

    # Đánh giá trên val
    y_pred = model.predict(X_val)
    print("\n=== REPORT TRÊN TẬP VAL (SMOKING) ===")
    print(
        classification_report(
            y_val,
            y_pred,
            target_names=[
                k for k, _ in sorted(label_to_idx.items(), key=lambda kv: kv[1])
            ],
            digits=3,
        )
    )

    print("Confusion matrix:")
    print(confusion_matrix(y_val, y_pred))

    # Lưu model + mapping
    artifact: Dict[str, Any] = {
        "model": model,
        "label_to_idx": label_to_idx,
    }
    joblib.dump(artifact, model_path)
    print(f"\n💾 Đã lưu smoking model vào: {model_path}")

    return model, label_to_idx


# ======================================================================
# CLI
# ======================================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train smoking classifier từ smoking_landmarks.csv."
    )
    parser.add_argument(
        "--csv-path",
        type=str,
        default=str(DEFAULT_CSV_PATH),
        help="Đường dẫn tới file smoking_landmarks.csv",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_MODEL_PATH),
        help="Đường dẫn file .pkl để lưu model",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Tỷ lệ data dùng cho validation (default: 0.2)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="random_state cho train/test split và model",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train_smoking_model(
        csv_path=args.csv_path,
        model_path=args.output,
        test_size=args.test_size,
        random_state=args.seed,
    )


if __name__ == "__main__":
    main()