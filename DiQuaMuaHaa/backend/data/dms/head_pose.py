from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping

import numpy as np

from .eye_metrics import Point3D


POSE_LANDMARK_INDICES = (1, 152, 33, 263, 61, 291)
REQUIRED_POSE_INDICES = frozenset(POSE_LANDMARK_INDICES)
FACE_MODEL_POINTS = np.array(
    [
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0),
    ],
    dtype=np.float64,
)


@dataclass(frozen=True)
class PoseEstimate:
    yaw: float
    pitch: float
    roll: float
    confidence: float


def camera_matrix(width: int, height: int) -> np.ndarray:
    focal_length = float(width)
    return np.array(
        [[focal_length, 0.0, width / 2.0], [0.0, focal_length, height / 2.0], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )


class HeadPoseEstimator:
    """Six-point solvePnP head pose in degrees; failure never fabricates forward."""

    def __init__(self, cv_module: Any | None = None):
        self._cv = cv_module

    def estimate(
        self, points: Mapping[int, Point3D], frame_width: int, frame_height: int
    ) -> PoseEstimate | None:
        if frame_width <= 0 or frame_height <= 0:
            return None
        try:
            normalized = np.array(
                [(points[index][0], points[index][1]) for index in POSE_LANDMARK_INDICES],
                dtype=np.float64,
            )
        except (KeyError, TypeError, ValueError, IndexError):
            return None
        if normalized.shape != (6, 2) or not np.isfinite(normalized).all():
            return None
        if (normalized < -0.2).any() or (normalized > 1.2).any():
            return None
        face_width = abs(normalized[3, 0] - normalized[2, 0])
        face_height = abs(normalized[1, 1] - (normalized[2, 1] + normalized[3, 1]) / 2.0)
        if face_width < 0.035 or face_height < 0.04:
            return None

        image_points = normalized * np.array([frame_width, frame_height], dtype=np.float64)
        cv = self._cv
        if cv is None:
            import cv2 as cv  # noqa: PLC0415
        try:
            success, rotation_vector, translation_vector = cv.solvePnP(
                FACE_MODEL_POINTS,
                image_points,
                camera_matrix(frame_width, frame_height),
                np.zeros((4, 1), dtype=np.float64),
                flags=cv.SOLVEPNP_ITERATIVE,
            )
            if not success:
                return None
            rotation_matrix, _ = cv.Rodrigues(rotation_vector)
            angles = cv.RQDecomp3x3(rotation_matrix)[0]
            pitch, yaw, roll = (float(angles[0]), float(angles[1]), float(angles[2]))
        except Exception:
            return None
        if not all(math.isfinite(value) for value in (yaw, pitch, roll)):
            return None
        confidence = min(1.0, max(0.0, (face_width - 0.035) / 0.12))
        return PoseEstimate(yaw=yaw, pitch=pitch, roll=roll, confidence=confidence)


def classify_direction(
    yaw: float,
    pitch: float,
    yaw_threshold: float,
    pitch_threshold: float,
) -> str:
    """Classify the dominant threshold excursion using camera-space angles."""

    yaw_score = abs(yaw) / yaw_threshold
    pitch_score = abs(pitch) / pitch_threshold
    if yaw_score < 1.0 and pitch_score < 1.0:
        return "FORWARD"
    if yaw_score >= pitch_score:
        return "RIGHT" if yaw > 0 else "LEFT"
    return "DOWN" if pitch > 0 else "UP"


class HeadPoseTracker:
    """EMA smoothing plus exit hysteresis for stable direction labels."""

    def __init__(
        self,
        yaw_threshold: float,
        pitch_threshold: float,
        exit_margin: float,
        smoothing_alpha: float,
    ):
        self.yaw_threshold = yaw_threshold
        self.pitch_threshold = pitch_threshold
        self.exit_margin = exit_margin
        self.alpha = smoothing_alpha
        self._pose: PoseEstimate | None = None
        self.direction = "UNKNOWN"

    def reset(self) -> None:
        self._pose = None
        self.direction = "UNKNOWN"

    def update(self, estimate: PoseEstimate | None) -> tuple[PoseEstimate | None, str]:
        if estimate is None:
            self.reset()
            return None, "UNKNOWN"
        if self._pose is None:
            smoothed = estimate
        else:
            a = self.alpha
            smoothed = PoseEstimate(
                yaw=a * estimate.yaw + (1.0 - a) * self._pose.yaw,
                pitch=a * estimate.pitch + (1.0 - a) * self._pose.pitch,
                roll=a * estimate.roll + (1.0 - a) * self._pose.roll,
                confidence=a * estimate.confidence + (1.0 - a) * self._pose.confidence,
            )
        self._pose = smoothed
        if self._inside_current_hysteresis(smoothed):
            return smoothed, self.direction
        self.direction = classify_direction(
            smoothed.yaw, smoothed.pitch, self.yaw_threshold, self.pitch_threshold
        )
        return smoothed, self.direction

    def _inside_current_hysteresis(self, pose: PoseEstimate) -> bool:
        yaw_exit = max(0.0, self.yaw_threshold - self.exit_margin)
        pitch_exit = max(0.0, self.pitch_threshold - self.exit_margin)
        return (
            (self.direction == "LEFT" and pose.yaw <= -yaw_exit)
            or (self.direction == "RIGHT" and pose.yaw >= yaw_exit)
            or (self.direction == "UP" and pose.pitch <= -pitch_exit)
            or (self.direction == "DOWN" and pose.pitch >= pitch_exit)
        )
