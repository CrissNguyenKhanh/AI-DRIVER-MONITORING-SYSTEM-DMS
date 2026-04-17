from __future__ import annotations

"""
build_smoking_binary_csv.py

Tạo dataset 2 class cho smoking:
  - smoking      : lấy từ collect/data/smoking_landmarks.csv (convert_smoking_face.py)
  - no_smoking   : lấy từ collect/data/landmarks.csv và/hoặc landmarks_kaggle.csv

Vì các file landmarks đều cùng format FaceMesh (478×3 = 1434 features),
ta có thể relabel các dòng "safe/drowsy/yawning/..." → "no_smoking" để tạo negative class.

Output mặc định:
  backend/driver_training/collect/data/smoking_landmarks_binary.csv

Chạy (từ thư mục backend):
  python -m driver_training.collect.build_smoking_binary_csv
"""

import argparse
import csv
import random
from pathlib import Path
from typing import List, Optional, Tuple


ROOT_DIR = Path(__file__).resolve().parents[2]  # .../backend
DATA_DIR = ROOT_DIR / "driver_training" / "collect" / "data"

DEFAULT_SMOKING_CSV = DATA_DIR / "smoking_landmarks.csv"
DEFAULT_NO_SMOKING_SOURCES = [
    DATA_DIR / "landmarks.csv",
    DATA_DIR / "landmarks_kaggle.csv",
]
DEFAULT_OUT_CSV = DATA_DIR / "smoking_landmarks_binary.csv"

SMOKING_LABEL = "smoking"
NO_SMOKING_LABEL = "no_smoking"


def _read_landmark_rows(csv_path: Path) -> List[Tuple[str, List[float]]]:
    rows: List[Tuple[str, List[float]]] = []
    if not csv_path.exists():
        return rows
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            label = str(row[0]).strip()
            if not label:
                continue
            try:
                feats = [float(x) for x in row[1:]]
            except Exception:
                continue
            if len(feats) != 1434:
                # sai format → bỏ qua
                continue
            rows.append((label, feats))
    return rows


def build_binary_csv(
    smoking_csv: Path,
    no_smoking_sources: List[Path],
    out_csv: Path,
    seed: int = 42,
    max_no_smoking: Optional[int] = None,
) -> None:
    random.seed(seed)

    smoking_rows_raw = _read_landmark_rows(smoking_csv)
    smoking_rows = [(SMOKING_LABEL, feats) for (lbl, feats) in smoking_rows_raw if lbl == SMOKING_LABEL]

    if not smoking_rows:
        raise ValueError(f"Không có dòng label='{SMOKING_LABEL}' trong: {smoking_csv}")

    no_smoking_pool: List[List[float]] = []
    for src in no_smoking_sources:
        for lbl, feats in _read_landmark_rows(src):
            # mọi trạng thái mặt bình thường đều coi là negative (không hút thuốc)
            if lbl == "no_face":
                continue
            no_smoking_pool.append(feats)

    if not no_smoking_pool:
        raise ValueError(
            "Không có dữ liệu no_smoking. Hãy đảm bảo có collect/data/landmarks.csv "
            "hoặc landmarks_kaggle.csv (face landmarks) để dùng làm negative class."
        )

    target_no = len(smoking_rows)
    if max_no_smoking is not None:
        target_no = min(target_no, int(max_no_smoking))

    if len(no_smoking_pool) >= target_no:
        no_smoking_feats = random.sample(no_smoking_pool, k=target_no)
    else:
        # thiếu negative → cho phép oversample đơn giản để cân bằng
        no_smoking_feats = [random.choice(no_smoking_pool) for _ in range(target_no)]

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for _, feats in smoking_rows:
            writer.writerow([SMOKING_LABEL] + feats)
        for feats in no_smoking_feats:
            writer.writerow([NO_SMOKING_LABEL] + feats)

    print("✅ Built smoking binary CSV")
    print(f"  smoking      : {len(smoking_rows)}")
    print(f"  no_smoking   : {len(no_smoking_feats)}")
    print(f"  output CSV   : {out_csv}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build smoking binary landmarks CSV (smoking + no_smoking).")
    p.add_argument(
        "--smoking-csv",
        type=str,
        default=str(DEFAULT_SMOKING_CSV),
        help="CSV nguồn chứa class 'smoking' (convert_smoking_face.py).",
    )
    p.add_argument(
        "--no-smoking-csv",
        type=str,
        action="append",
        default=[str(p) for p in DEFAULT_NO_SMOKING_SOURCES],
        help="CSV nguồn để lấy negative class (sẽ relabel thành 'no_smoking'). Có thể truyền nhiều lần.",
    )
    p.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_OUT_CSV),
        help="CSV output (2 class).",
    )
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--max-no-smoking",
        type=int,
        default=None,
        help="Giới hạn số mẫu no_smoking (mặc định = cân bằng theo smoking).",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    smoking_csv = Path(args.smoking_csv).resolve()
    no_smoking_sources = [Path(p).resolve() for p in (args.no_smoking_csv or [])]
    out_csv = Path(args.output).resolve()

    print(f"Smoking CSV : {smoking_csv}")
    print("NoSmoking sources:")
    for p in no_smoking_sources:
        print(f"  - {p}")
    print(f"Output CSV  : {out_csv}")

    build_binary_csv(
        smoking_csv=smoking_csv,
        no_smoking_sources=no_smoking_sources,
        out_csv=out_csv,
        seed=int(args.seed),
        max_no_smoking=args.max_no_smoking,
    )


if __name__ == "__main__":
    main()

