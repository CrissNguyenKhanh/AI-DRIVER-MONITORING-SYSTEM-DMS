import test from "node:test";
import assert from "node:assert/strict";
import {
  clearDmsAuthSession,
  createEnrollmentSubmissionManager,
  dmsAuthHeaders,
  enrollDmsDriver,
  getDmsAuthToken,
  getStoredDmsDriver,
  logoutDmsSession,
  medicalAuthHeaders,
  removeLegacyBiometricStorage,
  saveDmsAuthSession,
  validateDmsSession,
  validateDriverId,
} from "../src/utils/authApi.js";

function localStorageStub() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key),
  };
}

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test("DMS bearer token is attached and can be cleared", () => {
  globalThis.window = { localStorage: localStorageStub() };
  assert.deepEqual(dmsAuthHeaders({ Accept: "application/json" }), {
    Accept: "application/json",
  });

  saveDmsAuthSession("opaque-driver-token", "driver-a");
  assert.deepEqual(dmsAuthHeaders({ Accept: "application/json" }), {
    Accept: "application/json",
    Authorization: "Bearer opaque-driver-token",
  });

  clearDmsAuthSession();
  assert.equal(dmsAuthHeaders().Authorization, undefined);
  delete globalThis.window;
});

test("medical JWT uses the existing login storage key", () => {
  globalThis.window = { localStorage: localStorageStub() };
  globalThis.window.localStorage.setItem("token", "medical-jwt");
  assert.equal(medicalAuthHeaders().Authorization, "Bearer medical-jwt");
  delete globalThis.window;
});

test("driver ID validation allows the backend contract and rejects ambiguous input", () => {
  assert.equal(validateDriverId("driver_001"), true);
  assert.equal(validateDriverId("Tài-xế.01"), true);
  assert.equal(validateDriverId(""), false);
  assert.equal(validateDriverId(" driver-a"), true);
  assert.equal(validateDriverId("bad id"), false);
  assert.equal(validateDriverId("x".repeat(65)), false);
});

test("reload validation trusts /api/auth/me and refreshes stored principal", async () => {
  const localStorage = localStorageStub();
  globalThis.window = { localStorage };
  saveDmsAuthSession("opaque-token", "stale-driver");
  localStorage.setItem("driver_owner_image_v1", "legacy-base64");
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return response(200, {
      role: "driver",
      driver_id: "driver-a",
      expires_at: "2030-01-01 00:00:00",
    });
  };

  const result = await validateDmsSession("https://dms.example");
  assert.equal(result.authenticated, true);
  assert.equal(result.principal.driver_id, "driver-a");
  assert.equal(getStoredDmsDriver(), "driver-a");
  assert.equal(localStorage.has("driver_owner_image_v1"), false);
  assert.equal(request.url, "https://dms.example/api/auth/me");
  assert.equal(request.options.headers.Authorization, "Bearer opaque-token");
  delete globalThis.fetch;
  delete globalThis.window;
});

test("invalid server session is cleared while a network outage preserves it", async () => {
  globalThis.window = { localStorage: localStorageStub() };
  saveDmsAuthSession("expired-token", "driver-a");
  globalThis.fetch = async () => response(401, { code: "invalid_session" });
  const expired = await validateDmsSession("https://dms.example");
  assert.equal(expired.state, "expired");
  assert.equal(getDmsAuthToken(), "");
  assert.equal(getStoredDmsDriver(), "driver-a");

  saveDmsAuthSession("offline-token", "driver-a");
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  const unavailable = await validateDmsSession("https://dms.example");
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.preserveToken, true);
  assert.equal(getDmsAuthToken(), "offline-token");
  delete globalThis.fetch;
  delete globalThis.window;
});

test("enrollment maps wrong, expired, used and mismatched codes to specific messages", async () => {
  globalThis.window = { localStorage: localStorageStub() };
  const cases = [
    [401, "invalid_enrollment_code", "không đúng"],
    [410, "enrollment_code_expired", "hết hạn"],
    [409, "enrollment_code_used", "đã được sử dụng"],
    [403, "driver_id_mismatch", "không thuộc Driver ID"],
  ];
  for (const [status, code, message] of cases) {
    globalThis.fetch = async () => response(status, { code, error: "server detail" });
    const result = await enrollDmsDriver("https://dms.example", {
      driverId: "driver-a",
      enrollmentCode: "one-time",
    });
    assert.equal(result.code, code);
    assert.match(result.message, new RegExp(message, "i"));
  }
  delete globalThis.fetch;
  delete globalThis.window;
});

test("successful enrollment stores server session and clears legacy biometric display data", async () => {
  const localStorage = localStorageStub();
  globalThis.window = { localStorage };
  localStorage.setItem("driver_owner_image_v1", "legacy-base64");
  globalThis.fetch = async () => response(200, {
    access_token: "new-token",
    driver_id: "driver-a",
    expires_at: "2030-01-01 00:00:00",
  });
  const result = await enrollDmsDriver("https://dms.example", {
    driverId: "driver-a",
    enrollmentCode: "one-time",
  });
  assert.equal(result.ok, true);
  assert.equal(getDmsAuthToken(), "new-token");
  assert.equal(removeLegacyBiometricStorage(), false);
  delete globalThis.fetch;
  delete globalThis.window;
});

test("double submit shares one enrollment request", async () => {
  let resolveRequest;
  let calls = 0;
  const deferred = new Promise((resolve) => { resolveRequest = resolve; });
  const manager = createEnrollmentSubmissionManager({
    enroll: () => {
      calls += 1;
      return deferred;
    },
  });
  const first = manager.submit("/", { driverId: "driver-a", enrollmentCode: "one" });
  const second = manager.submit("/", { driverId: "driver-a", enrollmentCode: "one" });
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolveRequest({ ok: true });
  await first;
  assert.equal(manager.pending, false);
});

test("enrollment timeout is bounded and reported without clearing an existing session", async () => {
  globalThis.window = { localStorage: localStorageStub() };
  saveDmsAuthSession("existing-token", "driver-a");
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const result = await enrollDmsDriver(
    "https://dms.example",
    { driverId: "driver-a", enrollmentCode: "one-time" },
    { timeoutMs: 5 },
  );
  assert.equal(result.code, "request_timeout");
  assert.equal(getDmsAuthToken(), "existing-token");
  delete globalThis.fetch;
  delete globalThis.window;
});

test("logout clears the browser session even when the server is offline", async () => {
  globalThis.window = { localStorage: localStorageStub() };
  saveDmsAuthSession("token", "driver-a");
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  const result = await logoutDmsSession("https://dms.example");
  assert.equal(result.ok, true);
  assert.equal(result.serverNotified, false);
  assert.equal(getDmsAuthToken(), "");
  delete globalThis.fetch;
  delete globalThis.window;
});
