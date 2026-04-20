"""Utility functions for DMS backend."""

from .image_processing import (
    ensure_face_mesh_loaded,
    ensure_models_loaded,
    image_base64_to_landmarks,
    image_base64_to_hand_landmarks,
    hands_to_feature_vector,
    hands_to_vector,
    get_dominant_hand_landmark,
    normalize_single_hand_landmarks,
    extract_images_from_payload,
    collect_face_embeddings,
    mean_embedding,
    get_face_embedding_from_image,
)
from .embeddings import (
    cosine_similarity,
    normalize_face_embedding,
)

__all__ = [
    # Image processing
    "ensure_face_mesh_loaded",
    "ensure_models_loaded",
    "image_base64_to_landmarks",
    "image_base64_to_hand_landmarks",
    "hands_to_feature_vector",
    "hands_to_vector",
    "get_dominant_hand_landmark",
    "normalize_single_hand_landmarks",
    "extract_images_from_payload",
    "collect_face_embeddings",
    "mean_embedding",
    "get_face_embedding_from_image",
    # Embeddings
    "cosine_similarity",
    "normalize_face_embedding",
]
