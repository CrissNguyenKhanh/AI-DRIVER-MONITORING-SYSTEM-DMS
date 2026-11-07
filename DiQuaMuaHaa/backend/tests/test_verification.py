"""Contracts for purpose-bound grants and versioned SQL migrations."""
import inspect
import unittest
from pathlib import Path

from data.api import api


class VerificationMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = Path(__file__).resolve().parents[1]

    def migration(self, dialect, direction):
        return (
            self.backend
            / "migrations"
            / dialect
            / f"V001__verification_grants.{direction}.sql"
        ).read_text(encoding="utf-8")

    def biometric_migration(self, dialect, direction):
        return (
            self.backend
            / "migrations"
            / dialect
            / f"V002__biometric_enrollment_privacy.{direction}.sql"
        ).read_text(encoding="utf-8")

    def test_up_and_down_migrations_cover_all_security_tables(self):
        tables = {
            "dms_verification_challenges",
            "dms_authorization_grants",
            "dms_security_audit",
        }
        for dialect in ("mysql", "postgres"):
            with self.subTest(dialect=dialect):
                up = self.migration(dialect, "up")
                down = self.migration(dialect, "down")
                for table in tables:
                    self.assertIn(f"CREATE TABLE IF NOT EXISTS {table}", up)
                    self.assertIn(f"DROP TABLE IF EXISTS {table}", down)
                self.assertNotIn("DROP TABLE", up)

    def test_migrations_use_only_their_database_dialect(self):
        mysql = self.migration("mysql", "up")
        postgres = self.migration("postgres", "up")
        self.assertIn("AUTO_INCREMENT", mysql)
        self.assertIn("ENGINE=InnoDB", mysql)
        self.assertNotIn("BIGSERIAL", mysql)
        self.assertNotIn("ON CONFLICT", mysql)
        self.assertIn("BIGSERIAL", postgres)
        self.assertIn("CREATE INDEX IF NOT EXISTS", postgres)
        self.assertNotIn("AUTO_INCREMENT", postgres)
        self.assertNotIn("ENGINE=InnoDB", postgres)

    def test_atomic_session_start_contains_no_lazy_ddl_helper(self):
        source = inspect.getsource(api.driving_session_start)
        self.assertNotIn("_ensure_driving_session_tables", source)
        self.assertNotIn("ensure_auth_tables", source)
        self.assertNotIn("CREATE TABLE", source)
        self.assertIn("FOR UPDATE", source)
        self.assertIn("SET consumed_at", source)

    def test_biometric_migration_is_ordered_additive_and_reversible(self):
        for dialect in ("mysql", "postgres"):
            with self.subTest(dialect=dialect):
                base = self.migration(dialect, "up")
                up = self.biometric_migration(dialect, "up")
                down = self.biometric_migration(dialect, "down")
                self.assertIn("CREATE TABLE IF NOT EXISTS driver_identity", base)
                self.assertIn("ADD COLUMN updated_at", up)
                self.assertIn("ADD COLUMN enrollment_version", up)
                self.assertIn("ADD COLUMN enrollment_status", up)
                self.assertIn("DROP COLUMN enrollment_status", down)
                self.assertNotIn("embedding_json =", up)
                self.assertNotIn("image_base64 =", up)


if __name__ == "__main__":
    unittest.main()
