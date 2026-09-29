from __future__ import annotations

from typing import Any

from .config import ADASConfig


def _line_x_at_y(line: list[dict[str, float]], y: float) -> float:
    bottom, top = line[0], line[1]
    delta_y = bottom["y"] - top["y"]
    if abs(delta_y) < 1e-6:
        return (bottom["x"] + top["x"]) / 2
    ratio = (y - top["y"]) / delta_y
    ratio = max(0.0, min(1.0, ratio))
    return top["x"] + ratio * (bottom["x"] - top["x"])


class RoadRiskAnalyzer:
    def __init__(self, config: ADASConfig):
        self.config = config

    def analyze(
        self, lane: dict[str, Any], detections: list[dict[str, Any]]
    ) -> dict[str, Any]:
        lane_valid = (
            len(lane.get("left_lane", [])) == 2
            and len(lane.get("right_lane", [])) == 2
            and lane.get("confidence", 0.0) >= self.config.planner_min_lane_confidence
        )
        if not lane_valid:
            return {
                "level": "UNCERTAIN",
                "score": 0.0,
                "reason": "lane_geometry_uncertain",
                "obstacles": [
                    {**detection, "lane_zone": "unknown", "risk_score": 0.0}
                    for detection in detections
                ],
                "corridor_blocked": False,
                "side_risk": {"left": 1.0, "right": 1.0},
            }

        enriched: list[dict[str, Any]] = []
        highest = 0.0
        corridor_blocked = False
        side_risk = {"left": 0.0, "right": 0.0}
        center_line = lane["lane_center"]

        for detection in detections:
            bbox = detection.get("bbox") or {}
            x = float(bbox.get("x", 0.0))
            y = float(bbox.get("y", 0.0))
            box_width = max(0.0, float(bbox.get("width", 0.0)))
            box_height = max(0.0, float(bbox.get("height", 0.0)))
            center_x = x + box_width / 2
            bottom_y = min(1.0, y + box_height)
            left_x = _line_x_at_y(lane["left_lane"], bottom_y)
            right_x = _line_x_at_y(lane["right_lane"], bottom_y)
            lane_center_x = _line_x_at_y(center_line, bottom_y)

            if left_x <= center_x <= right_x:
                zone = "corridor"
                zone_weight = 0.34
            elif left_x - self.config.near_lane_margin <= center_x < left_x:
                zone = "near_left"
                zone_weight = 0.16
            elif right_x < center_x <= right_x + self.config.near_lane_margin:
                zone = "near_right"
                zone_weight = 0.16
            else:
                zone = "outside"
                zone_weight = 0.03

            area = min(1.0, (box_width * box_height) / 0.12)
            vertical = max(0.0, min(1.0, (bottom_y - 0.45) / 0.55))
            score = min(1.0, zone_weight + 0.34 * area + 0.32 * vertical)
            if zone == "outside":
                score = min(score, 0.3)
            score = round(score, 4)
            highest = max(highest, score)
            if zone == "corridor" and score >= self.config.danger_score:
                corridor_blocked = True
            elif center_x < lane_center_x:
                side_risk["left"] = max(side_risk["left"], score)
            elif center_x > lane_center_x:
                side_risk["right"] = max(side_risk["right"], score)

            if score >= self.config.danger_score:
                object_level = "DANGER"
            elif score >= self.config.caution_score:
                object_level = "CAUTION"
            else:
                object_level = "SAFE"
            enriched.append(
                {
                    **detection,
                    "lane_zone": zone,
                    "risk_score": score,
                    "risk_level": object_level,
                }
            )

        if highest >= self.config.danger_score:
            level = "HIGH"
        elif highest >= self.config.caution_score:
            level = "MEDIUM"
        else:
            level = "LOW"
        return {
            "level": level,
            "score": round(highest, 4),
            "reason": "image_space_analysis",
            "obstacles": enriched,
            "corridor_blocked": corridor_blocked,
            "side_risk": {key: round(value, 4) for key, value in side_risk.items()},
        }
