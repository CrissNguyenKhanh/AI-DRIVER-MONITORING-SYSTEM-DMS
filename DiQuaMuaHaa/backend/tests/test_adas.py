"""Offline unit tests for the visualization-only road ADAS pipeline."""
import base64
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np

from data.adas.config import ADASConfig
from data.adas.lane_detector import LaneDetector, build_lane_geometry
from data.adas.obstacle_detector import RoadObjectDetector
from data.adas.path_planner import SimulatedPathPlanner
from data.adas.pipeline import ADASPipeline
from data.adas.risk_analyzer import RoadRiskAnalyzer
from data.api import api


LEFT = ((120.0, 359.0), (280.0, 200.0))
RIGHT = ((520.0, 359.0), (360.0, 200.0))


def valid_lane(confidence=0.9):
    return build_lane_geometry(LEFT, RIGHT, 640, 360, confidence=confidence)


def detection(x, y, width, height, label="car"):
    return {
        "class": label,
        "confidence": 0.9,
        "bbox": {"x": x, "y": y, "width": width, "height": height},
        "center": {"x": x + width / 2, "y": y + height / 2},
    }


class LaneGeometryTests(unittest.TestCase):
    def test_valid_left_and_right_lanes_build_corridor(self):
        lane = valid_lane()
        self.assertEqual(lane["status"], "detected")
        self.assertEqual(len(lane["corridor"]), 4)
        self.assertAlmostEqual(lane["lane_center"][0]["x"], 0.5, places=2)

    def test_missing_left_missing_right_and_no_lane_are_safe(self):
        missing_left = build_lane_geometry(None, RIGHT, 640, 360, confidence=0.5)
        missing_right = build_lane_geometry(LEFT, None, 640, 360, confidence=0.5)
        no_lane = build_lane_geometry(None, None, 640, 360)
        self.assertEqual(missing_left["status"], "partial")
        self.assertEqual(missing_right["status"], "partial")
        self.assertEqual(no_lane["status"], "not_detected")
        self.assertEqual(no_lane["corridor"], [])

    def test_invalid_crossing_geometry_is_rejected(self):
        invalid_left = ((120.0, 359.0), (390.0, 200.0))
        invalid_right = ((520.0, 359.0), (330.0, 200.0))
        lane = build_lane_geometry(invalid_left, invalid_right, 640, 360, confidence=0.9)
        self.assertEqual(lane["status"], "invalid_geometry")
        self.assertEqual(lane["confidence"], 0.0)

    def test_opencv_lane_detection_and_temporary_loss_do_not_crash(self):
        frame = np.zeros((360, 640, 3), dtype=np.uint8)
        cv2.line(frame, (120, 359), (280, 200), (255, 255, 255), 8)
        cv2.line(frame, (520, 359), (360, 200), (255, 255, 255), 8)
        detector = LaneDetector(ADASConfig())
        detected = detector.detect(frame)
        held = detector.detect(np.zeros_like(frame))
        self.assertEqual(detected["status"], "detected")
        self.assertEqual(held["status"], "temporarily_lost")
        self.assertLess(held["confidence"], detected["confidence"])


class RiskAnalyzerTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = RoadRiskAnalyzer(ADASConfig())

    def test_obstacle_outside_lane_is_low_risk(self):
        risk = self.analyzer.analyze(valid_lane(), [detection(0.02, 0.35, 0.08, 0.12)])
        self.assertEqual(risk["level"], "LOW")
        self.assertEqual(risk["obstacles"][0]["lane_zone"], "outside")

    def test_large_center_obstacle_is_danger(self):
        risk = self.analyzer.analyze(valid_lane(), [detection(0.36, 0.5, 0.28, 0.45)])
        self.assertEqual(risk["level"], "HIGH")
        self.assertTrue(risk["corridor_blocked"])
        self.assertEqual(risk["obstacles"][0]["risk_level"], "DANGER")

    def test_missing_lane_is_uncertain(self):
        risk = self.analyzer.analyze(
            build_lane_geometry(None, None, 640, 360),
            [detection(0.4, 0.5, 0.2, 0.3)],
        )
        self.assertEqual(risk["level"], "UNCERTAIN")
        self.assertEqual(risk["reason"], "lane_geometry_uncertain")


