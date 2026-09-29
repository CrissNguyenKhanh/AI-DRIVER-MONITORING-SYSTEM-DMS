"""Security contracts for the legacy medical API's existing JWT stack."""
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MEDICAL_DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-only-jwt-secret-with-sufficient-length")

import len as medical_api  # noqa: E402


class MedicalAuthorizationTests(unittest.TestCase):
    def setUp(self):
        medical_api.app.config["TESTING"] = True
        self.context = medical_api.app.app_context()
        self.context.push()
        medical_api.db.drop_all()
        medical_api.db.create_all()
        self.user = self.create_user("User", "user@example.test", "user-pass", "user")
        self.other = self.create_user("Other", "other@example.test", "other-pass", "user")
        self.admin = self.create_user("Admin", "admin@example.test", "admin-pass", "admin")
        self.client = medical_api.app.test_client()

    def tearDown(self):
        medical_api.db.session.remove()
        medical_api.db.drop_all()
        self.context.pop()

    @staticmethod
    def create_user(name, email, password, role):
        user = medical_api.User(name=name, email=email, role=role)
        user.set_password(password)
        medical_api.db.session.add(user)
        medical_api.db.session.commit()
        return user

    def token(self, email, password):
        response = self.client.post(
            "/api/auth/login", json={"email": email, "password": password}
        )
        self.assertEqual(response.status_code, 200, response.json)
        return response.json["access_token"]

    @staticmethod
    def bearer(token):
        return {"Authorization": f"Bearer {token}"}

    def test_registration_cannot_self_assign_admin_role(self):
        response = self.client.post(
            "/api/auth/register",
            json={"name": "New", "email": "new@example.test", "password": "new-pass",
                  "role": "admin"},
        )
        self.assertEqual(response.status_code, 201, response.json)
        created = medical_api.User.query.filter_by(email="new@example.test").one()
        self.assertEqual(created.role, "user")

    def test_admin_endpoint_requires_token_and_server_side_role(self):
        self.assertEqual(self.client.get("/api/statistics").status_code, 401)

        user_token = self.token("user@example.test", "user-pass")
        self.assertEqual(
            self.client.get("/api/statistics", headers=self.bearer(user_token)).status_code,
            403,
        )

        admin_token = self.token("admin@example.test", "admin-pass")
        response = self.client.get("/api/statistics", headers=self.bearer(admin_token))
        self.assertEqual(response.status_code, 200, response.json)

    def test_record_owner_is_derived_from_token(self):
        user_token = self.token("user@example.test", "user-pass")
        cross = self.client.post(
            "/api/records",
            headers=self.bearer(user_token),
            json={"user_id": self.other.id, "symptoms": ["cough"], "age": 30,
                  "gender": "Nam"},
        )
        self.assertEqual(cross.status_code, 403)

        prediction = {
            "diagnosis": "Test",
            "confidence": 0.9,
            "severity": "Low",
            "recommendations": [],
        }
        with patch.object(medical_api, "predict_disease", return_value=prediction):
            own = self.client.post(
                "/api/records",
                headers=self.bearer(user_token),
                json={"symptoms": ["cough"], "age": 30, "gender": "Nam"},
            )
        self.assertEqual(own.status_code, 201, own.json)
        record = medical_api.db.session.get(
            medical_api.MedicalRecord, own.json["record_id"]
        )
        self.assertEqual(record.user_id, self.user.id)

        other_token = self.token("other@example.test", "other-pass")
        denied = self.client.get(
            f"/api/records/{record.id}", headers=self.bearer(other_token)
        )
        self.assertEqual(denied.status_code, 403)


if __name__ == "__main__":
    unittest.main()
