import test from "node:test";
import assert from "node:assert/strict";
import {
  clearDmsAuthSession,
  dmsAuthHeaders,
  medicalAuthHeaders,
  saveDmsAuthSession,
} from "../src/utils/authApi.js";

function localStorageStub() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
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
