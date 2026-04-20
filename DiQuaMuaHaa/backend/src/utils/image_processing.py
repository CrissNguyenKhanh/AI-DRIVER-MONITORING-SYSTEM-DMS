"""
Image processing utilities.
Handles MediaPipe FaceMesh, Hands detection, and image preprocessing.
"""

from __future__ import annotations

import base64
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# Lazy imports (loaded on demand to reduce startup RAM)
cv2 = None  # type: ignore[assignment]
_face_mesh: Any = None
_hands: Any = None
_joblib: Any = None

# Import model globals from core
from core.config import get_model_globals, set_model_globals


def ensure_face_mesh_loaded() -> None:
    """Lazy load OpenCV + MediaPipe FaceMesh."""
    global cv2, _face_mesh
    if _face_mesh is not None:
        return

    import cv2 as _cv2_imported  # noqa: PLC0415
    import mediapipe as mp  # noqa: PLC0415

    global cv2
    cv2 = _cv2_imported

    _face_mesh = mp.solutions.face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.55,
        static_image_mode=True,
    )


def ensure_models_loaded() -> None:
    """Load sklearn .pkl + MediaPipe Hands. FaceMesh loaded separately."""
    global _hands, _joblib

    ensure_face_mesh_loaded()

    g = get_model_globals()
    if g.get("_models_loaded"):
        return

    import joblib  # noqa: PLC0415
    import mediapipe as mp  # noqa: PLC0415

    _joblib = joblib

    # Load models via service (import here to avoid circular)
    from services.model_loader_service import load_model, load_hand_model
    load_hand_model()
    load_model()

    if _hands is None:
        _hands = mp.solutions.hands.Hands(
            static_image_mode=True,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    g = get_model_globals()
    models_ready = (
        g.get("model") is not None
        and bool(g.get("idx_to_label"))
        and g.get("hand_model") is not None
        and bool(g.get("hand_idx_to_label"))
    )
    set_model_globals("_models_loaded", models_ready)


NUM_LANDMARKS_PER_HAND = 21


def get_dominant_hand_landmark(multi_hand_landmarks, multi_handedness) -> Tuple[Any, float]:
    """Select dominant hand (highest handedness confidence)."""
    if not multi_hand_landmarks:
        return None, 0.0
    best_lm = None
    best_conf = -1.0
    for i, hlm in enumerate(multi_hand_landmarks):
        conf = 0.0
        if multi_handedness and i < len(multi_handedness):
            conf = float(multi_handedness[i].classification[0].score)
        if conf > best_conf:
            best_conf = conf
            best_lm = hlm
    return best_lm, best_conf


def normalize_single_hand_landmarks(hand_landmarks) -> Optional[List[float]]:
    """Normalize landmarks: subtract wrist, divide by max(abs)."""
    if hand_landmarks is None:
        return None
    pts = np.array(
        [(lm.x, lm.y, lm.z) for lm in hand_landmarks.landmark],
        dtype=np.float32,
    )
    pts = pts - pts[0]
    scale = float(np.max(np.abs(pts)))
    if scale < 1e-6:
        return None
    pts /= scale
    return pts.flatten().tolist()


def hands_to_vector(multi_hand_landmarks, multi_handedness) -> List[float]:
    """Convert 1-2 hands to 126-dim vector (left 63 + right 63)."""
    left_vec = [0.0] * (NUM_LANDMARKS_PER_HAND * 3)
    right_vec = [0.0] * (NUM_LANDMARKS_PER_HAND * 3)

    if multi_hand_landmarks is None or len(multi_hand_landmarks) == 0:
        return left_vec + right_vec

    for i, hand_landmarks in enumerate(multi_hand_landmarks):
        handedness = "Left"
        if multi_handedness and i < len(multi_handedness):
            handedness = multi_handedness[i].classification[0].label

        coords = []
        for lm in hand_landmarks.landmark:
            coords.extend([lm.x, lm.y, lm.z])

        if handedness == "Left":
            left_vec = coords
        else:
            right_vec = coords

    return left_vec + right_vec


def hands_to_feature_vector(multi_hand_landmarks, multi_handedness) -> Optional[List[float]]:
    """
    Convert hands to feature vector for hand_model.
    - 63-dim: dominant hand normalized (new)
    - 126-dim: raw left+right (legacy)
    Returns None if no hands detected for 63-dim mode.
    """
    g = get_model_globals()
    hand_vec_len = g.get("hand_vec_len", 126)

    if hand_vec_len == 63:
        if multi_hand_landmarks is None or len(multi_hand_landmarks) == 0:
            return None
        lm, _conf = get_dominant_hand_landmark(multi_hand_landmarks, multi_handedness)
        if lm is None:
            return None
        return normalize_single_hand_landmarks(lm)
    return hands_to_vector(multi_hand_landmarks, multi_handedness)


def image_base64_to_landmarks(image_b64: str) -> Optional[List[float]]:
    """
    Decode base64 → MediaPipe Face Mesh → 1434-dim vector.
    Returns None if no face detected.
    """
    ensure_face_mesh_loaded()
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = _face_mesh.process(rgb)
    if results.multi_face_landmarks is None or len(results.multi_face_landmarks) == 0:
        return None
    lms = results.multi_face_landmarks[0]
    coords = []
    for lm in lms.landmark:
        coords.extend([lm.x, lm.y, lm.z])
    return coords


def image_base64_to_hand_landmarks(image_b64: str) -> Optional[List[float]]:
    """
    Decode base64 → MediaPipe Hands → vector (63 or 126 dim).
    """
    ensure_models_loaded()
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh từ base64.")
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = _hands.process(rgb)
    return hands_to_feature_vector(
        results.multi_hand_landmarks, results.multi_handedness
    )


def extract_images_from_payload(payload: Dict[str, Any]) -> List[str]:
    """Extract and clean base64 images from request payload."""
    images: List[str] = []

    image_one = payload.get("image")
    if isinstance(image_one, str) and image_one.strip():
        images.append(image_one.strip())

    image_many = payload.get("images")
    if isinstance(image_many, list):
        for it in image_many:
            if isinstance(it, str) and it.strip():
                images.append(it.strip())

    # Unique + strip data URL prefix
    out: List[str] = []
    seen = set()
    for img in images:
        cleaned = img.split(",", 1)[-1] if img.startswith("data:") else img
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
    return out


def collect_face_embeddings(images: List[str]) -> List[List[float]]:
    """Extract embeddings from multiple images."""
    embeddings: List[List[float]] = []
    for image_b64 in images:
        emb = get_face_embedding_from_image(image_b64)
        if emb is not None:
            embeddings.append(emb)
    return embeddings


def mean_embedding(embeddings: List[List[float]]) -> List[float]:
    """Compute mean of multiple embeddings."""
    if not embeddings:
        return []
    arr = np.asarray(embeddings, dtype=np.float32)
    return np.mean(arr, axis=0).tolist()


def get_face_embedding_from_image(image_b64: str) -> Optional[List[float]]:
    """
    Get face embedding directly from landmark vector (1434-dim).
    Replace this function to use a different embedding model.
    """
    from utils.embeddings import normalize_face_embedding
    vec = image_base64_to_landmarks(image_b64)
    if vec is None:
        return None
    return normalize_face_embedding(vec)
