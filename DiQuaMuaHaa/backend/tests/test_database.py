"""Dialect/route contracts using DB-API mocks, not database integration tests."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from data.api import api


class DatabaseTests(unittest.TestCase):
    def connection(self, rows=()):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.connection = conn
        cur.fetchone.side_effect = rows
        cur.lastrowid = 42
        cur.rowcount = 1
        return conn, cur

    def run_route(self, postgres, path, payload=None, rows=()):
        conn, cur = self.connection(rows)
        with patch.object(api, "POSTGRES_ACTIVE", postgres), patch.object(api, "get_mysql_conn", return_value=conn), patch.object(api, "_collect_face_embeddings", return_value=[[1., 0.]] * 3), patch.object(api, "_telegram_send_decision_message", return_value=9):
            client = api.app.test_client()
            response = client.get(path) if payload is None else client.post(path, json=payload)
        self.assertEqual(response.status_code, 200, response.json)
        conn.close.assert_called_once()
        self.assertTrue(conn.commit.called)
        statements = [call.args[0] for call in cur.execute.call_args_list]
        for sql in statements:
            if postgres:
                self.assertNotIn("ON DUPLICATE", sql)
                self.assertNotIn("AUTO_INCREMENT", sql)
            else:
                self.assertNotIn("ON CONFLICT", sql)
                self.assertNotIn("RETURNING", sql)
                self.assertNotIn("BIGSERIAL", sql)
        return response.json, statements, cur

    def test_identity_register_lookup_and_bind_both_dialects(self):
        for postgres in (False, True):
            with self.subTest(postgres=postgres):
                data, sql, _ = self.run_route(postgres, "/api/identity/register",
                                             {"driver_id": "demo", "images": ["a", "b", "c"]})
                self.assertEqual(data["samples_used"], 3)
                self.assertIn("ON CONFLICT" if postgres else "ON DUPLICATE", sql[-1])
                row = {"driver_id": "demo", "name": "Demo", "embedding_json": "[1,0]",
                       "image_base64": "image", "created_at": datetime(2026, 1, 1)}
                data, _, _ = self.run_route(postgres, "/api/identity/verify",
                                            {"driver_id": "demo", "images": ["a", "b"]}, [row])
                self.assertTrue(data["is_owner"])
                data, _, _ = self.run_route(postgres, "/api/identity/driver_profile?driver_id=demo", rows=[row])
                self.assertEqual(data["registered_name"], "Demo")
                _, sql, _ = self.run_route(postgres, "/api/identity/telegram/bind",
                                           {"driver_id": "demo", "telegram_chat_id": 123})
                self.assertIn("ON CONFLICT" if postgres else "ON DUPLICATE", sql[-1])

    def test_request_and_driving_lifecycle_both_dialects(self):
        for postgres in (False, True):
            with self.subTest(postgres=postgres):
                rows = [None, {"telegram_chat_id": 123}] + ([{"request_id": 42}] if postgres else [])
                data, _, _ = self.run_route(postgres, "/api/identity/request_decision",
                                            {"driver_id": "demo", "phase": "auth"}, rows)
                self.assertEqual(data["request_id"], 42)
                data, sql, _ = self.run_route(postgres, "/api/driving/session/start",
                                              {"driver_id": "demo"}, [{"id": 42}] if postgres else [])
                self.assertEqual(data["session_id"], 42)
                self.assertEqual("RETURNING id" in sql[-1], postgres)
                data, sql, _ = self.run_route(postgres, "/api/driving/session/alert",
                                              {"session_id": 42, "alert_type": "phone", "delta": 2},
                                              [{"id": 42}, {"count": 5}])
                self.assertEqual(data["count"], 5)
                self.assertTrue(any("count = driving_session_alerts.count +" in q for q in sql))
                data, _, _ = self.run_route(postgres, "/api/driving/session/end", {"session_id": 42})
                self.assertTrue(data["ok"])
                row = {"request_id": 42, "driver_id": "demo", "status": "pending",
                       "expires_at": datetime.utcnow() - timedelta(seconds=5),
                       "requested_at": datetime.utcnow(), "decided_at": None, "reason": "intruder"}
                data, _, _ = self.run_route(postgres, "/api/identity/decision_status?request_id=42", rows=[row])
                self.assertEqual(data["status"], "expired")

    def test_webhook_binding_uses_selected_dialect(self):
        for postgres in (False, True):
            conn, cur = self.connection()
            with patch.object(api, "POSTGRES_ACTIVE", postgres), patch.object(api, "get_mysql_conn", return_value=conn), patch.object(api, "TELEGRAM_BOT_TOKEN", "test-only"), patch.object(api, "TELEGRAM_WEBHOOK_SECRET", "test-only"), patch.object(api, "_telegram_send_text"):
                response = api.app.test_client().post("/api/telegram/webhook",
                    headers={"X-Telegram-Bot-Api-Secret-Token": "test-only"},
                    json={"message": {"text": "/bind demo", "chat": {"id": 123}, "from": {"id": 456}}})
            self.assertEqual(response.status_code, 200)
            self.assertIn("ON CONFLICT" if postgres else "ON DUPLICATE", cur.execute.call_args.args[0])

    def test_postgres_missing_config_never_falls_back_to_mysql(self):
        with patch.object(api, "POSTGRES_ACTIVE", True), patch.object(api, "DATABASE_URL", ""), patch.object(api.pymysql, "connect") as mysql:
            with self.assertRaises(RuntimeError):
                api.get_mysql_conn()
            mysql.assert_not_called()

    def test_connection_selection_and_timeouts(self):
        with patch.object(api, "POSTGRES_ACTIVE", False), patch.object(api.pymysql, "connect") as connect:
            api.get_mysql_conn()
            self.assertEqual(connect.call_args.kwargs["connect_timeout"], 5)
        with patch.object(api, "POSTGRES_ACTIVE", True), patch.object(api, "DATABASE_URL", "test-only"), patch.object(api.psycopg2, "connect") as connect:
            api.get_mysql_conn()
            self.assertEqual(connect.call_args.kwargs["connect_timeout"], 5)

    def test_failed_write_closes_connection_without_data_commit(self):
        conn, cur = self.connection()
        def execute(sql, *args):
            if sql.startswith("INSERT"):
                raise RuntimeError("private SQL details")
        cur.execute.side_effect = execute
        with patch.object(api, "get_mysql_conn", return_value=conn), patch.object(api.app.logger, "exception"):
            response = api.app.test_client().post("/api/driving/session/start", json={})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private", str(response.json))
        # Only schema is committed. Closing the DB-API connection rolls back the failed write.
        conn.commit.assert_called_once()
        conn.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
