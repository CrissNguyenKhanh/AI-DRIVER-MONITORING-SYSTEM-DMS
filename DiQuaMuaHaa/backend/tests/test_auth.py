"""Authentication and ownership regressions using local DB-API mocks only."""
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from data.api import api
from data.auth import Principal, hash_secret


class AuthBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    @staticmethod
    def connection(fetch_rows=()):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.connection = conn
        cur.fetchone.side_effect = fetch_rows
        cur.rowcount = 1
        cur.lastrowid = 42
        return conn, cur

    def test_missing_invalid_expired_and_valid_token(self):
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

        cases = [
            (None, 401),
            ({"driver_id": "driver-a", "role": "driver",
              "expires_at": datetime.utcnow() - timedelta(seconds=1), "revoked_at": None}, 401),
            ({"driver_id": "driver-a", "role": "driver",
              "expires_at": datetime.utcnow() + timedelta(hours=1), "revoked_at": None}, 200),
        ]
        for row, expected in cases:
            with self.subTest(expected=expected, row=row):
                conn, cur = self.connection([row])
                with patch.object(api, "get_mysql_conn", return_value=conn):
                    response = self.client.get(
                        "/api/auth/me", headers={"Authorization": "Bearer test-access-token"}
                    )
                self.assertEqual(response.status_code, expected, response.json)
                if expected == 200:
                    self.assertEqual(response.json, {"driver_id": "driver-a", "role": "driver"})
                query_args = [call.args for call in cur.execute.call_args_list]
                self.assertNotIn("test-access-token", str(query_args))
                self.assertIn(hash_secret("test-access-token"), str(query_args))

    def test_driver_cannot_call_admin_endpoint_but_admin_can(self):
        with patch.object(api, "_authenticate_request", return_value=Principal("driver", "driver-a")):
            response = self.client.post(
                "/api/admin/enrollment-code", json={"driver_id": "driver-a"}
            )
        self.assertEqual(response.status_code, 403)

        conn, _cur = self.connection()
        with patch.object(api, "_authenticate_request", return_value=Principal("admin")), \
                patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "generate_secret", return_value="admin-created-code"):
            response = self.client.post(
                "/api/admin/enrollment-code", json={"driver_id": "driver-a"}
            )
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["enrollment_code"], "admin-created-code")

    def test_admin_bootstrap_secret_is_required_and_not_persisted_raw(self):
        with patch.dict(os.environ, {"DMS_ADMIN_BOOTSTRAP_SECRET": "configured-secret"}):
            denied = self.client.post(
                "/api/auth/admin/session", json={"bootstrap_secret": "wrong-secret"}
            )
        self.assertEqual(denied.status_code, 401)

        conn, cur = self.connection()
        with patch.dict(os.environ, {"DMS_ADMIN_BOOTSTRAP_SECRET": "configured-secret"}), \
                patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "generate_secret", return_value="opaque-admin-token"):
            allowed = self.client.post(
                "/api/auth/admin/session", json={"bootstrap_secret": "configured-secret"}
            )
        self.assertEqual(allowed.status_code, 200, allowed.json)
        self.assertEqual(allowed.json["access_token"], "opaque-admin-token")
        executed = str([call.args for call in cur.execute.call_args_list])
        self.assertNotIn("configured-secret", executed)
        self.assertNotIn("opaque-admin-token", executed)
        self.assertIn(hash_secret("opaque-admin-token"), executed)

    def test_enrollment_code_expiry_replay_and_success(self):
        invalid_rows = [
            {"driver_id": "driver-a", "purpose": "driver_enrollment",
             "expires_at": datetime.utcnow() - timedelta(seconds=1), "used_at": None},
            {"driver_id": "driver-a", "purpose": "driver_enrollment",
             "expires_at": datetime.utcnow() + timedelta(minutes=5), "used_at": datetime.utcnow()},
        ]
        for row in invalid_rows:
            conn, _cur = self.connection([row])
            with patch.object(api, "get_mysql_conn", return_value=conn):
                response = self.client.post(
                    "/api/auth/enroll",
                    json={"driver_id": "driver-a", "enrollment_code": "one-time"},
                )
            self.assertEqual(response.status_code, 401)

        valid = {"driver_id": "driver-a", "purpose": "driver_enrollment",
                 "expires_at": datetime.utcnow() + timedelta(minutes=5), "used_at": None}
        conn, _cur = self.connection([valid])
        with patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "generate_secret", return_value="new-driver-token"):
            response = self.client.post(
                "/api/auth/enroll",
                json={"driver_id": "driver-a", "enrollment_code": "one-time"},
            )
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["access_token"], "new-driver-token")


