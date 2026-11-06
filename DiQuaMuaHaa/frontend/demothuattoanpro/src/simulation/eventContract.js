export const EVENT_SOURCE_MODES = Object.freeze({
  SCRIPTED: "SCRIPTED",
  LIVE_DMS: "LIVE_DMS",
  ROAD_VIDEO_ANALYSIS: "ROAD_VIDEO_ANALYSIS",
  VIRTUAL_WORLD: "VIRTUAL_WORLD",
});

export const EVENT_SEVERITIES = Object.freeze({
  INFO: "INFO",
  CAUTION: "CAUTION",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
  UNAVAILABLE: "UNAVAILABLE",
});

const severities = new Set(Object.values(EVENT_SEVERITIES));
const sourceModes = new Set(Object.values(EVENT_SOURCE_MODES));

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Creates the single event envelope used by the integrated cockpit.
 * Simulated events use monotonic seconds for occurredAt. External events use
 * an ISO timestamp supplied by their adapter. No confidence is invented.
 */
export function createNormalizedEvent(input) {
  const severity = requiredText(input.severity, "severity");
  const sourceMode = requiredText(input.sourceMode, "sourceMode");
  if (!severities.has(severity)) throw new RangeError(`Unsupported severity: ${severity}`);
  if (!sourceModes.has(sourceMode)) throw new RangeError(`Unsupported sourceMode: ${sourceMode}`);
  if (typeof input.simulated !== "boolean") {
    throw new TypeError("simulated must be a boolean");
  }
  if (
    !(Number.isFinite(input.occurredAt) && input.occurredAt >= 0) &&
    Number.isNaN(Date.parse(input.occurredAt))
  ) {
    throw new TypeError("occurredAt must be monotonic seconds or an ISO timestamp");
  }

  const receivedAt = input.receivedAt || new Date().toISOString();
  if (Number.isNaN(Date.parse(receivedAt))) {
    throw new TypeError("receivedAt must be an ISO timestamp");
  }

  return Object.freeze({
    eventId: requiredText(input.eventId, "eventId"),
    eventType: requiredText(input.eventType, "eventType"),
    severity,
    source: requiredText(input.source, "source"),
    sourceMode,
    simulated: input.simulated,
    streamId: requiredText(input.streamId, "streamId"),
    sessionId: requiredText(input.sessionId, "sessionId"),
    occurredAt: input.occurredAt,
    receivedAt,
    payload: Object.freeze({ ...(input.payload || {}) }),
    confidenceOrStatus: input.confidenceOrStatus ?? null,
    reason: requiredText(input.reason, "reason"),
  });
}

export function simulationEventId(sessionId, timelineEvent, index = 0) {
  const at = Number(timelineEvent?.at || 0).toFixed(3);
  return `${sessionId}:${at}:${timelineEvent?.type || "EVENT"}:${index}`;
}

/** Rejects duplicates, malformed input and external stream regressions. */
export class NormalizedEventGuard {
  constructor({ maximumAgeMs = 10_000, now = () => Date.now() } = {}) {
    this.maximumAgeMs = maximumAgeMs;
    this.now = now;
    this.seen = new Set();
    this.lastExternalTimestamp = new Map();
  }

  accept(candidate) {
    let event;
    try {
      event = createNormalizedEvent(candidate);
    } catch (error) {
      return { accepted: false, reason: "MALFORMED_EVENT", error };
    }
    if (this.seen.has(event.eventId)) {
      return { accepted: false, reason: "DUPLICATE_EVENT", event };
    }
    if (!event.simulated) {
      const occurredAtMs = Date.parse(event.occurredAt);
      if (this.now() - occurredAtMs > this.maximumAgeMs) {
        return { accepted: false, reason: "STALE_EVENT", event };
      }
      const previous = this.lastExternalTimestamp.get(event.streamId);
      if (previous != null && occurredAtMs < previous) {
        return { accepted: false, reason: "OUT_OF_ORDER_EVENT", event };
      }
      this.lastExternalTimestamp.set(event.streamId, occurredAtMs);
    }
    this.seen.add(event.eventId);
    return { accepted: true, reason: "ACCEPTED", event };
  }

  reset() {
    this.seen.clear();
    this.lastExternalTimestamp.clear();
  }
}
