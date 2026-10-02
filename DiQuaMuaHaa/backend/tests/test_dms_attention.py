"""Offline deterministic tests for head pose, PERCLOS, and attention state."""

import unittest
from dataclasses import replace
from unittest.mock import MagicMock, patch

import cv2
import numpy as np

from data.api import api
from data.auth import Principal
from data.dms.attention import AttentionAnalyzer, parse_landmark_payload
from data.dms.config import DMSAttentionConfig
from data.dms.eye_metrics import (
    LEFT_EYE_INDICES,
    RIGHT_EYE_INDICES,
    compute_eye_metrics,
    eye_aspect_ratio,
)
from data.dms.head_pose import (
    FACE_MODEL_POINTS,
    POSE_LANDMARK_INDICES,
    HeadPoseEstimator,
    HeadPoseTracker,
    PoseEstimate,
    camera_matrix,
    classify_direction,
)
from data.dms.perclos import TimestampPerclos


def eye_points(ear: float):
    points = {}
    for indices, offset in ((LEFT_EYE_INDICES, 0.0), (RIGHT_EYE_INDICES, 2.0)):
        p1, p2, p3, p4, p5, p6 = indices
        points.update(
            {
                p1: (offset, 0.0, 0.0),
                p2: (offset + 0.25, ear / 2.0, 0.0),
                p3: (offset + 0.75, ear / 2.0, 0.0),
                p4: (offset + 1.0, 0.0, 0.0),
                p5: (offset + 0.75, -ear / 2.0, 0.0),
                p6: (offset + 0.25, -ear / 2.0, 0.0),
            }
        )
    return points


class FixedPoseEstimator:
    def __init__(self, pose):
        self.pose = pose

    def estimate(self, _points, _width, _height):
        return self.pose


class EyeMetricTests(unittest.TestCase):
    def test_ear_formula_and_invalid_geometry(self):
        points = eye_points(0.2)
        self.assertAlmostEqual(eye_aspect_ratio(points, LEFT_EYE_INDICES), 0.2)
        metrics = compute_eye_metrics(points)
        self.assertIsNotNone(metrics)
        self.assertAlmostEqual(metrics.average_ear, 0.2)

        points[LEFT_EYE_INDICES[3]] = points[LEFT_EYE_INDICES[0]]
        self.assertIsNone(eye_aspect_ratio(points, LEFT_EYE_INDICES))

    def test_compact_landmark_parser_rejects_non_finite_values(self):
        parsed = parse_landmark_payload(
            [{"index": 33, "x": 0.2, "y": 0.3, "z": -0.1}, {"index": 999, "x": 1, "y": 1}]
        )
        self.assertEqual(parsed, {33: (0.2, 0.3, -0.1)})
        with self.assertRaises(ValueError):
            parse_landmark_payload([{"index": 33, "x": float("nan"), "y": 0.3}])


class PerclosTests(unittest.TestCase):
    def test_time_weighted_half_closed_window(self):
        perclos = TimestampPerclos(10.0, 0.0, 6.0)
        perclos.update(0.0, False)
        perclos.update(5.0, True)
        result = perclos.update(10.0, True)
        self.assertAlmostEqual(result.observed_seconds, 10.0)
        self.assertAlmostEqual(result.value, 0.5)

    def test_large_gap_is_excluded_and_missing_breaks_continuity(self):
        perclos = TimestampPerclos(30.0, 0.5, 0.75)
        perclos.update(0.0, True)
        perclos.update(2.0, True)
        self.assertIsNone(perclos.value(2.0).value)
        perclos.update(2.5, True)
        self.assertAlmostEqual(perclos.value(2.5).value, 1.0)
        perclos.mark_missing(2.6)
        perclos.update(3.0, False)
        self.assertLess(perclos.value(3.0).observed_seconds, 1.0)


