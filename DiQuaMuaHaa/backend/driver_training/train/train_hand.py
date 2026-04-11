"""
Shim: lệnh thường gõ nhầm `train_hand` thay vì `train_hands`.

Chạy giống train_hands.py (cùng tham số --csv-path, --output, ...).
"""
from __future__ import annotations

import importlib.util
from pathlib import Path


def main() -> None:
    path = Path(__file__).resolve().with_name("train_hands.py")
    spec = importlib.util.spec_from_file_location("_train_hands_cli", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Không load được train_hands.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.main()


if __name__ == "__main__":
    main()
