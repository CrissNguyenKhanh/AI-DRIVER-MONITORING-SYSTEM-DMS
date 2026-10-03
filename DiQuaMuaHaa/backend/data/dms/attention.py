from __future__ import annotations

import math
import threading
import time
from collections.abc import Mapping, Sequence
from typing import Any

from .config import DMSAttentionConfig
from .eye_metrics import (
    REQUIRED_EYE_INDICES,
    EyeStateTracker,
    Point3D,
    compute_eye_metrics,
)
from .head_pose import (
    REQUIRED_POSE_INDICES,
    HeadPoseEstimator,
    HeadPoseTracker,
)
from .perclos import PerclosResult, TimestampPerclos


REQUIRED_ATTENTION_INDICES = REQUIRED_EYE_INDICES | REQUIRED_POSE_INDICES


def parse_landmark_payload(raw_landmarks: Any) -> dict[int, Point3D]:
    """Parse the compact [{index,x,y,z}] client schema with strict bounds."""

    if not isinstance(raw_landmarks, Sequence) or isinstance(raw_landmarks, (str, bytes)):
        raise ValueError("landmarks must be an array")
    if len(raw_landmarks) > 64:
        raise ValueError("too many landmarks")
    parsed: dict[int, Point3D] = {}
    for item in raw_landmarks:
        if not isinstance(item, Mapping):
            raise ValueError("each landmark must be an object")
        try:
            index = int(item["index"])
            point = (float(item["x"]), float(item["y"]), float(item.get("z", 0.0)))
        except (KeyError, TypeError, ValueError, OverflowError) as error:
            raise ValueError("invalid landmark") from error
        if index not in REQUIRED_ATTENTION_INDICES:
            continue
        if not all(math.isfinite(value) for value in point):
            raise ValueError("invalid landmark coordinate")
        parsed[index] = point
    return parsed