class HeadPoseTests(unittest.TestCase):
    def test_solve_pnp_returns_finite_pose_for_projected_face(self):
        width, height = 640, 480
        image_points, _ = cv2.projectPoints(
            FACE_MODEL_POINTS,
            np.zeros((3, 1), dtype=np.float64),
            np.array([[0.0], [0.0], [1000.0]], dtype=np.float64),
            camera_matrix(width, height),
            np.zeros((4, 1), dtype=np.float64),
        )
        points = {
            index: (float(pixel[0]) / width, float(pixel[1]) / height, 0.0)
            for index, pixel in zip(POSE_LANDMARK_INDICES, image_points.reshape(-1, 2))
        }
        pose = HeadPoseEstimator().estimate(points, width, height)
        self.assertIsNotNone(pose)
        self.assertTrue(np.isfinite([pose.yaw, pose.pitch, pose.roll]).all())
        self.assertEqual(classify_direction(pose.yaw, pose.pitch, 20.0, 15.0), "FORWARD")

    def test_direction_boundaries_and_hysteresis(self):
        self.assertEqual(classify_direction(-21.0, 0.0, 20.0, 15.0), "LEFT")
        self.assertEqual(classify_direction(21.0, 0.0, 20.0, 15.0), "RIGHT")
        self.assertEqual(classify_direction(0.0, -16.0, 20.0, 15.0), "UP")
        self.assertEqual(classify_direction(0.0, 16.0, 20.0, 15.0), "DOWN")
        tracker = HeadPoseTracker(20.0, 15.0, 4.0, 1.0)
        self.assertEqual(tracker.update(PoseEstimate(-21.0, 0.0, 0.0, 1.0))[1], "LEFT")
        self.assertEqual(tracker.update(PoseEstimate(-17.0, 0.0, 0.0, 1.0))[1], "LEFT")
        self.assertEqual(tracker.update(PoseEstimate(-15.0, 0.0, 0.0, 1.0))[1], "FORWARD")

    def test_solver_failure_returns_none(self):
        fake_cv = MagicMock()
        fake_cv.SOLVEPNP_ITERATIVE = 0
        fake_cv.solvePnP.return_value = (False, None, None)
        points = {index: (0.4 + i * 0.02, 0.3 + i * 0.03, 0.0) for i, index in enumerate(POSE_LANDMARK_INDICES)}
        self.assertIsNone(HeadPoseEstimator(fake_cv).estimate(points, 640, 480))


class AttentionStateTests(unittest.TestCase):
    def setUp(self):
        self.config = replace(
            DMSAttentionConfig(),
            perclos_min_observation_seconds=3.0,
            max_sample_gap_seconds=1.1,
            pose_smoothing_alpha=1.0,
            distraction_seconds=2.0,
        )

    def test_short_glance_then_sustained_distraction_then_recovery(self):
        pose = FixedPoseEstimator(PoseEstimate(25.0, 0.0, 0.0, 1.0))
        analyzer = AttentionAnalyzer(self.config, pose)
        points = eye_points(0.3)
        self.assertEqual(analyzer.update(points, 0.0, 640, 480)["distraction"]["state"], "SHORT_GLANCE")
        self.assertEqual(analyzer.update(points, 1.0, 640, 480)["attention_state"], "NORMAL")
        sustained = analyzer.update(points, 2.0, 640, 480)
        self.assertEqual(sustained["distraction"]["state"], "DISTRACTED")
        self.assertEqual(sustained["attention_state"], "DISTRACTED")

        pose.pose = PoseEstimate(0.0, 0.0, 0.0, 1.0)
        recovered = analyzer.update(points, 3.0, 640, 480)
        self.assertEqual(recovered["direction"], "FORWARD")
        self.assertEqual(recovered["attention_state"], "NORMAL")

    def test_drowsy_high_risk_face_loss_and_pose_failure(self):
        pose = FixedPoseEstimator(PoseEstimate(25.0, 0.0, 0.0, 1.0))
        analyzer = AttentionAnalyzer(self.config, pose)
        closed = eye_points(0.1)
        result = None
        for timestamp in (0.0, 1.0, 2.0, 3.0):
            result = analyzer.update(closed, timestamp, 640, 480)
        self.assertEqual(result["eye_state"], "CLOSED")
        self.assertEqual(result["attention_state"], "HIGH_RISK")

        missing = analyzer.update({}, 4.0, 640, 480, face_detected=False)
        self.assertEqual(missing["attention_state"], "UNKNOWN")
        self.assertEqual(missing["direction"], "UNKNOWN")

        pose.pose = None
        failed = analyzer.update(eye_points(0.3), 5.0, 640, 480)
        self.assertEqual(failed["attention_state"], "UNKNOWN")
        self.assertEqual(failed["reason"], "head_pose_unavailable")


class AttentionApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def test_endpoint_requires_authentication(self):
        response = self.client.post("/api/dms/attention", json={})
        self.assertEqual(response.status_code, 401)

    def test_authenticated_endpoint_returns_versioned_metrics(self):
        expected = {"attention_state": "UNKNOWN", "direction": "UNKNOWN"}
        payload = {
            "stream_id": "test_stream_01",
            "timestamp_ms": 1000,
            "frame_width": 640,
            "frame_height": 480,
            "face_detected": False,
            "landmarks": [],
            "reset": True,
        }
        with patch.object(
            api, "_authenticate_request", return_value=Principal("driver", "driver-a")
        ), patch.object(api.dms_attention_registry, "analyze", return_value=expected) as analyze:
            response = self.client.post("/api/dms/attention", json=payload)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["schema_version"], 1)
        self.assertEqual(response.json["attention_state"], "UNKNOWN")
        analyze.assert_called_once()


if __name__ == "__main__":
    unittest.main()
