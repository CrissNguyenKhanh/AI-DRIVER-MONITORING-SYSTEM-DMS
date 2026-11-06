"""Focused integration tests for the tracked hand-classifier artifact."""

from __future__ import annotations

import csv
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import joblib
import numpy as np

from data.api import api


EXPECTED_LABELS = {"map", "music", "no_sign", "open", "phonecall"}
HAND_DATASET_PATH = (
    Path(api.BASE_DIR) / "driver_training" / "collect" / "hand_dataset.csv"
)
_API_STATE_NAMES = (
    "artifact",
    "model",
    "idx_to_label",
    "hand_artifact",
    "hand_model",
    "hand_idx_to_label",
    "hand_vec_len",
    "joblib",
    "cv2",
    "_face_mesh",
    "_hands",
    "_models_loaded",
    "_models_load_attempted",
)


def _one_real_row_per_label() -> dict[str, list[float]]:
    rows: dict[str, list[float]] = {}
    with HAND_DATASET_PATH.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            label = str(row.get("label") or "").strip()
            if label and label not in rows:
                rows[label] = [float(row[f"f{index}"]) for index in range(63)]
            if set(rows) == EXPECTED_LABELS:
                break
    return rows


class HandModelArtifactTests(unittest.TestCase):
    def setUp(self) -> None:
        self._api_state = {name: getattr(api, name) for name in _API_STATE_NAMES}
        self.client = api.app.test_client()

    def tearDown(self) -> None:
        for name, value in self._api_state.items():
            setattr(api, name, value)

    def _load_actual_artifact(self) -> None:
        api.joblib = joblib
        api.load_hand_model()
        self.assertIsNotNone(api.hand_artifact)
        self.assertIsNotNone(api.hand_model)
        self.assertTrue(api.hand_idx_to_label)

    def test_actual_artifact_contract_and_real_samples(self) -> None:
        self.assertTrue(api.HAND_MODEL_PATH.is_file())
        self.assertTrue(HAND_DATASET_PATH.is_file())

        self._load_actual_artifact()

        self.assertIsInstance(api.hand_artifact, dict)
        self.assertIs(api.hand_model, api.hand_artifact["model"])
        self.assertTrue(callable(getattr(api.hand_model, "predict", None)))
        self.assertTrue(callable(getattr(api.hand_model, "predict_proba", None)))
        self.assertEqual(api.hand_vec_len, 63)
        self.assertEqual(set(api.hand_idx_to_label.values()), EXPECTED_LABELS)
        self.assertEqual(sorted(api.hand_idx_to_label), list(range(len(EXPECTED_LABELS))))
        self.assertEqual(api.hand_artifact["artifact_version"], 2)
        self.assertEqual(api.hand_artifact["sklearn_version"], "1.7.2")
        classifier = api.hand_model.named_steps["clf"]
        self.assertEqual(classifier.random_state, 42)
        self.assertNotIn("_random_state", classifier.__dict__)

        samples = _one_real_row_per_label()
        self.assertEqual(set(samples), EXPECTED_LABELS)
        matrix = np.asarray(
            [samples[label] for label in sorted(EXPECTED_LABELS)], dtype=np.float32
        )
        self.assertEqual(matrix.shape, (len(EXPECTED_LABELS), api.hand_vec_len))

        predictions = np.asarray(api.hand_model.predict(matrix))
        probabilities = np.asarray(api.hand_model.predict_proba(matrix), dtype=float)
        self.assertEqual(predictions.shape, (len(EXPECTED_LABELS),))
        self.assertEqual(
            probabilities.shape, (len(EXPECTED_LABELS), len(EXPECTED_LABELS))
        )
        self.assertTrue(np.isfinite(probabilities).all())
        self.assertTrue((probabilities >= 0.0).all())
        self.assertTrue((probabilities <= 1.0).all())
        np.testing.assert_allclose(
            probabilities.sum(axis=1), np.ones(len(EXPECTED_LABELS)), atol=1e-6
        )
        for expected_label, prediction in zip(sorted(EXPECTED_LABELS), predictions):
            self.assertEqual(api.hand_idx_to_label[int(prediction)], expected_label)

    def test_landmark_endpoint_success_and_wrong_length(self) -> None:
        self._load_actual_artifact()
        sample = _one_real_row_per_label()["no_sign"]

        with patch.object(api, "_ensure_models_loaded") as ensure_loaded:
            success = self.client.post("/api/hand/predict", json={"landmarks": sample})
            wrong_length = self.client.post(
                "/api/hand/predict", json={"landmarks": sample[:-1]}
            )

        self.assertEqual(success.status_code, 200)
        self.assertEqual(set(success.json), {"label", "prob", "scores"})
        self.assertEqual(success.json["label"], "no_sign")
        self.assertEqual(set(success.json["scores"]), EXPECTED_LABELS)
        self.assertTrue(np.isfinite(float(success.json["prob"])))
        self.assertAlmostEqual(
            float(success.json["prob"]), max(success.json["scores"].values())
        )
        self.assertTrue(
            all(np.isfinite(float(value)) for value in success.json["scores"].values())
        )
        self.assertEqual(wrong_length.status_code, 400)
        self.assertIn("error", wrong_length.json)
        self.assertEqual(ensure_loaded.call_count, 2)

    def test_frame_endpoint_rejects_malformed_input_and_handles_no_hand(self) -> None:
        self._load_actual_artifact()

        with patch.object(api, "_ensure_models_loaded"):
            malformed = self.client.post(
                "/api/hand/predict_from_frame", json={"image": "%%%invalid%%%"}
            )

        with patch.object(api, "_ensure_models_loaded"), patch.object(
            api, "_image_base64_to_hand_landmarks", return_value=None
        ) as preprocess:
            no_hand = self.client.post(
                "/api/hand/predict_from_frame", json={"image": "ZmFrZQ=="}
            )

        self.assertEqual(malformed.status_code, 400)
        self.assertIn("error", malformed.json)
        preprocess.assert_called_once_with("ZmFrZQ==")
        self.assertEqual(no_hand.status_code, 200)
        self.assertEqual(no_hand.json["label"], "no_sign")
        self.assertEqual(no_hand.json["prob"], 1.0)
        self.assertEqual(set(no_hand.json["scores"]), EXPECTED_LABELS)
        self.assertEqual(no_hand.json["scores"]["no_sign"], 1.0)

    def test_lazy_load_once_then_health_reports_hand_usable(self) -> None:
        api.hand_artifact = None
        api.hand_model = None
        api.hand_idx_to_label = {}
        api.hand_vec_len = 126
        api._hands = None
        api._models_loaded = False
        api._models_load_attempted = False

        def load_fake_landmark_model() -> None:
            api.model = MagicMock(name="landmark_model")
            api.idx_to_label = {0: "safe"}

        hands_instance = MagicMock(name="mediapipe_hands")
        hands_constructor = MagicMock(return_value=hands_instance)
        fake_mediapipe = SimpleNamespace(
            solutions=SimpleNamespace(
                hands=SimpleNamespace(Hands=hands_constructor)
            )
        )

        with patch.object(api, "DISABLE_HAND_DETECT", False), patch.object(
            api, "_ensure_face_mesh_loaded"
        ) as face_loader, patch.object(
            api, "load_model", side_effect=load_fake_landmark_model
        ) as landmark_loader, patch.object(
            api, "load_hand_model", wraps=api.load_hand_model
        ) as hand_loader, patch.dict(
            sys.modules, {"mediapipe": fake_mediapipe}
        ):
            api._ensure_models_loaded()
            api._ensure_models_loaded()

            with patch.object(api, "_database_available", return_value=True):
                health = self.client.get("/health")

        self.assertEqual(face_loader.call_count, 2)
        landmark_loader.assert_called_once_with()
        hand_loader.assert_called_once_with()
        hands_constructor.assert_called_once()
        self.assertIs(api._hands, hands_instance)
        self.assertTrue(api._models_loaded)
        self.assertTrue(api._models_load_attempted)
        self.assertEqual(health.status_code, 200)
        self.assertEqual(
            health.json["models"]["hand"],
            {"artifact_present": True, "loaded": True, "enabled": True},
        )


if __name__ == "__main__":
    unittest.main()
