import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiBase } from "../src/config/resolveApiBase.js";

test("production requires explicit DMS configuration", () => {
  assert.throws(() => resolveApiBase({ development: false, origin: "https://frontend.example" }), /VITE_API_BASE is required/);
});
test("production uses configured HTTPS origin for REST and sockets", () => {
  assert.equal(resolveApiBase({ configured: " https://api.example/// ", development: false }), "https://api.example");
  assert.equal(resolveApiBase({ configured: "/", development: false, origin: "https://frontend.example" }), "https://frontend.example");
});
test("invalid, credentialed, namespace and mixed-content URLs are rejected", () => {
  for (const configured of ["http://api.example", "ftp://api.example", "https://u:p@api.example", "https://api.example/api", "https://api.example?token=x", "https://api.example#x", "//api.example"]) {
    assert.throws(() => resolveApiBase({ configured, development: false }));
  }
  assert.throws(() => resolveApiBase({ configured: "http://localhost:8000", development: true, origin: "https://localhost:5173" }), /HTTPS/);
});
test("development uses Vite same-origin proxies including HTTPS/LAN", () => {
  for (const origin of ["https://localhost:5173", "http://192.168.1.5:5173"]) {
    assert.equal(resolveApiBase({ development: true, origin }), origin);
    assert.equal(resolveApiBase({ development: true, origin, service: "medical" }), origin + "/api-medical");
  }
  assert.equal(resolveApiBase({ development: true }), "http://localhost:8000");
});
test("medical service is independently configured", () => {
  assert.throws(() => resolveApiBase({ development: false, service: "medical" }), /VITE_MEDICAL_API_BASE/);
  assert.equal(resolveApiBase({ configured: "https://medical.example/prefix/", development: false, service: "medical" }), "https://medical.example/prefix");
});
