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
            api,
            "_authenticate_request",
            return_value=Principal("driver", "driver-a", "session-a"),
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
        with self.driver_a():
            denied = self.client.post("/api/driving/session/start", json={})
        self.assertEqual(denied.status_code, 403, denied.json)
        self.assertEqual(denied.json["code"], "verification_grant_required")

        grant = {
            "grant_hash": hash_secret("approved-grant"),
            "challenge_id": "challenge-a",
            "driver_id": "driver-a",
            "auth_session_hash": "session-a",
            "purpose": "start_driving_session",
            "expires_at": datetime.utcnow() + timedelta(minutes=1),
            "consumed_at": None,
            "revoked_at": None,
        }
        conn, _cur = self.connection([grant])
        with self.driver_a(), patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post(
                "/api/driving/session/start",
                json={"verification_grant": "approved-grant"},
            )
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


class VerificationGrantTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    @staticmethod
    def connection(rows=()):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.connection = conn
        cur.fetchone.side_effect = rows
        cur.rowcount = 1
        cur.lastrowid = 77
        return conn, cur

    @staticmethod
    def principal(driver_id="driver-a", session_id="session-a"):
        return patch.object(
            api,
            "_authenticate_request",
            return_value=Principal("driver", driver_id, session_id),
        )

    @staticmethod
    def grant(**overrides):
        row = {
            "grant_hash": hash_secret("approved-grant"),
            "challenge_id": "challenge-a",
            "driver_id": "driver-a",
            "auth_session_hash": "session-a",
            "purpose": "start_driving_session",
            "expires_at": datetime.utcnow() + timedelta(minutes=1),
            "consumed_at": None,
            "revoked_at": None,
        }
        row.update(overrides)
        return row

    def test_wrong_expired_replayed_revoked_session_driver_and_purpose_are_rejected(self):
        cases = [
            (None, "invalid_grant"),
            (self.grant(expires_at=datetime.utcnow() - timedelta(seconds=1)), "grant_expired"),
            (self.grant(consumed_at=datetime.utcnow()), "grant_replayed"),
            (self.grant(revoked_at=datetime.utcnow()), "grant_revoked"),
            (self.grant(auth_session_hash="another-session"), "grant_session_mismatch"),
            (self.grant(driver_id="driver-b"), "grant_driver_mismatch"),
            (self.grant(purpose="identity_replace"), "grant_purpose_mismatch"),
        ]
        for row, expected in cases:
            with self.subTest(expected=expected):
                conn, _cur = self.connection([row])
                with self.principal(), patch.object(api, "get_mysql_conn", return_value=conn):
                    response = self.client.post(
                        "/api/driving/session/start",
                        json={"verification_grant": "approved-grant"},
                    )
                self.assertEqual(response.status_code, 403, response.json)
                self.assertEqual(response.json["code"], expected)
                conn.commit.assert_not_called()

    def test_grant_consumption_and_session_creation_commit_once_without_ddl(self):
        conn, cur = self.connection([self.grant()])
        with self.principal(), patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post(
                "/api/driving/session/start",
                json={"verification_grant": "approved-grant", "label": "test"},
            )

        self.assertEqual(response.status_code, 200, response.json)
        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()
        statements = [call.args[0] for call in cur.execute.call_args_list]
        self.assertTrue(any("SET consumed_at" in sql for sql in statements))
        self.assertTrue(any("INSERT INTO driving_sessions" in sql for sql in statements))
        self.assertTrue(any("INSERT INTO dms_security_audit" in sql for sql in statements))
        self.assertFalse(any("CREATE TABLE" in sql for sql in statements))
        all_args = str([call.args for call in cur.execute.call_args_list])
        self.assertNotIn("approved-grant", all_args)
        self.assertIn(hash_secret("approved-grant"), all_args)

    def test_session_insert_failure_rolls_back_grant_consumption(self):
        conn, cur = self.connection([self.grant()])

        def execute(sql, *args):
            if "INSERT INTO driving_sessions" in sql:
                raise RuntimeError("test write failure")

        cur.execute.side_effect = execute
        with self.principal(), patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api.app.logger, "exception"):
            response = self.client.post(
                "/api/driving/session/start",
                json={"verification_grant": "approved-grant"},
            )

        self.assertEqual(response.status_code, 500, response.json)
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    def test_challenge_is_bound_to_driver_and_auth_session_and_secret_is_hashed(self):
        conn, cur = self.connection([None])
        with self.principal(), patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "generate_secret", side_effect=["challenge-id", "challenge-token"]), \
                patch.object(api, "TELEGRAM_BOT_TOKEN", ""):
            response = self.client.post(
                "/api/driving/authorization/challenge",
                json={"purpose": "start_driving_session"},
            )

        self.assertEqual(response.status_code, 202, response.json)
        self.assertEqual(response.json["challenge_id"], "challenge-id")
        self.assertEqual(response.json["verification_token"], "challenge-token")
        args = str([call.args for call in cur.execute.call_args_list])
        self.assertNotIn("challenge-token", args)
        self.assertIn(hash_secret("challenge-token"), args)
        self.assertIn("session-a", args)
        self.assertIn("driver-a", args)

    def test_admin_approval_mints_matching_purpose_grant(self):
        challenge = {
            "challenge_id": "challenge-a",
            "secret_hash": hash_secret("challenge-token"),
            "driver_id": "driver-a",
            "auth_session_hash": "session-a",
            "purpose": "start_driving_session",
            "status": "pending",
            "expires_at": datetime.utcnow() + timedelta(minutes=2),
            "telegram_chat_id": 1,
            "telegram_user_id": 2,
        }
        conn, cur = self.connection([challenge])
        admin = Principal("admin", session_id="admin-session")
        with patch.object(api, "_authenticate_request", return_value=admin), \
                patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post(
                "/api/admin/driving/authorization/challenge/challenge-a/decision",
                json={"decision": "approve"},
            )

        self.assertEqual(response.status_code, 200, response.json)
        statements = [call.args[0] for call in cur.execute.call_args_list]
        self.assertTrue(any("INSERT INTO dms_authorization_grants" in sql for sql in statements))
        self.assertTrue(any("purpose" in sql for sql in statements))

    def test_expired_challenge_cannot_mint_grant(self):
        challenge = {
            "challenge_id": "challenge-a",
            "secret_hash": hash_secret("challenge-token"),
            "driver_id": "driver-a",
            "auth_session_hash": "session-a",
            "purpose": "start_driving_session",
            "status": "pending",
            "expires_at": datetime.utcnow() - timedelta(seconds=1),
            "telegram_chat_id": 1,
            "telegram_user_id": 2,
        }
        conn, cur = self.connection([challenge])
        admin = Principal("admin", session_id="admin-session")
        with patch.object(api, "_authenticate_request", return_value=admin), \
                patch.object(api, "get_mysql_conn", return_value=conn):
            response = self.client.post(
                "/api/admin/driving/authorization/challenge/challenge-a/decision",
                json={"decision": "approve"},
            )

        self.assertEqual(response.status_code, 409, response.json)
        self.assertEqual(response.json["code"], "challenge_expired")
        statements = [call.args[0] for call in cur.execute.call_args_list]
        self.assertFalse(any("INSERT INTO dms_authorization_grants" in sql for sql in statements))

    def test_matching_telegram_owner_callback_mints_grant_once(self):
        challenge = {
            "challenge_id": "challenge-a",
            "secret_hash": hash_secret("challenge-token"),
            "driver_id": "driver-a",
            "auth_session_hash": "session-a",
            "purpose": "start_driving_session",
            "status": "pending",
            "expires_at": datetime.utcnow() + timedelta(minutes=1),
            "telegram_chat_id": 123,
            "telegram_user_id": 456,
        }
        conn, cur = self.connection([challenge])
        with patch.object(api, "get_mysql_conn", return_value=conn), \
                patch.object(api, "TELEGRAM_BOT_TOKEN", "configured"), \
                patch.object(api, "TELEGRAM_WEBHOOK_SECRET", "webhook-secret"), \
                patch.object(api, "_telegram_answer_callback"):
            response = self.client.post(
                "/api/telegram/webhook",
                headers={"X-Telegram-Bot-Api-Secret-Token": "webhook-secret"},
                json={
                    "callback_query": {
                        "id": "callback-id",
                        "data": "dvg:approve:challenge-a",
                        "from": {"id": 456},
                        "message": {"chat": {"id": 123}},
                    }
                },
            )

        self.assertEqual(response.status_code, 200, response.json)
        self.assertTrue(response.json["processed"])
        self.assertEqual(response.json["status"], "approved")
        statements = [call.args[0] for call in cur.execute.call_args_list]
        self.assertTrue(any("INSERT INTO dms_authorization_grants" in sql for sql in statements))
        conn.commit.assert_called_once()

    def test_invalid_or_duplicate_telegram_callback_cannot_mint_grant(self):
        rows = [
            self.grant(
                challenge_id="challenge-a",
                secret_hash=hash_secret("challenge-token"),
                status="pending",
                telegram_chat_id=123,
                telegram_user_id=456,
            ),
            self.grant(
                challenge_id="challenge-a",
                secret_hash=hash_secret("challenge-token"),
                status="approved",
                telegram_chat_id=123,
                telegram_user_id=456,
            ),
        ]
        callbacks = [
            ({"id": 999}, "telegram_owner_mismatch"),
            ({"id": 123}, "challenge_already_decided"),
        ]
        for row, (chat, expected) in zip(rows, callbacks):
            conn, cur = self.connection([row])
            with patch.object(api, "get_mysql_conn", return_value=conn), \
                    patch.object(api, "TELEGRAM_BOT_TOKEN", "configured"), \
                    patch.object(api, "TELEGRAM_WEBHOOK_SECRET", "webhook-secret"), \
                    patch.object(api, "_telegram_answer_callback"):
                response = self.client.post(
                    "/api/telegram/webhook",
                    headers={"X-Telegram-Bot-Api-Secret-Token": "webhook-secret"},
                    json={
                        "callback_query": {
                            "id": "callback-id",
                            "data": "dvg:approve:challenge-a",
                            "from": {"id": 456},
                            "message": {"chat": chat},
                        }
                    },
                )
            self.assertEqual(response.status_code, 200, response.json)
            self.assertFalse(response.json["processed"])
            self.assertEqual(response.json["code"], expected)
            statements = [call.args[0] for call in cur.execute.call_args_list]
            self.assertFalse(any("INSERT INTO dms_authorization_grants" in sql for sql in statements))


if __name__ == "__main__":
    unittest.main()
