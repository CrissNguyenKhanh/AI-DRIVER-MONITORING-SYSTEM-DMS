import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LOCAL_RECORDING_BYTES,
  MAX_LOCAL_RECORDING_MS,
  disposeRecordingResources,
  drawRecordingComposite,
  recordingExtension,
  selectRecordingMimeType,
} from "../src/simulation/recording.js";

test("recording chooses supported WebM first and reports extension", () => {
  const mime = selectRecordingMimeType((value) => value === "video/webm;codecs=vp8");
  assert.equal(mime, "video/webm;codecs=vp8");
  assert.equal(recordingExtension(mime), "webm");
  assert.equal(recordingExtension("video/mp4"), "mp4");
  assert.equal(selectRecordingMimeType(() => false), "");
});

test("recording composite includes simulation-only state labels", () => {
  const calls = [];
  const context = {
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    fillText: (...args) => calls.push(["fillText", ...args]),
    set fillStyle(value) {
      calls.push(["fillStyle", value]);
    },
    set font(value) {
      calls.push(["font", value]);
    },
  };

  drawRecordingComposite({
    context,
    sourceCanvas: { id: "three-canvas" },
    width: 1280,
    height: 720,
    overlay: {
      scenarioLabel: "S03",
      driverState: "DISTRACTED",
      assistanceMode: "SIMULATED_LANE_CHANGE",
      decision: "SHIFT_LEFT",
      speedKph: 42,
    },
  });

  const text = calls.filter(([name]) => name === "fillText").map((call) => call[1]).join(" ");
  assert.match(text, /MÔ PHỎNG/);
  assert.match(text, /DISTRACTED/);
  assert.match(text, /SHIFT_LEFT/);
});

test("recording cleanup cancels animation and stops every local stream track", () => {
  const calls = [];
  const active = {
    frameHandle: 42,
    cancelFrame: (handle) => calls.push(["cancel", handle]),
    stopTimer: 99,
    clearTimer: (handle) => calls.push(["clear", handle]),
    stream: {
      getTracks: () => [
        { stop: () => calls.push(["stop", "video"]) },
        { stop: () => calls.push(["stop", "audio"]) },
      ],
    },
  };

  disposeRecordingResources(active);
  assert.deepEqual(calls, [
    ["cancel", 42],
    ["clear", 99],
    ["stop", "video"],
    ["stop", "audio"],
  ]);
  assert.equal(active.frameHandle, null);
  assert.equal(active.stopTimer, null);
  assert.equal(MAX_LOCAL_RECORDING_BYTES, 262_144_000);
  assert.equal(MAX_LOCAL_RECORDING_MS, 600_000);
});
