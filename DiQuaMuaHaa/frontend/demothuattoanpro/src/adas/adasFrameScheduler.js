export const ADAS_FRAME_INTERVAL_MS = 260;
export const ADAS_CAPTURE_MAX_WIDTH = 960;

export function shouldSubmitAdasFrame({
  running,
  inFlight,
  now,
  lastSubmittedAt,
  intervalMs = ADAS_FRAME_INTERVAL_MS,
}) {
  return Boolean(
    running &&
      !inFlight &&
      Number.isFinite(now) &&
      now - lastSubmittedAt >= intervalMs,
  );
}

export function decisionLabel(decision) {
  const labels = {
    KEEP_LANE: "Suggested simulated path: KEEP LANE",
    SLOW_DOWN: "Suggested simulation response: SLOW DOWN",
    STOP: "Suggested simulation response: STOP",
    SHIFT_LEFT: "Suggested simulated path: LEFT",
    SHIFT_RIGHT: "Suggested simulated path: RIGHT",
    UNKNOWN: "Simulation uncertain: NO PATH RECOMMENDATION",
  };
  return labels[decision] || labels.UNKNOWN;
}
