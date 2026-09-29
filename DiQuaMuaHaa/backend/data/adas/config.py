from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class ADASConfig:
    max_processing_width: int = 960
    max_frame_chars: int = 4_000_000
    max_input_pixels: int = 4_000_000
    object_inference_interval: int = 3
    object_confidence: float = 0.35
    object_image_size: int = 640
    lane_roi_top: float = 0.56
    lane_canny_low: int = 60
    lane_canny_high: int = 160
    lane_hough_threshold: int = 28
    lane_min_line_length: int = 28
    lane_max_line_gap: int = 55
    lane_min_abs_slope: float = 0.45
    lane_smoothing_alpha: float = 0.28
    lane_hold_frames: int = 4
    planner_min_lane_confidence: float = 0.45
    near_lane_margin: float = 0.08
    caution_score: float = 0.42
    danger_score: float = 0.70
    side_safe_score: float = 0.38
    object_model_path: Path = Path("road_yolo.pt")
    object_detector_enabled: bool = True
    road_classes: tuple[str, ...] = (
        "person",
        "bicycle",
        "motorcycle",
        "car",
        "bus",
        "truck",
    )


def load_adas_config(base_dir: Path) -> ADASConfig:
    configured_model = os.getenv("ADAS_OBJECT_MODEL_PATH", "").strip()
    model_path = (
        Path(configured_model).expanduser()
        if configured_model
        else base_dir / "driver_training" / "models" / "road_yolo.pt"
    )
    if not model_path.is_absolute():
        model_path = base_dir / model_path

    return ADASConfig(
        max_processing_width=_env_int("ADAS_MAX_PROCESSING_WIDTH", 960, 320, 1280),
        max_frame_chars=_env_int("ADAS_MAX_FRAME_CHARS", 4_000_000, 250_000, 8_000_000),
        object_inference_interval=_env_int("ADAS_OBJECT_INTERVAL", 3, 1, 12),
        object_confidence=_env_float("ADAS_OBJECT_CONFIDENCE", 0.35, 0.1, 0.95),
        lane_smoothing_alpha=_env_float("ADAS_LANE_SMOOTHING", 0.28, 0.05, 1.0),
        planner_min_lane_confidence=_env_float(
            "ADAS_MIN_LANE_CONFIDENCE", 0.45, 0.1, 0.95
        ),
        object_model_path=model_path.resolve(),
        object_detector_enabled=os.getenv("DISABLE_ADAS_OBJECT_DETECTOR", "0") != "1",
    )
