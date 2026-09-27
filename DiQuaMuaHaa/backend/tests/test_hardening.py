"""Offline regressions; never connects to a real database, camera or Telegram."""
import os
import unittest
from unittest.mock import MagicMock, patch

from data.api import api
from data.security import cors_origins


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def test_explicit_origin_and_blocked_origin(self):
        for origin, allowed in [("http://localhost:5173", True), ("https://untrusted.invalid", False)]:
            response = self.client.get("/", headers={"Origin": origin})
            self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), origin if allowed else None)
        self.assertEqual(api.socketio.server.eio.cors_allowed_origins, api.CORS_ORIGINS)

    def test_invalid_cors_configuration(self):
        for value in ["*", "https://example.org/path", "https://user:pass@example.org"]:
            with patch.dict(os.environ, {"CORS_ALLOWED_ORIGINS": value}):
                with self.assertRaises(ValueError):
                    cors_origins()

    def test_webhook_disabled_without_secrets(self):
        with patch.object(api, "TELEGRAM_BOT_TOKEN", ""), patch.object(api, "TELEGRAM_WEBHOOK_SECRET", ""):
            response = self.client.post("/api/telegram/webhook", json={})
        self.assertEqual(response.status_code, 503)


class ErrorAndHealthTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
        self.secret_error = RuntimeError("private-password /srv/private/model.pkl")

    def test_health_success_does_not_load_models(self):
        connection = MagicMock()
        with patch.object(api, "get_mysql_conn", return_value=connection), patch.object(api, "_ensure_models_loaded") as loader:
            response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["database"]["available"])
        self.assertIn("smoking", response.json["models"])
        loader.assert_not_called()
        connection.close.assert_called_once()
        connection.cursor.return_value.__enter__.return_value.execute.assert_called_once_with("SELECT 1")

    def test_failure_responses_do_not_leak(self):
        with patch.object(api, "get_mysql_conn", side_effect=self.secret_error), patch.object(api.app.logger, "exception") as logger:
            for endpoint in ["/health", "/api/ping-db", "/api/identity/driver_profile?driver_id=test"]:
                response = self.client.get(endpoint)
                self.assertGreaterEqual(response.status_code, 400)
                self.assertNotIn("private", response.get_data(as_text=True))
            self.assertTrue(logger.called)

    def test_model_loader_failure_and_http_errors(self):
        with patch.object(api, "_ensure_models_loaded", side_effect=self.secret_error), patch.object(api.app.logger, "exception") as logger:
            for endpoint in ["/api/landmark/predict_from_frame", "/api/hand/predict_from_frame"]:
                response = self.client.post(endpoint, json={"image": "invalid"})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json, {"error": "Service unavailable"})
            self.assertEqual(logger.call_count, 2)
        self.assertEqual(self.client.get("/not-a-route").status_code, 404)

    def test_socket_exception_is_sanitized(self):
        with patch.object(api, "DISABLE_PHONE_YOLO", False), patch.object(api, "_ensure_yolo_loaded", side_effect=self.secret_error), patch.object(api.app.logger, "exception"):
            client = api.socketio.test_client(api.app)
            try:
                client.emit("phone_frame", {"image": "invalid"})
                results = client.get_received()
                self.assertEqual(results[0]["name"], "phone_result")
                self.assertNotIn("private", str(results))
            finally:
                client.disconnect()


if __name__ == "__main__":
    unittest.main()
