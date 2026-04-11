"""
train_hands.py  –  v2 (fixed edition)

Train mô hình phân loại ký hiệu tay từ CSV hand landmarks.

Fix so với v1:
  - early_stopping=True → dừng khi không còn cải thiện, tránh train thừa
  - alpha tăng lên 1e-3 → regularization tốt hơn cho dataset nhỏ
  - cross_val_score 5-fold → phát hiện overfit sớm
  - class_weight tự động → xử lý class imbalance
  - Normalize check: cảnh báo nếu data chưa normalize (range quá lớn)
  - Lưu thêm idx_to_label để backend dùng trực tiếp
  - In rõ thời gian train

CSV format (output của collect_hands v3):
    label, f0, f1, ..., f62   (63 features — 21 landmarks × 3, single hand, normalized)

    Hoặc format cũ 2 tay:
    label, x1, y1, z1, ..., f125  (126 features)

Cách dùng (từ thư mục backend, khuyến nghị):
    cd DiQuaMuaHaa/backend
    python -m driver_training.train.train_hands

Hoặc từ thư mục train (CSV mặc định: ../collect/hand_dataset.csv):
    cd DiQuaMuaHaa/backend/driver_training/train
    py .\\train_hands.py
    py .\\train_hands.py --csv-path ..\\collect\\hand_dataset.csv

Tuỳ chọn:
    python -m driver_training.train.train_hands --csv-path path/to.csv --output models/hand_model.pkl
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any, Dict, Tuple

import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.utils.class_weight import compute_sample_weight

# Luôn trỏ tới collect/data (không phụ thuộc cwd khi chạy py train_hands.py trong thư mục train/)
_TRAIN_DIR = Path(__file__).resolve().parent
_DRIVER_TRAINING_ROOT = _TRAIN_DIR.parent  # .../driver_training
_FALLBACK_CSV = _DRIVER_TRAINING_ROOT / "collect" / "hand_dataset.csv"

try:
    from .read_hands import CSV_PATH as DEFAULT_CSV_PATH
    from .read_hands import load_hand_csv

    _USE_READ_HANDS = True
except ImportError:
    _USE_READ_HANDS = False
    DEFAULT_CSV_PATH = _FALLBACK_CSV

ROOT_DIR = _DRIVER_TRAINING_ROOT
DEFAULT_MODEL_PATH = ROOT_DIR / "models" / "hand_model.pkl"


# ══════════════════════════════════════════════
# DATA LOADER — fallback nếu read_hands không normalize
# ══════════════════════════════════════════════

def _load_csv_direct(csv_path: Path):
    """
    Load CSV trực tiếp bằng numpy — dùng khi không có read_hands
    hoặc khi cần kiểm soát normalize.
    """
    import csv as _csv
    labels, rows = [], []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = _csv.reader(f)
        header = next(reader, None)   # bỏ header nếu có
        # Kiểm tra header có phải là label row không
        if header and header[0].replace(".", "").replace("-", "").isdigit():
            # Không có header, đây là data row
            labels.append(header[0])
            rows.append([float(v) for v in header[1:]])
        for row in reader:
            if not row:
                continue
            labels.append(row[0])
            rows.append([float(v) for v in row[1:]])

    le = LabelEncoder()
    y  = le.fit_transform(labels)
    X  = np.array(rows, dtype=np.float32)
    label_to_idx = {cls: int(i) for i, cls in enumerate(le.classes_)}
    return X, y, label_to_idx, le


def load_data(csv_path: Path):
    """
    Load + kiểm tra data. Tự động dùng read_hands nếu có,
    fallback về load trực tiếp.
    """
    if _USE_READ_HANDS:
        X, y, label_to_idx = load_hand_csv(csv_path)
        # Tái tạo LabelEncoder để dùng sau
        le = LabelEncoder()
        le.classes_ = np.array(sorted(label_to_idx, key=label_to_idx.get))
    else:
        X, y, label_to_idx, le = _load_csv_direct(csv_path)

    if X.size == 0:
        raise ValueError(
            "Empty CSV or no valid feature rows. Add samples to hand_dataset.csv "
            f"(path: {csv_path}).",
        )

    # ── Normalize check ───────────────────────────────────────
    # Nếu collect_hands v3 đã normalize, range phải nằm trong [-1, 1].
    # Nếu range lớn hơn nhiều → data chưa normalize → cảnh báo.
    data_max = float(np.max(np.abs(X)))
    if data_max > 5.0:
        print(
            f"\n[WARN] Data range = {data_max:.1f} (expected <= 1.0 if normalized)."
            "\n   CSV may be from collect_hands v1/v2 (not normalized)."
            "\n   Model can still train with StandardScaler; re-collect with v3 for best results.\n"
        )

    # ── Class distribution ────────────────────────────────────
    classes   = le.classes_.tolist()
    counts    = {cls: int((y == i).sum()) for i, cls in enumerate(classes)}
    min_count = min(counts.values())
    max_count = max(counts.values())

    print(f"\n[STATS] Class distribution:")
    for cls, cnt in counts.items():
        bar = "#" * int(cnt / max_count * 20)
        print(f"   {cls:<14} {cnt:>4}  {bar}")

    if min_count < 50:
        print(
            f"\n[WARN] Smallest class has only {min_count} samples - collect more (>= 100 per class recommended)."
        )

    imbalance_ratio = max_count / max(min_count, 1)
    if imbalance_ratio > 3.0:
        print(f"[WARN] Imbalance ratio = {imbalance_ratio:.1f}x - using sample_weight.")

    return X, y, label_to_idx, le, counts


# ══════════════════════════════════════════════
# MODEL
# ══════════════════════════════════════════════

def build_model(random_state: int = 42) -> Pipeline:
    """
    Pipeline: StandardScaler → MLPClassifier

    Thay đổi so với v1:
      - early_stopping=True, validation_fraction=0.1, n_iter_no_change=20
        → dừng sớm khi val loss không giảm, tiết kiệm thời gian
      - alpha=1e-3 (tăng từ 1e-4) → L2 regularization mạnh hơn, giảm overfit
      - max_iter=500 (tăng từ 200) nhưng sẽ dừng sớm nhờ early_stopping
      - learning_rate="adaptive" → tự giảm lr khi loss không giảm
    """
    clf = MLPClassifier(
        hidden_layer_sizes=(128, 64),
        activation="relu",
        solver="adam",
        alpha=1e-3,                  # ← tăng từ 1e-4
        batch_size=64,
        learning_rate_init=1e-3,
        learning_rate="adaptive",    # ← thêm mới
        max_iter=500,                # ← tăng nhưng early_stopping sẽ dừng trước
        early_stopping=True,         # ← thêm mới — quan trọng nhất
        validation_fraction=0.1,     # ← 10% train dùng để early stop
        n_iter_no_change=20,         # ← dừng sau 20 epoch không cải thiện
        random_state=random_state,
        verbose=False,
    )

    return Pipeline([
        ("scaler", StandardScaler()),
        ("clf",    clf),
    ])


# ══════════════════════════════════════════════
# TRAIN
# ══════════════════════════════════════════════

def train_hand_model(
    csv_path:     Path | str = DEFAULT_CSV_PATH,
    model_path:   Path | str = DEFAULT_MODEL_PATH,
    test_size:    float = 0.15,
    random_state: int   = 42,
) -> Tuple[Pipeline, Dict[str, int]]:

    csv_path   = Path(csv_path)
    model_path = Path(model_path)
    model_path.parent.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        raise FileNotFoundError(f"Khong tim thay CSV: {csv_path}")

    print(f"[CSV] {csv_path}")
    X, y, label_to_idx, le, counts = load_data(csv_path)

    print(f"\n   samples : {X.shape[0]}")
    print(f"   features: {X.shape[1]}")
    print(f"   classes : {len(label_to_idx)}  ->  {list(label_to_idx.keys())}")

    # ── Train / Test split ────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    # ── Sample weights (xử lý class imbalance) ────────────────
    sample_weight = compute_sample_weight("balanced", y_train)

    # ── Train ─────────────────────────────────────────────────
    print(f"\n[TRAIN] train={len(X_train)}, test={len(X_test)} ...", flush=True)
    model = build_model(random_state)

    t0 = time.time()
    model.fit(X_train, y_train, clf__sample_weight=sample_weight)
    elapsed = time.time() - t0

    n_iter = model.named_steps["clf"].n_iter_
    print(f"[OK] Xong trong {elapsed:.1f}s  |  {n_iter} epochs (early stop)")

    # ── Test set evaluation ───────────────────────────────────
    y_pred = model.predict(X_test)
    acc    = (y_pred == y_test).mean()
    class_names = [k for k, _ in sorted(label_to_idx.items(), key=lambda kv: kv[1])]

    print(f"\n{'='*52}")
    print(f"  TEST ACCURACY: {acc*100:.2f}%")
    print(f"{'='*52}")
    print(classification_report(y_test, y_pred, target_names=class_names, digits=3))

    print("Confusion matrix:")
    cm = confusion_matrix(y_test, y_pred)
    # In đẹp với tên class
    header = "  " + "  ".join(f"{c[:5]:>5}" for c in class_names)
    print(header)
    for i, row in enumerate(cm):
        row_str = "  ".join(f"{v:>5}" for v in row)
        print(f"{class_names[i][:5]:>5}  {row_str}")

    # ── 5-Fold Cross Validation ───────────────────────────────
    # Dùng toàn bộ X để đánh giá variance (phát hiện overfit)
    print(f"\n[CV] 5-Fold on full dataset...", flush=True)
    cv_model = build_model(random_state)
    cv_scores = cross_val_score(cv_model, X, y, cv=5, scoring="accuracy", n_jobs=-1)
    print(f"   CV Accuracy: {cv_scores.mean()*100:.2f}% +/- {cv_scores.std()*100:.2f}%")

    gap = acc - cv_scores.mean()
    if gap > 0.05:
        print(
            f"[WARN] Test acc ({acc*100:.1f}%) higher than CV ({cv_scores.mean()*100:.1f}%) - possible overfit."
        )
    elif acc < 0.85:
        print(f"[WARN] Low accuracy ({acc*100:.1f}%) - collect more data or check normalization.")
    else:
        print(f"[OK] Model looks fine - no strong overfit signal.")

    # ── Save ──────────────────────────────────────────────────
    idx_to_label = {v: k for k, v in label_to_idx.items()}
    artifact: Dict[str, Any] = {
        "model":        model,
        "label_to_idx": label_to_idx,
        "idx_to_label": idx_to_label,   # ← thêm mới, backend dùng trực tiếp
        "vec_len":      X.shape[1],     # ← để kiểm tra khi load
        "classes":      class_names,    # ← list theo thứ tự index
        "cv_mean":      float(cv_scores.mean()),
        "test_acc":     float(acc),
    }
    joblib.dump(artifact, model_path)
    print(f"\n[SAVE] Model -> {model_path}")
    print(f"   vec_len={X.shape[1]}  |  classes={class_names}")

    return model, label_to_idx


# ══════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Train hand gesture classifier from landmark CSV (collect_hands output).",
    )
    p.add_argument(
        "--csv-path",
        type=str,
        default=str(DEFAULT_CSV_PATH.resolve()),
        help=f"Default: {_FALLBACK_CSV}",
    )
    p.add_argument("--output",   type=str, default=str(DEFAULT_MODEL_PATH))
    p.add_argument("--test-size", type=float, default=0.15)
    p.add_argument("--seed",      type=int,   default=42)
    return p.parse_args()


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