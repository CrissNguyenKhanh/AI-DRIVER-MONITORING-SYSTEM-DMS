"""
read_landmarks.py

Đọc file CSV landmark được tạo từ `collect/collect_landmarks.py`.

CSV format:
    label, x1, y1, z1, x2, y2, z2, ..., x478, y478, z478

Cách dùng:
    python -m driver_training.train.read_landmarks
hoặc:
    python train/read_landmarks.py   (khi cwd là thư mục backend/driver_training)
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np


# Dùng chung với collect_landmarks.py và convert_kaggle_face.py
try:
    from ..collect.paths import FACE_CSV_PATH
except ImportError:
    FACE_CSV_PATH = (
        Path(__file__).resolve().parent.parent / "collect" / "data" / "landmarks.csv"
    )

CSV_PATH = FACE_CSV_PATH


def load_landmark_csv(
    csv_path: Path | str = CSV_PATH,
    merge_yawning_into_drowsy: bool = False,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, int]]:
    """
    Đọc file CSV landmarks và trả về:
        X: np.ndarray [num_samples, num_features]
        y: np.ndarray [num_samples] (label index)
        label_to_idx: mapping từ tên label -> index

    Nếu merge_yawning_into_drowsy=True: gộp nhãn "yawning" thành "drowsy" (2 class: safe, drowsy).
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file CSV: {csv_path}")

    labels: List[str] = []
    features: List[List[float]] = []

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            label = row[0]
            if merge_yawning_into_drowsy and label == "yawning":
                label = "drowsy"
            try:
                vec = [float(v) for v in row[1:]]
            except ValueError:
                continue

            labels.append(label)
            features.append(vec)

    if not features:
        raise ValueError(f"CSV rỗng hoặc không đọc được dữ liệu: {csv_path}")

    X = np.asarray(features, dtype=np.float32)

    unique_labels = sorted(set(labels))
    label_to_idx = {lbl: i for i, lbl in enumerate(unique_labels)}
    y = np.asarray([label_to_idx[lbl] for lbl in labels], dtype=np.int64)

    return X, y, label_to_idx


def describe_dataset(
    X: np.ndarray, y: np.ndarray, label_to_idx: Dict[str, int]
) -> str:
    """
    Tạo chuỗi mô tả dataset (thống kê chi tiết).
    """
    num_samples, num_features = X.shape
    idx_to_label = {v: k for k, v in label_to_idx.items()}
    counter = Counter(int(v) for v in y.tolist())
    total = sum(counter.values())

    lines: List[str] = []
    lines.append("=" * 56)
    lines.append("  LANDMARK DATASET - THỐNG KÊ CHI TIẾT")
    lines.append("=" * 56)
    lines.append("")
    lines.append("  [1] TỔNG QUAN")
    lines.append("  " + "-" * 48)
    lines.append(f"    Số mẫu      : {num_samples:,}")
    lines.append(f"    Số feature   : {num_features}  (478 landmark × 3 tọa độ x,y,z)")
    lines.append(f"    Số class     : {len(label_to_idx)}")
    lines.append(f"    Kiểu dữ liệu : {X.dtype}")
    lines.append("")
    lines.append("  [2] PHÂN BỐ THEO CLASS")
    lines.append("  " + "-" * 48)
    for idx in sorted(idx_to_label.keys()):
        label = idx_to_label[idx]
        count = counter.get(idx, 0)
        pct = (count / total * 100) if total > 0 else 0
        bar = "█" * (count // 5) + "░" * max(0, (200 - count) // 10)
        lines.append(f"    {label:<12} : {count:>4} mẫu ({pct:>5.1f}%)  {bar}")
    lines.append("")
    lines.append("  [3] THỐNG KÊ GIÁ TRỊ FEATURE (toàn bộ X)")
    lines.append("  " + "-" * 48)
    lines.append(f"    Min         : {float(X.min()):.6f}")
    lines.append(f"    Max         : {float(X.max()):.6f}")
    lines.append(f"    Mean        : {float(X.mean()):.6f}")
    lines.append(f"    Std         : {float(X.std()):.6f}")
    lines.append("")
    lines.append("  [4] MẪU ĐẦU TIÊN (5 giá trị đầu)")
    lines.append("  " + "-" * 48)
    sample = X[0, :5].tolist()
    lines.append(f"    {[round(v, 4) for v in sample]}")
    lines.append("")
    lines.append("  [5] CẢNH BÁO")
    lines.append("  " + "-" * 48)
    if total < 200:
        lines.append(f"    ⚠ Thiếu dữ liệu: mục tiêu 200 mẫu/class, hiện mới {total} tổng")
    missing = int(np.isnan(X).sum() + np.isinf(X).sum())
    if missing > 0:
        lines.append(f"    ⚠ Có {missing} giá trị NaN/Inf trong dataset!")
    else:
        lines.append("    ✓ Không có giá trị NaN/Inf")
    lines.append("=" * 56)
    return "\n".join(lines)


def main() -> None:
    print(f"Đang đọc CSV landmarks từ:")
    print(f"  {CSV_PATH.resolve()}")
    try:
        X, y, label_to_idx = load_landmark_csv(CSV_PATH)
    except Exception as e:
        print(f"❌ Lỗi khi đọc CSV: {e}")
        return

    print("✅ Đọc CSV thành công.")
    print(describe_dataset(X, y, label_to_idx))


if __name__ == "__main__":
    main()

