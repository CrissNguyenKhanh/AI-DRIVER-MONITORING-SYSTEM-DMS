import { DMS_STATES } from "../simulation/constants.js";
import {
  EVENT_SEVERITIES,
  EVENT_SOURCE_MODES,
  NormalizedEventGuard,
  createNormalizedEvent,
} from "../simulation/eventContract.js";

const validStates = new Set(Object.values(DMS_STATES));
const severityForState = Object.freeze({
  NORMAL: EVENT_SEVERITIES.INFO,
  DISTRACTED: EVENT_SEVERITIES.WARNING,
  DROWSY: EVENT_SEVERITIES.WARNING,
  HIGH_RISK: EVENT_SEVERITIES.CRITICAL,
  UNKNOWN: EVENT_SEVERITIES.UNAVAILABLE,
});
const eventTypeForState = Object.freeze({
  NORMAL: "DRIVER_RECOVERED",
  DISTRACTED: "DRIVER_DISTRACTED",
  DROWSY: "DRIVER_DROWSY",
  HIGH_RISK: "DRIVER_HIGH_RISK",
  UNKNOWN: "CAMERA_UNAVAILABLE",
});

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

export function normalizeDmsResult(raw, context = {}) {
  const state = validStates.has(raw?.attention_state) ? raw.attention_state : DMS_STATES.UNKNOWN;
  const occurredAt = raw?.occurred_at || context.occurredAt || new Date().toISOString();
  const streamId = String(context.streamId || raw?.stream_id || "live-dms");
  const sessionId = String(context.sessionId || "unprotected-live-preview");
  const reason = String(raw?.reason || (state === DMS_STATES.UNKNOWN ? "DMS_RESULT_UNAVAILABLE" : `DMS_${state}`));
  return createNormalizedEvent({
    eventId: String(raw?.event_id || `${streamId}:${occurredAt}:${state}`),
    eventType: eventTypeForState[state],
    severity: severityForState[state],
    source: "DriverMonitoringAdapter",
    sourceMode: EVENT_SOURCE_MODES.LIVE_DMS,
    simulated: false,
    streamId,
    sessionId,
    occurredAt,
    receivedAt: context.receivedAt || new Date().toISOString(),
    payload: {
      state,
      faceDetected: raw?.face_detected ?? null,
      eyeState: raw?.eye_state || "UNKNOWN",
      ear: {
        left: finiteOrNull(raw?.ear?.left),
        right: finiteOrNull(raw?.ear?.right),
        average: finiteOrNull(raw?.ear?.average),
      },
      perclos: finiteOrNull(raw?.perclos),
      headPose: raw?.head_pose || null,
      phoneUsage: raw?.phone_usage === true,
      handGesture: raw?.hand_gesture || null,
      modelStatus: raw?.model_status || null,
    },
    confidenceOrStatus: raw?.status || raw?.model_status || null,
    reason,
  });
}

export class DriverMonitoringAdapter {
  constructor({ streamId, sessionId, maximumAgeMs = 5_000, now } = {}) {
    this.streamId = streamId || `dms-${Math.random().toString(36).slice(2)}`;
    this.sessionId = sessionId || "unprotected-live-preview";
    this.guard = new NormalizedEventGuard({ maximumAgeMs, now });
    this.last = null;
    this.lastState = null;
    this.phoneActive = false;
  }

  ingest(raw) {
    let normalized;
    try {
      normalized = normalizeDmsResult(raw, {
        streamId: this.streamId,
        sessionId: this.sessionId,
      });
    } catch (error) {
      return { accepted: false, reason: "MALFORMED_DMS_RESULT", error };
    }
    const result = this.guard.accept(normalized);
    if (!result.accepted) return result;
    const events = [];
    if (result.event.payload.state !== this.lastState) events.push(result.event);
    const nextPhoneActive = result.event.payload.phoneUsage === true;
    if (nextPhoneActive && !this.phoneActive) {
      const phoneEvent = createNormalizedEvent({
        ...result.event,
        eventId: `${result.event.eventId}:phone`,
        eventType: "PHONE_USAGE",
        severity: EVENT_SEVERITIES.WARNING,
        payload: { ...result.event.payload, active: true },
        reason: "LIVE_DMS_PHONE_USAGE",
      });
      const phoneResult = this.guard.accept(phoneEvent);
      if (phoneResult.accepted) events.push(phoneResult.event);
    }
    this.last = result.event;
    this.lastState = result.event.payload.state;
    this.phoneActive = nextPhoneActive;
    return { ...result, events, stateChanged: events.includes(result.event) };
  }

  unavailable(reason = "DMS_BACKEND_UNAVAILABLE") {
    return this.ingest({
      attention_state: DMS_STATES.UNKNOWN,
      occurred_at: new Date(this.guard.now()).toISOString(),
      reason,
      status: "UNAVAILABLE",
    });
  }

  reset() {
    this.guard.reset();
    this.last = null;
    this.lastState = null;
    this.phoneActive = false;
  }
}

/**
 * Cross-tab bridge for the existing DMS surface. It transports metrics only;
 * webcam frames, face landmarks, tokens and biometric data are never copied.
 */
export function createDmsMetricsChannel({ onResult, channelFactory } = {}) {
  const Factory = channelFactory || globalThis.BroadcastChannel;
  if (!Factory) return { available: false, publish() {}, close() {} };
  const channel = new Factory("dms-attention-v2");
  if (onResult) channel.onmessage = (event) => onResult(event.data);
  return {
    available: true,
    publish(metrics) {
      channel.postMessage({
        attention_state: metrics?.attention_state || "UNKNOWN",
        face_detected: metrics?.face_detected ?? null,
        eye_state: metrics?.eye_state || "UNKNOWN",
        ear: metrics?.ear || null,
        perclos: finiteOrNull(metrics?.perclos),
        head_pose: metrics?.head_pose || null,
        reason: metrics?.reason || null,
        model_status: metrics?.model_status || null,
        occurred_at: new Date().toISOString(),
      });
    },
    close() {
      channel.close();
    },
  };
}
