from __future__ import annotations

from typing import Any, Iterable

import numpy as np

from .config import ADASConfig

LaneLine = tuple[tuple[float, float], tuple[float, float]]  # bottom, top


def _point(x: float, y: float, width: int, height: int) -> dict[str, float]:
    return {
        "x": round(max(0.0, min(1.0, x / width)), 5),
        "y": round(max(0.0, min(1.0, y / height)), 5),
    }


def build_lane_geometry(
    left: LaneLine | None,
    right: LaneLine | None,
    width: int,
    height: int,
    *,
    confidence: float = 0.0,
) -> dict[str, Any]:
    """Validate lane geometry and return normalized overlay coordinates."""
    empty = {
        "left_lane": [],
        "right_lane": [],
        "lane_center": [],
        "corridor": [],
        "confidence": 0.0,
        "status": "not_detected",
    }
    if width <= 0 or height <= 0:
        return {**empty, "status": "invalid_geometry"}
    if left is None and right is None:
        return empty

    if left is None or right is None:
        line = left or right
        assert line is not None
        key = "left_lane" if left is not None else "right_lane"
        return {
            **empty,
            key: [_point(*line[0], width, height), _point(*line[1], width, height)],
            "confidence": round(min(0.3, max(0.0, confidence)), 4),
            "status": "partial",
        }

    (lbx, lby), (ltx, lty) = left
    (rbx, rby), (rtx, rty) = right
    bottom_width = rbx - lbx
    top_width = rtx - ltx
    center_x = width / 2
    valid = (
        lby > lty
        and rby > rty
        and 0 <= lbx < rbx <= width
        and 0 <= ltx < rtx <= width
        and 0.18 * width <= bottom_width <= 0.95 * width
        and 0.04 * width <= top_width <= 0.75 * width
        and lbx < center_x < rbx
        and ltx >= lbx
        and rtx <= rbx
    )
    if not valid:
        return {**empty, "status": "invalid_geometry"}

    left_points = [_point(lbx, lby, width, height), _point(ltx, lty, width, height)]
    right_points = [_point(rbx, rby, width, height), _point(rtx, rty, width, height)]
    center_bottom = ((lbx + rbx) / 2, max(lby, rby))
    center_top = ((ltx + rtx) / 2, min(lty, rty))
    return {
        "left_lane": left_points,
        "right_lane": right_points,
        "lane_center": [
            _point(*center_bottom, width, height),
            _point(*center_top, width, height),
        ],
        "corridor": [left_points[1], right_points[1], right_points[0], left_points[0]],
        "confidence": round(max(0.0, min(1.0, confidence)), 4),
        "status": "detected",
    }


class LaneDetector:
    def __init__(self, config: ADASConfig):
        self.config = config
        self._previous_left: LaneLine | None = None
        self._previous_right: LaneLine | None = None
        self._missing_frames = 0

    def reset(self) -> None:
        self._previous_left = None
        self._previous_right = None
        self._missing_frames = 0

    def _fit_side(
        self,
        segments: Iterable[tuple[int, int, int, int]],
        frame_width: int,
        frame_height: int,
        side: str,
    ) -> LaneLine | None:
        points: list[tuple[float, float]] = []
        center_x = frame_width / 2
        for x1, y1, x2, y2 in segments:
            dx = x2 - x1
            if dx == 0:
                continue
            slope = (y2 - y1) / dx
            if abs(slope) < self.config.lane_min_abs_slope:
                continue
            midpoint = (x1 + x2) / 2
            if side == "left" and (slope >= 0 or midpoint >= center_x):
                continue
            if side == "right" and (slope <= 0 or midpoint <= center_x):
                continue
            points.extend(((float(x1), float(y1)), (float(x2), float(y2))))

        if len(points) < 4:
            return None
        ys = np.asarray([p[1] for p in points], dtype=np.float64)
        xs = np.asarray([p[0] for p in points], dtype=np.float64)
        try:
            x_from_y = np.polyfit(ys, xs, 1)
        except (TypeError, ValueError, np.linalg.LinAlgError):
            return None
        y_bottom = float(frame_height - 1)
        y_top = float(int(frame_height * self.config.lane_roi_top))
        x_bottom = float(np.polyval(x_from_y, y_bottom))
        x_top = float(np.polyval(x_from_y, y_top))
        return ((x_bottom, y_bottom), (x_top, y_top))

    def _smooth(self, previous: LaneLine | None, current: LaneLine | None) -> LaneLine | None:
        if current is None:
            return None
        if previous is None:
            return current
        alpha = self.config.lane_smoothing_alpha
        return tuple(
            (
                alpha * now[0] + (1 - alpha) * old[0],
                alpha * now[1] + (1 - alpha) * old[1],
            )
            for old, now in zip(previous, current)
        )  # type: ignore[return-value]

    def detect(self, frame: np.ndarray) -> dict[str, Any]:
        import cv2  # Lazy: health/startup does not load OpenCV solely for ADAS.

        if frame is None or frame.ndim != 3 or frame.shape[0] < 80 or frame.shape[1] < 120:
            return build_lane_geometry(None, None, 1, 1)
        height, width = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(
            blurred, self.config.lane_canny_low, self.config.lane_canny_high
        )
        mask = np.zeros_like(edges)
        polygon = np.asarray(
            [[
                (int(width * 0.06), height - 1),
                (int(width * 0.41), int(height * self.config.lane_roi_top)),
                (int(width * 0.59), int(height * self.config.lane_roi_top)),
                (int(width * 0.94), height - 1),
            ]],
            dtype=np.int32,
        )
        cv2.fillPoly(mask, polygon, 255)
        roi = cv2.bitwise_and(edges, mask)
        lines = cv2.HoughLinesP(
            roi,
            1,
            np.pi / 180,
            threshold=self.config.lane_hough_threshold,
            minLineLength=self.config.lane_min_line_length,
            maxLineGap=self.config.lane_max_line_gap,
        )
        segments = [] if lines is None else [tuple(map(int, line[0])) for line in lines]
        left_now = self._fit_side(segments, width, height, "left")
        right_now = self._fit_side(segments, width, height, "right")
        detected_count = int(left_now is not None) + int(right_now is not None)

        if detected_count == 2:
            left = self._smooth(self._previous_left, left_now)
            right = self._smooth(self._previous_right, right_now)
            support = min(1.0, len(segments) / 14.0)
            result = build_lane_geometry(
                left, right, width, height, confidence=0.55 + 0.4 * support
            )
            if result["status"] == "detected":
                self._previous_left, self._previous_right = left, right
                self._missing_frames = 0
            return result

        if detected_count == 1:
            left = self._smooth(self._previous_left, left_now) if left_now else None
            right = self._smooth(self._previous_right, right_now) if right_now else None
            if self._missing_frames < self.config.lane_hold_frames:
                left = left or self._previous_left
                right = right or self._previous_right
            result = build_lane_geometry(left, right, width, height, confidence=0.4)
            if result["status"] == "detected":
                result["status"] = "temporarily_lost"
                result["confidence"] = round(
                    max(0.2, 0.4 - self._missing_frames * 0.06), 4
                )
            self._missing_frames += 1
            return result

        self._missing_frames += 1
        if (
            self._previous_left
            and self._previous_right
            and self._missing_frames <= self.config.lane_hold_frames
        ):
            result = build_lane_geometry(
                self._previous_left,
                self._previous_right,
                width,
                height,
                confidence=max(0.12, 0.38 - self._missing_frames * 0.07),
            )
            result["status"] = "temporarily_lost"
            return result
        return build_lane_geometry(None, None, width, height)
