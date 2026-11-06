import assert from "node:assert/strict";
import test from "node:test";

import { createSimulationLoop } from "../src/simulation/simulationLoop.js";

test("simulation loop is idempotent, bounded and stops cleanly", () => {
  const callbacks = new Map();
  const cancelled = [];
  const frames = [];
  let nextHandle = 1;
  const loop = createSimulationLoop({
    onFrame: (elapsed, timestamp) => frames.push({ elapsed, timestamp }),
    requestFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      cancelled.push(handle);
      callbacks.delete(handle);
    },
    maxRealDeltaSeconds: 0.1,
  });

  loop.start();
  loop.start();
  assert.equal(callbacks.size, 1);

  callbacks.get(1)(1000);
  callbacks.get(2)(1500);
  assert.deepEqual(frames, [
    { elapsed: 0, timestamp: 1000 },
    { elapsed: 0.1, timestamp: 1500 },
  ]);

  loop.stop();
  assert.equal(loop.isRunning(), false);
  assert.deepEqual(cancelled, [3]);
  assert.equal(callbacks.size, 2, "only the pending callback is cancelled");
});

test("stale callback after stop cannot update state", () => {
  let callback;
  let updates = 0;
  const loop = createSimulationLoop({
    onFrame: () => {
      updates += 1;
    },
    requestFrame: (value) => {
      callback = value;
      return 7;
    },
    cancelFrame: () => {},
  });

  loop.start();
  loop.stop();
  callback(100);
  assert.equal(updates, 0);
});
