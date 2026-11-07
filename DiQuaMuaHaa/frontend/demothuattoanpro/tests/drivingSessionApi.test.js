import assert from "node:assert/strict";
import test from "node:test";

import {
  createDrivingAuthorizationChallenge,
  getDrivingAuthorizationChallenge,
  startDrivingSession,
} from "../src/utils/drivingSessionApi.js";

test("start session fails locally when the server-approved grant is missing", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("must not fetch");
  };
  try {
    const result = await startDrivingSession("https://dms.example", {
      driverId: "driver-a",
    });
    assert.equal(result.ok, false);
    assert.equal(result.data.code, "verification_grant_required");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("challenge and status requests keep the purpose on the server contract", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () =>
        url.includes("/challenge/challenge-a")
          ? { challenge_id: "challenge-a", status: "approved" }
          : { challenge_id: "challenge-a", verification_token: "ephemeral" },
    };
  };
  try {
    await createDrivingAuthorizationChallenge("https://dms.example", {
      driverId: "driver-a",
    });
    await getDrivingAuthorizationChallenge("https://dms.example", "challenge-a");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.driver_id, "driver-a");
  assert.equal(body.purpose, "start_driving_session");
  assert.match(calls[1].url, /challenge\/challenge-a$/);
});

test("start session sends the ephemeral grant only in the request body", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ session_id: 7 }) };
  };
  try {
    const result = await startDrivingSession("https://dms.example", {
      driverId: "driver-a",
      verificationGrant: "one-time-grant",
    });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.doesNotMatch(captured.url, /one-time-grant/);
  assert.equal(
    JSON.parse(captured.options.body).verification_grant,
    "one-time-grant",
  );
});
