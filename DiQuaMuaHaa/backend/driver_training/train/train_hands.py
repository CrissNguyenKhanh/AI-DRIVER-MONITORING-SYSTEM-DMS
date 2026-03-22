"""
train_hands.py

Train mô hình phân loại ký hiệu tay (stop / go / turn_left / turn_right / ...)
từ file CSV hand landmarks được tạo bởi `collect/collect_hands.py`.

Yêu cầu:
    pip install -r backend/requirements.txt

CSV format:
    label, x1, y1, z1, ..., x126 (21 landmark × 3 × 2 tay)

Cách dùng (từ thư mục backend):
    cd backend
    python -m driver_training.train.train_hands

Sau khi train xong, model sẽ được lưu tại:
    backend/driver_training/models/hand_model.pkl

File .pkl chứa một dict:
    {
        "model": sklearn Pipeline (StandardScaler + MLPClassifier),
        "label_to_idx": {label: int},
    }
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict, Tuple

import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .read_hands import CSV_PATH as DEFAULT_CSV_PATH
from .read_hands import load_hand_csv


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = ROOT_DIR / "models" / "hand_model.pkl"


def build_model(random_state: int = 42) -> Pipeline:
    """
    Tạo sklearn Pipeline:
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


def train_hand_model(
    csv_path: Path | str = DEFAULT_CSV_PATH,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    test_size: float = 0.2,
    random_state: int = 42,
) -> Tuple[Pipeline, Dict[str, int]]:
    """
    Train model hand từ CSV và lưu ra file .pkl.

    Trả về:
        model (Pipeline), label_to_idx (dict)
    """
    csv_path = Path(csv_path)
    model_path = Path(model_path)
    model_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"🔎 Đọc dữ liệu hand landmarks từ: {csv_path}")
    X, y, label_to_idx = load_hand_csv(csv_path)

    print(f"   - Số mẫu      : {X.shape[0]}")
    print(f"   - Số feature   : {X.shape[1]}")
    print(f"   - Số class     : {len(label_to_idx)} ({list(label_to_idx.keys())})")

    if X.shape[0] < 10:
        print("⚠ Dữ liệu quá ít (< 10 mẫu). Nên thu thêm trước khi train.")

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y if len(np.unique(y)) > 1 else None,
    )

    print(f"📊 Train: {X_train.shape[0]} mẫu  |  Val: {X_val.shape[0]} mẫu")

    model = build_model(random_state=random_state)

    print("🚀 Bắt đầu train model (MLP)...")
    model.fit(X_train, y_train)
    print("✅ Train xong.")

    # Đánh giá trên tập validation
    y_pred = model.predict(X_val)
    print("\n=== REPORT TRÊN TẬP VAL ===")
    print(
        classification_report(
            y_val,
            y_pred,
            target_names=[k for k, _ in sorted(label_to_idx.items(), key=lambda kv: kv[1])],
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
    print(f"\n💾 Đã lưu model vào: {model_path}")

    return model, label_to_idx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train hand sign classifier từ CSV.")
    parser.add_argument(
        "--csv-path",
        type=str,
        default=str(DEFAULT_CSV_PATH),
        help="Đường dẫn tới file hand_landmarks.csv",
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
    train_hand_model(
        csv_path=args.csv_path,
        model_path=args.output,
        test_size=args.test_size,
        random_state=args.seed,
    )


if __name__ == "__main__":
    main()
