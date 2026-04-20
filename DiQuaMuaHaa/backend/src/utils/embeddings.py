"""
Embedding utilities.
Handles cosine similarity, normalization, and vector math.
"""

from typing import List

import numpy as np


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two embedding vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def normalize_face_embedding(vec: List[float]) -> List[float]:
    """
    Normalize face embedding to reduce false positives:
    - Center to origin (x,y)
    - Scale by average face size
    - L2 normalize entire vector
    """
    if not vec:
        return []

    arr = np.asarray(vec, dtype=np.float32).reshape(-1, 3)
    center_xy = np.mean(arr[:, :2], axis=0)
    arr[:, 0] -= center_xy[0]
    arr[:, 1] -= center_xy[1]

    scale = float(np.mean(np.linalg.norm(arr[:, :2], axis=1)))
    if scale > 1e-6:
        arr[:, :2] /= scale

    flat = arr.reshape(-1)
    norm = float(np.linalg.norm(flat))
    if norm > 1e-6:
        flat /= norm

    return flat.tolist()
