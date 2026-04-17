"""
read_hands.py

Đọc file CSV hand landmarks được tạo từ `collect/collect_hands.py`.

CSV format (collect_hands v3 — 1 tay):
    label, f0, f1, ..., f62   (63 features, normalized)

Hoặc format cũ 2 tay:
    label, x1, y1, z1, ..., x126 (126 số)

Cách dùng:
    python -m driver_training.train.read_hands
hoặc:
    python train/read_hands.py   (khi cwd là thư mục backend/driver_training)
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np


# Dùng chung với collect_hands.py
from ..collect.paths import HAND_CSV_PATH

CSV_PATH = HAND_CSV_PATH


def load_hand_csv(
    csv_path: Path | str = CSV_PATH,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, int]]:
    """
    Đọc file CSV hand landmarks và trả về:
        X: np.ndarray [num_samples, 126]
        y: np.ndarray [num_samples] (label index)
        label_to_idx: mapping từ tên label -> index
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
    """Tạo chuỗi mô tả dataset hand landmarks."""
    num_samples, num_features = X.shape
    idx_to_label = {v: k for k, v in label_to_idx.items()}
    counter = Counter(int(v) for v in y.tolist())
    total = sum(counter.values())

    lines: List[str] = []
    lines.append("=" * 56)
    lines.append("  HAND LANDMARK DATASET - KÝ HIỆU TAY TÀI XẾ KHIẾM THÍNH")
    lines.append("=" * 56)
    lines.append("")
    lines.append("  [1] TỔNG QUAN")
    lines.append("  " + "-" * 48)
    lines.append(f"    Số mẫu      : {num_samples:,}")
    lines.append(f"    Số feature   : {num_features}  (21 landmark × 3 × 2 tay)")
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
    print(f"Đang đọc CSV hand landmarks từ:")
    print(f"  {CSV_PATH.resolve()}")
    try:
        X, y, label_to_idx = load_hand_csv(CSV_PATH)
    except Exception as e:
        print(f"❌ Lỗi khi đọc CSV: {e}")
        return

    print("✅ Đọc CSV thành công.")
    print(describe_dataset(X, y, label_to_idx))


if __name__ == "__main__":
    main()
