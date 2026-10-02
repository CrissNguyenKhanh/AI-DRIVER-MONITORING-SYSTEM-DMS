from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence


Point3D = tuple[float, float, float]

LEFT_EYE_INDICES = (33, 160, 158, 133, 153, 144)
RIGHT_EYE_INDICES = (362, 385, 387, 263, 373, 380)
REQUIRED_EYE_INDICES = frozenset(LEFT_EYE_INDICES + RIGHT_EYE_INDICES)


@dataclass(frozen=True)
class EyeMetrics:
    left_ear: float
    right_ear: float
    average_ear: float


def _distance(a: Point3D, b: Point3D) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def eye_aspect_ratio(points: Mapping[int, Point3D], indices: Sequence[int]) -> float | None:
    """Return the standard six-point EAR, or None for incomplete/degenerate input."""

    try:
        p1, p2, p3, p4, p5, p6 = (points[index] for index in indices)
    except (KeyError, TypeError, ValueError):
        return None
    values = (*p1, *p2, *p3, *p4, *p5, *p6)
    if not all(math.isfinite(value) for value in values):
        return None
    horizontal = _distance(p1, p4)
    if horizontal <= 1e-6:
        return None
    ear = (_distance(p2, p6) + _distance(p3, p5)) / (2.0 * horizontal)
    return ear if 0.0 <= ear <= 1.0 else None


def compute_eye_metrics(points: Mapping[int, Point3D]) -> EyeMetrics | None:
    left = eye_aspect_ratio(points, LEFT_EYE_INDICES)
    right = eye_aspect_ratio(points, RIGHT_EYE_INDICES)
    if left is None or right is None:
        return None
    return EyeMetrics(left_ear=left, right_ear=right, average_ear=(left + right) / 2.0)


class EyeStateTracker:
    """Apply EAR hysteresis so values near the threshold do not flicker."""

    def __init__(self, closed_threshold: float, open_threshold: float):
        if open_threshold < closed_threshold:
            raise ValueError("open_threshold must be >= closed_threshold")
        self.closed_threshold = closed_threshold
        self.open_threshold = open_threshold
        self.state = "UNKNOWN"

    def reset(self) -> None:
        self.state = "UNKNOWN"

    def update(self, average_ear: float | None) -> str:
        if average_ear is None or not math.isfinite(average_ear):
            self.state = "UNKNOWN"
        elif average_ear <= self.closed_threshold:
            self.state = "CLOSED"
        elif average_ear >= self.open_threshold:
            self.state = "OPEN"
        elif self.state not in {"OPEN", "CLOSED"}:
            self.state = "UNKNOWN"
        return self.state
