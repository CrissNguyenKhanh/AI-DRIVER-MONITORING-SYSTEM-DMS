from __future__ import annotations

from time import perf_counter
from typing import Any

import numpy as np

from .config import ADASConfig
from .lane_detector import LaneDetector
from .obstacle_detector import RoadObjectDetector
from .path_planner import SimulatedPathPlanner
from .risk_analyzer import RoadRiskAnalyzer


class ADASPipeline:
    def __init__(
        self,
        config: ADASConfig,
        *,
        lane_detector: LaneDetector | None = None,
        obstacle_detector: RoadObjectDetector | None = None,
    ):
        self.config = config
        self.lane_detector = lane_detector or LaneDetector(config)
        self.obstacle_detector = obstacle_detector or RoadObjectDetector(config)
        self.risk_analyzer = RoadRiskAnalyzer(config)
        self.path_planner = SimulatedPathPlanner(config)
        self._frame_index = 0
        self._cached_detections: list[dict[str, Any]] = []
        self._object_status = self.obstacle_detector.status()

    def reset(self) -> None:
        self.lane_detector.reset()
        self._frame_index = 0
        self._cached_detections = []
        self._object_status = self.obstacle_detector.status()

    def process(self, frame: np.ndarray, *, reset: bool = False) -> dict[str, Any]:
        import cv2

        if reset:
            self.reset()
        started = perf_counter()
        height, width = frame.shape[:2]
        scale = min(1.0, self.config.max_processing_width / width)
        if scale < 1.0:
            frame = cv2.resize(
                frame,
                (int(width * scale), int(height * scale)),
                interpolation=cv2.INTER_AREA,
            )

        lane = self.lane_detector.detect(frame)
        run_objects = self._frame_index % self.config.object_inference_interval == 0
        if run_objects:
            self._cached_detections, self._object_status = self.obstacle_detector.detect(frame)
        risk = self.risk_analyzer.analyze(lane, self._cached_detections)
        decision = self.path_planner.decide(lane, risk)
        path = self.path_planner.visualize(decision, lane)
        self._frame_index += 1

        latency_ms = (perf_counter() - started) * 1000
        return {
            "simulation_only": True,
            "lane": lane,
            "detections": risk["obstacles"],
            "object_detector": self._object_status,
            "risk": {
                key: value
                for key, value in risk.items()
                if key not in ("obstacles", "side_risk")
            },
            "side_risk": risk["side_risk"],
            "decision": decision,
            "planned_path": path,
            "metrics": {
                "latency_ms": round(latency_ms, 2),
                "processing_fps": round(1000 / latency_ms, 2) if latency_ms > 0 else None,
                "object_inference_ran": run_objects,
                "frame_index": self._frame_index,
            },
        }