class SimulatedPlannerTests(unittest.TestCase):
    def setUp(self):
        self.planner = SimulatedPathPlanner(ADASConfig())
        self.lane = valid_lane()

    @staticmethod
    def risk(level, blocked=False, left=0.0, right=0.0, objects=True):
        return {
            "level": level,
            "corridor_blocked": blocked,
            "side_risk": {"left": left, "right": right},
            "obstacles": [{}] if objects else [],
        }

    def test_clear_corridor_keeps_lane(self):
        self.assertEqual(
            self.planner.decide(self.lane, self.risk("LOW", objects=False)),
            "KEEP_LANE",
        )

    def test_blocked_center_selects_safe_left_or_right(self):
        self.assertEqual(
            self.planner.decide(self.lane, self.risk("HIGH", True, 0.1, 0.8)),
            "SHIFT_LEFT",
        )
        self.assertEqual(
            self.planner.decide(self.lane, self.risk("HIGH", True, 0.8, 0.1)),
            "SHIFT_RIGHT",
        )

    def test_both_sides_unsafe_stops(self):
        self.assertEqual(
            self.planner.decide(self.lane, self.risk("HIGH", True, 0.8, 0.9)),
            "STOP",
        )
        path = self.planner.visualize("STOP", self.lane)
        self.assertIsNotNone(path["stop_marker"])

    def test_insufficient_lane_confidence_is_unknown(self):
        uncertain_lane = {**self.lane, "confidence": 0.2}
        self.assertEqual(
            self.planner.decide(uncertain_lane, self.risk("HIGH", True)),
            "UNKNOWN",
        )


class ModelAvailabilityTests(unittest.TestCase):
    def test_missing_object_model_never_calls_loader_or_crashes_pipeline(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            loader = MagicMock()
            config = replace(
                ADASConfig(), object_model_path=Path(temp_dir) / "missing-road-model.pt"
            )
            obstacle_detector = RoadObjectDetector(config, model_loader=loader)
            detections, status = obstacle_detector.detect(
                np.zeros((360, 640, 3), dtype=np.uint8)
            )
            self.assertEqual(detections, [])
            self.assertEqual(status["reason"], "model_missing")
            loader.assert_not_called()

            pipeline = ADASPipeline(config, obstacle_detector=obstacle_detector)
            result = pipeline.process(np.zeros((360, 640, 3), dtype=np.uint8))
            self.assertTrue(result["simulation_only"])
            self.assertEqual(result["object_detector"]["reason"], "model_missing")


class ADASApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    @staticmethod
    def encoded_frame():
        frame = np.zeros((180, 320, 3), dtype=np.uint8)
        ok, encoded = cv2.imencode(".jpg", frame)
        assert ok
        return "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii")

    def test_endpoint_requires_authentication(self):
        response = self.client.post("/api/adas/process-frame", json={"image": "invalid"})
        self.assertEqual(response.status_code, 401)

    def test_invalid_frame_is_safe_and_valid_frame_is_processed(self):
        principal = api.Principal(role="driver", driver_id="driver-a")
        with patch.object(api, "_authenticate_request", return_value=principal):
            invalid = self.client.post(
                "/api/adas/process-frame", json={"image": "not-base64"}
            )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.json["error"], "invalid frame")

        expected = {"simulation_only": True, "decision": "KEEP_LANE"}
        with patch.object(api, "_authenticate_request", return_value=principal), \
                patch.object(api.adas_pipeline, "process", return_value=expected) as process:
            response = self.client.post(
                "/api/adas/process-frame",
                json={"image": self.encoded_frame(), "reset": True},
            )
        self.assertEqual(response.status_code, 200, response.json)
        self.assertTrue(response.json["simulation_only"])
        process.assert_called_once()

    def test_busy_processor_drops_frame_instead_of_queueing(self):
        principal = api.Principal(role="driver", driver_id="driver-a")
        api._adas_processing_lock.acquire()
        try:
            with patch.object(api, "_authenticate_request", return_value=principal):
                response = self.client.post(
                    "/api/adas/process-frame", json={"image": self.encoded_frame()}
                )
        finally:
            api._adas_processing_lock.release()
        self.assertEqual(response.status_code, 429)


if __name__ == "__main__":
    unittest.main()
