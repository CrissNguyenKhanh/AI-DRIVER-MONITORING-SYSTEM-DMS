"""Offline regressions; never connects to a real database, camera or Telegram."""
import os
import unittest
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
