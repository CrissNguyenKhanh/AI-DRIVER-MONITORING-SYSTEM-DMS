"""
Đường dẫn CSV dùng chung cho collect/convert/train.

FACE (drowsy/safe/yawning):
    - collect_landmarks.py   → ghi append vào FACE_CSV_PATH
    - convert_kaggle_face.py → ghi (overwrite) vào FACE_CSV_PATH
    - train_landmarks.py     → đọc từ FACE_CSV_PATH

HAND (open/map/music/... — 1 tay normalize 63 số):
    - collect_hands.py       → ghi append vào HAND_CSV_PATH (= hand_dataset.csv)
    - train_hands.py         → đọc từ HAND_CSV_PATH
"""
from pathlib import Path

COLLECT_DIR = Path(__file__).resolve().parent
DATA_DIR = COLLECT_DIR / "data"

# Face landmarks (478 điểm × 3) - safe, drowsy, yawning
FACE_CSV_PATH = DATA_DIR / "landmarks.csv"

# Hand gestures — file chính (thay cho hand_landmarks.csv cũ 126 chiều)
HAND_CSV_PATH = COLLECT_DIR / "hand_dataset.csv"
