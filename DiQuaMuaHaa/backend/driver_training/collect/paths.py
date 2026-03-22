"""
Đường dẫn CSV dùng chung cho collect/convert/train.

FACE (drowsy/safe/yawning):
    - collect_landmarks.py   → ghi append vào FACE_CSV_PATH
    - convert_kaggle_face.py → ghi (overwrite) vào FACE_CSV_PATH
    - train_landmarks.py     → đọc từ FACE_CSV_PATH

HAND (stop/go/turn_left/...):
    - collect_hands.py       → ghi append vào HAND_CSV_PATH
    - train_hands.py         → đọc từ HAND_CSV_PATH
"""
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

# Face landmarks (478 điểm × 3) - safe, drowsy, yawning
FACE_CSV_PATH = DATA_DIR / "landmarks.csv"

# Hand landmarks (21×3×2 = 126) - stop, go, turn_left, ...
HAND_CSV_PATH = DATA_DIR / "hand_landmarks.csv"