class AttentionAnalyzer:
    """Stateful timestamp-driven driver attention analysis for one camera stream."""

    def __init__(
        self,
        config: DMSAttentionConfig,
        pose_estimator: HeadPoseEstimator | None = None,
    ):
        self.config = config
        self.eye_tracker = EyeStateTracker(
            config.eye_closed_threshold, config.eye_open_threshold
        )
        self.perclos = TimestampPerclos(
            config.perclos_window_seconds,
            config.perclos_min_observation_seconds,
            config.max_sample_gap_seconds,
        )
        self.pose_estimator = pose_estimator or HeadPoseEstimator()
        self.pose_tracker = HeadPoseTracker(
            config.yaw_threshold_degrees,
            config.pitch_threshold_degrees,
            config.pose_exit_margin_degrees,
            config.pose_smoothing_alpha,
        )
        self._closed_since: float | None = None
        self._away_since: float | None = None

    def reset(self) -> None:
        self.eye_tracker.reset()
        self.perclos.reset()
        self.pose_tracker.reset()
        self._closed_since = None
        self._away_since = None

    def update(
        self,
        points: Mapping[int, Point3D],
        timestamp_seconds: float,
        frame_width: int,
        frame_height: int,
        *,
        face_detected: bool = True,
    ) -> dict[str, Any]:
        if not math.isfinite(timestamp_seconds) or timestamp_seconds < 0:
            raise ValueError("invalid timestamp")
        if not face_detected:
            return self._unknown(timestamp_seconds, "face_not_detected")

        eye = compute_eye_metrics(points)
        if eye is None:
            return self._unknown(timestamp_seconds, "eye_landmarks_invalid")
        eye_state = self.eye_tracker.update(eye.average_ear)
        is_closed = eye_state == "CLOSED"
        perclos = self.perclos.update(timestamp_seconds, is_closed)
        if is_closed:
            if self._closed_since is None:
                self._closed_since = timestamp_seconds
        else:
            self._closed_since = None
        closed_duration = (
            max(0.0, timestamp_seconds - self._closed_since)
            if self._closed_since is not None
            else 0.0
        )

        raw_pose = self.pose_estimator.estimate(points, frame_width, frame_height)
        pose, direction = self.pose_tracker.update(raw_pose)
        if pose is None:
            self._away_since = None
            return self._result(
                eye,
                eye_state,
                perclos,
                closed_duration,
                None,
                "UNKNOWN",
                "UNKNOWN",
                0.0,
                "UNKNOWN",
                "head_pose_unavailable",
            )

        distraction_state, distraction_duration = self._update_distraction(
            direction, timestamp_seconds
        )
        drowsy = (
            closed_duration >= self.config.prolonged_closure_seconds
            or (perclos.value is not None and perclos.value >= self.config.perclos_threshold)
        )
        distracted = distraction_state == "DISTRACTED"
        if drowsy and distracted:
            attention_state = "HIGH_RISK"
        elif drowsy:
            attention_state = "DROWSY"
        elif distracted:
            attention_state = "DISTRACTED"
        else:
            attention_state = "NORMAL"
        confidence = min(1.0, max(0.0, pose.confidence))
        return self._result(
            eye,
            eye_state,
            perclos,
            closed_duration,
            pose,
            direction,
            distraction_state,
            distraction_duration,
            attention_state,
            None,
            confidence,
        )

    def _unknown(self, timestamp: float, reason: str) -> dict[str, Any]:
        perclos = self.perclos.mark_missing(timestamp)
        self.eye_tracker.reset()
        self.pose_tracker.reset()
        self._closed_since = None
        self._away_since = None
        return self._result(
            None, "UNKNOWN", perclos, 0.0, None, "UNKNOWN", "UNKNOWN", 0.0,
            "UNKNOWN", reason,
        )

    def _update_distraction(self, direction: str, timestamp: float) -> tuple[str, float]:
        if direction == "FORWARD":
            self._away_since = None
            return "FORWARD", 0.0
        if direction == "UNKNOWN":
            self._away_since = None
            return "UNKNOWN", 0.0
        if self._away_since is None:
            self._away_since = timestamp
        duration = max(0.0, timestamp - self._away_since)
        state = "DISTRACTED" if duration >= self.config.distraction_seconds else "SHORT_GLANCE"
        return state, duration

    def _result(
        self,
        eye: Any,
        eye_state: str,
        perclos: PerclosResult,
        closed_duration: float,
        pose: Any,
        direction: str,
        distraction_state: str,
        distraction_duration: float,
        attention_state: str,
        reason: str | None,
        confidence: float = 0.0,
    ) -> dict[str, Any]:
        return {
            "ear": {
                "left": round(eye.left_ear, 4) if eye else None,
                "right": round(eye.right_ear, 4) if eye else None,
                "average": round(eye.average_ear, 4) if eye else None,
            },
            "eye_state": eye_state,
            "perclos": round(perclos.value, 4) if perclos.value is not None else None,
            "perclos_observed_seconds": round(perclos.observed_seconds, 3),
            "perclos_window_seconds": self.config.perclos_window_seconds,
            "eye_closed_duration_seconds": round(closed_duration, 3),
            "head_pose": {
                "yaw": round(pose.yaw, 2) if pose else None,
                "pitch": round(pose.pitch, 2) if pose else None,
                "roll": round(pose.roll, 2) if pose else None,
                "confidence": round(pose.confidence, 3) if pose else 0.0,
            },
            "direction": direction,
            "distraction": {
                "state": distraction_state,
                "duration_seconds": round(distraction_duration, 3),
            },
            "attention_state": attention_state,
            "confidence": round(confidence, 3),
            "reason": reason,
            "thresholds": {
                "ear_closed": self.config.eye_closed_threshold,
                "perclos": self.config.perclos_threshold,
                "prolonged_closure_seconds": self.config.prolonged_closure_seconds,
                "yaw_degrees": self.config.yaw_threshold_degrees,
                "pitch_degrees": self.config.pitch_threshold_degrees,
                "distraction_seconds": self.config.distraction_seconds,
            },
        }


class AttentionRegistry:
    """Bounded thread-safe analyzer ownership for authenticated camera streams."""

    def __init__(
        self,
        config: DMSAttentionConfig,
        *,
        ttl_seconds: float = 90.0,
        max_streams: int = 128,
    ):
        self.config = config
        self.ttl_seconds = ttl_seconds
        self.max_streams = max_streams
        self._items: dict[str, tuple[AttentionAnalyzer, float]] = {}
        self._lock = threading.Lock()

    def analyze(
        self,
        key: str,
        points: Mapping[int, Point3D],
        timestamp_seconds: float,
        frame_width: int,
        frame_height: int,
        *,
        face_detected: bool,
        reset: bool = False,
    ) -> dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            item = self._items.get(key)
            if item is None or reset:
                analyzer = AttentionAnalyzer(self.config)
            else:
                analyzer = item[0]
            result = analyzer.update(
                points,
                timestamp_seconds,
                frame_width,
                frame_height,
                face_detected=face_detected,
            )
            self._items[key] = (analyzer, now)
            if len(self._items) > self.max_streams:
                oldest = min(self._items, key=lambda stream: self._items[stream][1])
                if oldest != key:
                    self._items.pop(oldest, None)
            return result

    def reset(self, key: str) -> None:
        with self._lock:
            self._items.pop(key, None)

    def _prune(self, now: float) -> None:
        expired = [
            key for key, (_analyzer, last_seen) in self._items.items()
            if now - last_seen > self.ttl_seconds
        ]
        for key in expired:
            self._items.pop(key, None)
