from __future__ import annotations

from typing import Any

from .config import ADASConfig


DECISIONS = {
    "KEEP_LANE",
    "SLOW_DOWN",
    "STOP",
    "SHIFT_LEFT",
    "SHIFT_RIGHT",
    "UNKNOWN",
}


class SimulatedPathPlanner:
    """Produces visualization suggestions, never actuator commands."""

    def __init__(self, config: ADASConfig):
        self.config = config

    def decide(self, lane: dict[str, Any], risk: dict[str, Any]) -> str:
        if lane.get("confidence", 0.0) < self.config.planner_min_lane_confidence:
            return "UNKNOWN"
        if risk.get("level") == "UNCERTAIN":
            return "UNKNOWN"
        if not risk.get("obstacles") or risk.get("level") == "LOW":
            return "KEEP_LANE"
        if risk.get("level") == "MEDIUM" or not risk.get("corridor_blocked"):
            return "SLOW_DOWN"

        side_risk = risk.get("side_risk") or {}
        left = float(side_risk.get("left", 1.0))
        right = float(side_risk.get("right", 1.0))
        if left <= self.config.side_safe_score and left <= right:
            return "SHIFT_LEFT"
        if right <= self.config.side_safe_score:
            return "SHIFT_RIGHT"
        return "STOP"

    @staticmethod
    def _quadratic_points(
        start: tuple[float, float],
        control: tuple[float, float],
        end: tuple[float, float],
        count: int = 18,
    ) -> list[dict[str, float]]:
        points = []
        for index in range(count):
            t = index / (count - 1)
            one_minus = 1 - t
            x = one_minus * one_minus * start[0] + 2 * one_minus * t * control[0] + t * t * end[0]
            y = one_minus * one_minus * start[1] + 2 * one_minus * t * control[1] + t * t * end[1]
            points.append({"x": round(x, 5), "y": round(y, 5)})
        return points

    def visualize(self, decision: str, lane: dict[str, Any]) -> dict[str, Any]:
        center = lane.get("lane_center") or []
        target_x = center[1]["x"] if len(center) == 2 else 0.5
        start = (0.5, 0.96)
        end_y = center[1]["y"] if len(center) == 2 else 0.55
        stop_marker = None

        if decision == "SHIFT_LEFT":
            end = (max(0.08, target_x - 0.16), end_y)
            control = (0.39, 0.72)
        elif decision == "SHIFT_RIGHT":
            end = (min(0.92, target_x + 0.16), end_y)
            control = (0.61, 0.72)
        elif decision == "STOP":
            end = (0.5, 0.72)
            control = (0.5, 0.84)
            stop_marker = {"x": 0.5, "y": 0.69}
        elif decision == "UNKNOWN":
            return {"points": [], "stop_marker": None, "style": "uncertain"}
        else:
            end = (target_x, end_y)
            control = ((start[0] + target_x) / 2, 0.72)

        return {
            "points": self._quadratic_points(start, control, end),
            "stop_marker": stop_marker,
            "style": "simulated",
        }
