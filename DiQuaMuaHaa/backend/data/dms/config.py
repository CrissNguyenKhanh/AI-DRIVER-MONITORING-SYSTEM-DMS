from __future__ import annotations

import os
from dataclasses import dataclass


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class DMSAttentionConfig:
    """Central thresholds for the explainable DMS attention pipeline."""

    eye_closed_threshold: float = 0.21
    eye_open_threshold: float = 0.23
    perclos_window_seconds: float = 30.0
    perclos_threshold: float = 0.40
    perclos_min_observation_seconds: float = 3.0
    max_sample_gap_seconds: float = 0.75
    prolonged_closure_seconds: float = 3.0
    yaw_threshold_degrees: float = 20.0
    pitch_threshold_degrees: float = 15.0
    pose_exit_margin_degrees: float = 4.0
    pose_smoothing_alpha: float = 0.35
    distraction_seconds: float = 2.0


def load_dms_attention_config() -> DMSAttentionConfig:
    """Load bounded environment overrides without accepting unsafe values."""

    closed = _env_float("DMS_EAR_CLOSED_THRESHOLD", 0.21, 0.05, 0.5)
    opened = _env_float("DMS_EAR_OPEN_THRESHOLD", 0.23, closed, 0.6)
    return DMSAttentionConfig(
        eye_closed_threshold=closed,
        eye_open_threshold=opened,
        perclos_window_seconds=_env_float("DMS_PERCLOS_WINDOW_SECONDS", 30.0, 10.0, 120.0),
        perclos_threshold=_env_float("DMS_PERCLOS_THRESHOLD", 0.40, 0.1, 0.9),
        perclos_min_observation_seconds=_env_float(
            "DMS_PERCLOS_MIN_OBSERVATION_SECONDS", 3.0, 0.0, 20.0
        ),
        max_sample_gap_seconds=_env_float("DMS_MAX_SAMPLE_GAP_SECONDS", 0.75, 0.1, 3.0),
        prolonged_closure_seconds=_env_float(
            "DMS_PROLONGED_CLOSURE_SECONDS", 3.0, 1.0, 10.0
        ),
        yaw_threshold_degrees=_env_float("DMS_YAW_THRESHOLD_DEGREES", 20.0, 8.0, 50.0),
        pitch_threshold_degrees=_env_float(
            "DMS_PITCH_THRESHOLD_DEGREES", 15.0, 8.0, 45.0
        ),
        pose_exit_margin_degrees=_env_float(
            "DMS_POSE_EXIT_MARGIN_DEGREES", 4.0, 1.0, 10.0
        ),
        pose_smoothing_alpha=_env_float("DMS_POSE_SMOOTHING_ALPHA", 0.35, 0.05, 1.0),
        distraction_seconds=_env_float("DMS_DISTRACTION_SECONDS", 2.0, 0.5, 10.0),
    )
