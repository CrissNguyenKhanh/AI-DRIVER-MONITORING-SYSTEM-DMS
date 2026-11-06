/**
 * Small requestAnimationFrame owner used by the demo page.
 * The simulation engine itself owns the fixed timestep; this adapter only
 * converts browser frame timestamps into bounded elapsed seconds and guarantees
 * that unmount/stop cancels the outstanding callback.
 */
export function createSimulationLoop({
  onFrame,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
  maxRealDeltaSeconds = 0.25,
}) {
  if (typeof onFrame !== "function") {
    throw new TypeError("onFrame must be a function");
  }

  let running = false;
  let handle = null;
  let lastTimestamp = null;

  const tick = (timestamp) => {
    if (!running) return;
    const elapsed =
      lastTimestamp == null
        ? 0
        : Math.min(
            maxRealDeltaSeconds,
            Math.max(0, (timestamp - lastTimestamp) / 1000),
          );
    lastTimestamp = timestamp;
    onFrame(elapsed, timestamp);
    if (running) handle = requestFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastTimestamp = null;
      handle = requestFrame(tick);
    },
    stop() {
      running = false;
      lastTimestamp = null;
      if (handle != null) cancelFrame(handle);
      handle = null;
    },
    isRunning() {
      return running;
    },
  };
}
