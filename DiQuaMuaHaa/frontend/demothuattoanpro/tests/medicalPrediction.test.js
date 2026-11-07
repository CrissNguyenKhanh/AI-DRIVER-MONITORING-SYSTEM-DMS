import assert from "node:assert/strict";
import test from "node:test";

import { normalizeImagePredictionResponse } from "../src/utils/medicalPrediction.js";

test("normalizes a successful image prediction", () => {
  const result = normalizeImagePredictionResponse(
    { ok: true, status: 200 },
    {
      success: true,
      prediction: { diagnosis: "Normal", confidence: 0.8 },
      record_id: 9,
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.diagnosis, "Normal");
  assert.equal(result.record_id, 9);
});

test("shows an explicit unavailable state for model_unavailable", () => {
  const result = normalizeImagePredictionResponse(
    { ok: false, status: 503 },
    { success: false, code: "model_unavailable" },
  );

  assert.equal(result.success, false);
  assert.equal(result.unavailable, true);
  assert.match(result.error, /không khả dụng/i);
  assert.match(result.error, /không có chẩn đoán nào/i);
});

test("does not interpret malformed success payloads as predictions", () => {
  const result = normalizeImagePredictionResponse(
    { ok: true, status: 200 },
    { success: true },
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "request_failed");
});
