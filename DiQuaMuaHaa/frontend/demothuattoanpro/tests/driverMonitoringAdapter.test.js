import assert from "node:assert/strict";
import test from "node:test";

import {
  DriverMonitoringAdapter,
  createDmsMetricsChannel,
  normalizeDmsResult,
} from "../src/utils/DriverMonitoringAdapter.js";

const iso = "2026-11-07T12:00:00.000Z";

test("DMS adapter maps all backend attention states without fabricating confidence", () => {
  for (const state of ["NORMAL", "DISTRACTED", "DROWSY", "HIGH_RISK", "UNKNOWN"]) {
    const event = normalizeDmsResult({ attention_state: state, occurred_at: iso }, {
      streamId: "camera-1",
      sessionId: "preview-1",
      receivedAt: iso,
    });
    assert.equal(event.payload.state, state);
    assert.equal(event.sourceMode, "LIVE_DMS");
    assert.equal(event.simulated, false);
    assert.equal(event.confidenceOrStatus, null);
  }
});

test("DMS adapter handles timeout, camera disconnect, stale results and session isolation", () => {
  const now = Date.parse("2026-11-07T12:00:10.000Z");
  const adapter = new DriverMonitoringAdapter({
    streamId: "camera-a",
    sessionId: "session-a",
    maximumAgeMs: 3_000,
    now: () => now,
  });
  const stale = adapter.ingest({ attention_state: "NORMAL", occurred_at: iso, session_id: "forged" });
  assert.equal(stale.reason, "STALE_EVENT");
  const disconnected = adapter.ingest({
    attention_state: "UNKNOWN",
    occurred_at: "2026-11-07T12:00:09.000Z",
    reason: "CAMERA_DISCONNECTED",
  });
  assert.equal(disconnected.accepted, true);
  assert.equal(disconnected.event.sessionId, "session-a");
  assert.equal(disconnected.event.severity, "UNAVAILABLE");
  const timeout = adapter.unavailable("API_TIMEOUT");
  assert.equal(timeout.accepted, true);
  assert.equal(timeout.event.reason, "API_TIMEOUT");
  assert.equal(timeout.event.payload.state, "UNKNOWN");
});

test("DMS adapter emits transitions and phone usage once without per-frame alert spam", () => {
  let now = Date.parse(iso);
  const adapter = new DriverMonitoringAdapter({ streamId: "camera-a", sessionId: "session-a", now: () => now });
  const first = adapter.ingest({ attention_state: "NORMAL", occurred_at: new Date(now).toISOString() });
  assert.deepEqual(first.events.map((event) => event.eventType), ["DRIVER_RECOVERED"]);
  now += 100;
  const steady = adapter.ingest({ attention_state: "NORMAL", occurred_at: new Date(now).toISOString() });
  assert.deepEqual(steady.events, []);
  now += 100;
  const phone = adapter.ingest({ attention_state: "DISTRACTED", phone_usage: true, occurred_at: new Date(now).toISOString() });
  assert.deepEqual(phone.events.map((event) => event.eventType), ["DRIVER_DISTRACTED", "PHONE_USAGE"]);
  now += 100;
  const phoneSteady = adapter.ingest({ attention_state: "DISTRACTED", phone_usage: true, occurred_at: new Date(now).toISOString() });
  assert.deepEqual(phoneSteady.events, []);
});

test("metrics channel copies metrics only and closes cleanly", () => {
  const messages = [];
  let closed = false;
  class FakeChannel {
    postMessage(value) { messages.push(value); }
    close() { closed = true; }
  }
  const channel = createDmsMetricsChannel({ channelFactory: FakeChannel });
  channel.publish({ attention_state: "DROWSY", perclos: 0.55, raw_image: "must-not-be-copied" });
  assert.equal(messages[0].attention_state, "DROWSY");
  assert.equal(messages[0].perclos, 0.55);
  assert.equal("raw_image" in messages[0], false);
  channel.close();
  assert.equal(closed, true);
});
