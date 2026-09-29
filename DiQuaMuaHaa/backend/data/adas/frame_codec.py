from __future__ import annotations

import base64
import binascii

import numpy as np


def decode_frame(image_data: str, *, max_chars: int, max_pixels: int) -> np.ndarray:
    if not isinstance(image_data, str) or not image_data or len(image_data) > max_chars:
        raise ValueError("invalid frame")
    encoded = image_data
    if image_data.startswith("data:"):
        header, separator, encoded = image_data.partition(",")
        if not separator or not header.startswith("data:image/") or ";base64" not in header:
            raise ValueError("invalid frame")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("invalid frame") from None
    if not raw:
        raise ValueError("invalid frame")

    import cv2

    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.ndim != 3:
        raise ValueError("invalid frame")
    height, width = frame.shape[:2]
    if height * width > max_pixels:
        raise ValueError("frame dimensions too large")
    return frame
