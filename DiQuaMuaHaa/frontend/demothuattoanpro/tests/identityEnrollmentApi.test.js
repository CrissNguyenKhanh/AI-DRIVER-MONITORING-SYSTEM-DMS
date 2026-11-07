import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createIdentityEnrollmentChallenge,
  getDriverIdentityProfile,
  submitIdentityEnrollment,
} from "../src/utils/identityEnrollmentApi.js";

test("fresh-browser profile lookup uses server metadata", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ driver_id: "driver-a", has_registered: true }),
    };
  };
  try {
    const result = await getDriverIdentityProfile("https://dms.example", "driver-a");
    assert.equal(result.ok, true);
    assert.equal(result.data.has_registered, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(captured.url, /driver_profile\?driver_id=driver-a$/);
});

test("enrollment challenge distinguishes initial enrollment and replacement", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 202,
      json: async () => ({ challenge_id: "challenge-a" }),
    };
  };
  try {
    await createIdentityEnrollmentChallenge("https://dms.example", {
      driverId: "driver-a",
      operation: "replace",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(captured.url, /identity\/enrollment\/challenge$/);
  assert.deepEqual(JSON.parse(captured.options.body), {
    driver_id: "driver-a",
    operation: "replace",
  });
});

test("ordinary bearer flow cannot submit enrollment without an approval grant", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("must not fetch");
  };
  try {
    const result = await submitIdentityEnrollment("https://dms.example", {
      driverId: "driver-a",
      operation: "initial_enroll",
      images: ["frame"],
    });
    assert.equal(result.ok, false);
    assert.equal(result.data.code, "enrollment_grant_required");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("face enrollment UI has no face-image localStorage dependency", async () => {
  const source = await readFile(
    new URL("../src/systeamdetectface/face_detect.jsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /driver_owner_image_v1/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*image/i);
  assert.match(source, /refreshServerProfile/);
});

test("authenticated UI consumes identity metadata without stored biometric images", async () => {
  const paths = [
    "../src/systeamdetectface/DriverAuthenticatedWelcome.jsx",
    "../src/testdata/thucmuctest.jsx",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /profile_image_base64/);
  }
});