class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
    def driver_a(self):
        return patch.object(
            api, "_authenticate_request", return_value=Principal("driver", "driver-a")
        )

    @staticmethod
    def connection(fetch_rows=()):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.connection = conn
        cur.fetchone.side_effect = fetch_rows
        cur.fetchall.return_value = []
        cur.rowcount = 1
        cur.lastrowid = 42
        return conn, cur

    def test_identity_cross_driver_rejected_and_owner_allowed(self):
        with self.driver_a():
            response = self.client.post(
                "/api/identity/register",
                json={"driver_id": "driver-b", "images": ["a", "b", "c"]},
            )
        self.assertEqual(response.status_code, 403)

        conn, _cur = self.connection()
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "_collect_face_embeddings", return_value=[[1.0, 0.0]] * 3):
            response = self.client.post(
                "/api/identity/register",
                json={"driver_id": "driver-a", "images": ["a", "b", "c"]},
            )
        self.assertEqual(response.status_code, 200, response.json)

    def test_driver_cannot_direct_bind_or_create_code_for_another_driver(self):
        with self.driver_a():
            direct = self.client.post(
                "/api/identity/telegram/bind",
                json={"driver_id": "driver-b", "telegram_chat_id": 123},
            )
        self.assertEqual(direct.status_code, 403)

        conn, _cur = self.connection()
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "generate_secret", return_value="telegram-code"):
            owner = self.client.post(
                "/api/identity/telegram/bind-code", json={"driver_id": "driver-b"}
            )
        self.assertEqual(owner.status_code, 200, owner.json)
        self.assertEqual(owner.json["driver_id"], "driver-a")

    def test_cross_driver_decision_and_session_access_rejected(self):
        decision = {
            "request_id": 7,
            "driver_id": "driver-b",
            "status": "pending",
            "reason": "intruder",
            "requested_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(seconds=30),
            "decided_at": None,
        }
        conn, _cur = self.connection([decision])
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.get("/api/identity/decision_status?request_id=7")
        self.assertEqual(response.status_code, 403)

        conn, _cur = self.connection([{"id": 9, "driver_id": "driver-b"}])
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post("/api/driving/session/end", json={"session_id": 9})
        self.assertEqual(response.status_code, 403)

    def test_owner_can_start_and_modify_own_session(self):
        conn, _cur = self.connection()
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post("/api/driving/session/start", json={})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["driver_id"], "driver-a")

        conn, _cur = self.connection([{"id": 42, "driver_id": "driver-a"}])
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post("/api/driving/session/end", json={"session_id": 42})
        self.assertEqual(response.status_code, 200, response.json)

    def test_expired_and_used_telegram_codes_are_rejected(self):
        for row in [
            {"driver_id": "driver-a", "purpose": "telegram_bind",
             "expires_at": datetime.utcnow() - timedelta(seconds=1), "used_at": None},
            {"driver_id": "driver-a", "purpose": "telegram_bind",
             "expires_at": datetime.utcnow() + timedelta(minutes=1), "used_at": datetime.utcnow()},
        ]:
            conn, cur = self.connection([row])
            with patch.object(api, "get_mysql_conn", return_value=conn), \
                    patch.object(api, "TELEGRAM_BOT_TOKEN", "configured"), \
                    patch.object(api, "TELEGRAM_WEBHOOK_SECRET", "webhook-secret"), \
                    patch.object(api, "_telegram_send_text") as send:
                response = self.client.post(
                    "/api/telegram/webhook",
                    headers={"X-Telegram-Bot-Api-Secret-Token": "webhook-secret"},
                    json={"message": {"text": "/bind one-time", "chat": {"id": 1},
                                      "from": {"id": 2}}},
                )
            self.assertEqual(response.status_code, 200)
            self.assertTrue(send.called)
            statements = [call.args[0] for call in cur.execute.call_args_list]
            self.assertFalse(any("driver_telegram_owner" in sql and "INSERT" in sql for sql in statements))


if __name__ == "__main__":
    unittest.main()
