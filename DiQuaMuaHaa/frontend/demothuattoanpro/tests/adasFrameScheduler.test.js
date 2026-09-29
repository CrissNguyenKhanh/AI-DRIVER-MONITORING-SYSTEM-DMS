import test from "node:test";
import assert from "node:assert/strict";
import {
  ADAS_FRAME_INTERVAL_MS,
  decisionLabel,
  shouldSubmitAdasFrame,
} from "../src/adas/adasFrameScheduler.js";

test("ADAS scheduler submits only one eligible frame at a time", () => {
  assert.equal(
    shouldSubmitAdasFrame({
      running: true,
      inFlight: false,
      now: ADAS_FRAME_INTERVAL_MS,
      lastSubmittedAt: 0,
    }),
    true,
  );
  assert.equal(
    shouldSubmitAdasFrame({
      running: true,
      inFlight: true,
      now: ADAS_FRAME_INTERVAL_MS * 2,
      lastSubmittedAt: 0,
    }),
    false,
  );
});

test("ADAS scheduler respects pause and sampling interval", () => {
  assert.equal(
    shouldSubmitAdasFrame({
      running: false,
      inFlight: false,
      now: 1000,
      lastSubmittedAt: 0,
    }),
    false,
  );
  assert.equal(
    shouldSubmitAdasFrame({
      running: true,
      inFlight: false,
      now: ADAS_FRAME_INTERVAL_MS - 1,
      lastSubmittedAt: 0,
    }),
    false,
  );
});

test("all supported simulated decisions have safe UI copy", () => {
  for (const decision of [
    "KEEP_LANE",
    "SLOW_DOWN",
    "STOP",
    "SHIFT_LEFT",
    "SHIFT_RIGHT",
    "UNKNOWN",
  ]) {
    assert.match(decisionLabel(decision), /simulat|Simulation/);
  }
  assert.equal(decisionLabel("UNSUPPORTED"), decisionLabel("UNKNOWN"));
});
