import test from "node:test";
import assert from "node:assert/strict";
import { createCameraSession } from "../src/utils/cameraSession.js";

function fixture() {
  let resolvePermission;
  let rejectPermission;
  let calls = 0;
  let stops = 0;
  const permission = new Promise((resolve, reject) => {
    resolvePermission = resolve;
    rejectPermission = reject;
  });
  const stream = {
    getTracks: () => [{ stop: () => { stops += 1; } }],
  };
  const video = { srcObject: null };
  const statuses = [];
  const errors = [];
  const session = createCameraSession({
    getUserMedia: () => {
      calls += 1;
      return permission;
    },
    getVideo: () => video,
    checkSupport: () => "",
    onStatus: (value) => statuses.push(value),
    onError: (value) => errors.push(value),
  });
  return {
    session,
    video,
    stream,
    statuses,
    errors,
    resolvePermission,
    rejectPermission,
    calls: () => calls,
    stops: () => stops,
  };
}

test("duplicate starts share one pending request and active stream", async () => {
  const item = fixture();
  const first = item.session.start();
  assert.equal(item.session.start(), first);
  item.resolvePermission(item.stream);
  await first;
  await item.session.start();
  assert.equal(item.calls(), 1);
  assert.equal(item.video.srcObject, item.stream);
  item.session.stop();
  assert.equal(item.stops(), 1);
  assert.equal(item.video.srcObject, null);
});

test("late permission after unmount releases tracks without state updates", async () => {
  const item = fixture();
  const first = item.session.start();
  item.session.dispose();
  const before = [...item.statuses];
  item.resolvePermission(item.stream);
  await first;
  assert.equal(item.stops(), 1);
  assert.equal(item.video.srcObject, null);
  assert.deepEqual(item.statuses, before);
});

test("stop during permission prompt releases the eventual stream", async () => {
  const item = fixture();
  const first = item.session.start();
  item.session.stop();
  item.resolvePermission(item.stream);
  await first;
  assert.equal(item.stops(), 1);
  assert.equal(item.statuses.at(-1), "idle");
});

test("stop and restart while pending never duplicates camera access", async () => {
  const item = fixture();
  const first = item.session.start();
  item.session.stop();
  item.session.start();
  item.resolvePermission(item.stream);
  await first;
  assert.equal(item.calls(), 1);
  assert.equal(item.video.srcObject, item.stream);
  item.session.dispose();
  assert.equal(item.stops(), 1);
});

test("permission rejection is ignored after disposal", async () => {
  for (const dispose of [false, true]) {
    const item = fixture();
    const first = item.session.start();
    if (dispose) item.session.dispose();
    item.rejectPermission(new Error("denied"));
    await first;
    assert.equal(item.errors.includes("denied"), !dispose);
    assert.notEqual(item.statuses.at(-1), "active");
  }
});

test("custom constraints and ready status are forwarded", async () => {
  let received;
  const statuses = [];
  const stream = { getTracks: () => [] };
  const session = createCameraSession({
    getUserMedia: async (constraints) => {
      received = constraints;
      return stream;
    },
    getVideo: () => ({ srcObject: null }),
    checkSupport: () => "",
    onStatus: (value) => statuses.push(value),
    onError: () => {},
    constraints: { video: { width: 640 }, audio: false },
    activeStatus: "auth",
  });
  await session.start();
  assert.deepEqual(received, { video: { width: 640 }, audio: false });
  assert.equal(statuses.at(-1), "auth");
  session.dispose();
});
