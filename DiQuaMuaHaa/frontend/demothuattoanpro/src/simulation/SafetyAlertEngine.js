import { EVENT_SEVERITIES } from "./eventContract.js";

export const ALERT_PRIORITY = Object.freeze({
  INFO: 1,
  CAUTION: 2,
  UNAVAILABLE: 3,
  WARNING: 4,
  CRITICAL: 5,
});

const COPY = Object.freeze({
  DRIVER_DISTRACTED: "PHÁT HIỆN TÀI XẾ MẤT TẬP TRUNG",
  DRIVER_DROWSY: "CẢNH BÁO BUỒN NGỦ — HÃY TẬP TRUNG",
  DRIVER_HIGH_RISK: "NGUY CƠ TÀI XẾ Ở MỨC CAO",
  PHONE_USAGE: "PHÁT HIỆN SỬ DỤNG ĐIỆN THOẠI",
  FACE_NOT_DETECTED: "KHÔNG PHÁT HIỆN KHUÔN MẶT",
  CAMERA_UNAVAILABLE: "MẤT TÍN HIỆU CAMERA",
  MODEL_UNAVAILABLE: "KHÔNG CÓ MODEL KHẢ DỤNG",
  OBSTACLE_AHEAD: "PHÁT HIỆN VẬT CẢN PHÍA TRƯỚC",
  OBSTACLE_CRITICAL: "NGUY HIỂM — ĐANG GIẢM TỐC TRONG MÔ PHỎNG",
  LANE_CHANGE_STARTED: "XE MÔ PHỎNG ĐANG CHUYỂN LÀN",
  LANE_CHANGE_ABORTED: "HỦY CHUYỂN LÀN — HÀNH LANG KHÔNG CÒN AN TOÀN",
  BRAKING: "ĐANG GIẢM TỐC TRONG MÔ PHỎNG",
  SAFE_STOP: "KHÔNG CÓ HÀNH LANG NÉ PHÙ HỢP — DỪNG XE",
  COLLISION_SIMULATED: "VA CHẠM TRONG THẾ GIỚI ẢO",
  DRIVER_RECOVERED: "TÀI XẾ ĐÃ PHỤC HỒI",
});

export class SafetyAlertEngine {
  constructor({ audioCooldownMs = 4_000, recoveryHoldMs = 1_500, now = () => Date.now() } = {}) {
    this.audioCooldownMs = audioCooldownMs;
    this.recoveryHoldMs = recoveryHoldMs;
    this.now = now;
    this.reset();
  }

  ingest(event) {
    if (!event?.eventId || !EVENT_SEVERITIES[event.severity]) {
      return { accepted: false, reason: "INVALID_NORMALIZED_EVENT", alert: null };
    }
    if (this.eventIds.has(event.eventId)) {
      return { accepted: false, reason: "DUPLICATE_EVENT", alert: null };
    }
    this.eventIds.add(event.eventId);
    if (event.eventType === "DRIVER_RECOVERED") {
      for (const [key, active] of this.alerts) {
        if (["DRIVER_DISTRACTED", "DRIVER_DROWSY", "DRIVER_HIGH_RISK", "PHONE_USAGE"].includes(active.type)) {
          this.alerts.set(key, Object.freeze({ ...active, acknowledged: true, updatedAt: this.now() }));
        }
      }
    }
    const alertKey = `${event.eventType}:${event.source}:${event.reason}`;
    const previous = this.alerts.get(alertKey);
    const now = this.now();
    if (previous && now - previous.updatedAt < 300) {
      return { accepted: false, reason: "DEBOUNCED", alert: previous };
    }
    const audioKey = event.severity === EVENT_SEVERITIES.CRITICAL ? "CRITICAL" : event.eventType;
    const lastAudio = this.lastAudioAt.get(audioKey) ?? Number.NEGATIVE_INFINITY;
    const shouldPlayAudio =
      !this.silenced &&
      event.severity !== EVENT_SEVERITIES.INFO &&
      (event.severity === EVENT_SEVERITIES.CRITICAL || now - lastAudio >= this.audioCooldownMs);
    if (shouldPlayAudio) this.lastAudioAt.set(audioKey, now);

    const alert = Object.freeze({
      alertId: alertKey,
      type: event.eventType,
      severity: event.severity,
      message: COPY[event.eventType] || event.reason,
      reason: event.reason,
      source: event.source,
      timestamp: event.occurredAt,
      acknowledged: false,
      silenced: this.silenced,
      relatedEventId: event.eventId,
      sourceMode: event.sourceMode,
      simulated: event.simulated,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      shouldPlayAudio,
    });
    this.alerts.set(alertKey, alert);
    this.history.push(alert);
    if (this.history.length > 500) this.history.splice(0, this.history.length - 500);
    return { accepted: true, reason: "ACCEPTED", alert };
  }

  getActive() {
    return [...this.alerts.values()]
      .filter((alert) => !alert.acknowledged)
      .sort((a, b) => ALERT_PRIORITY[b.severity] - ALERT_PRIORITY[a.severity] || b.updatedAt - a.updatedAt);
  }

  getPrimary() {
    return this.getActive()[0] || null;
  }

  acknowledge(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;
    this.alerts.set(alertId, Object.freeze({ ...alert, acknowledged: true, updatedAt: this.now() }));
    return true;
  }

  setSilenced(silenced) {
    this.silenced = Boolean(silenced);
  }

  clearRecovered() {
    const cutoff = this.now() - this.recoveryHoldMs;
    for (const [key, alert] of this.alerts) {
      if (alert.severity !== EVENT_SEVERITIES.CRITICAL && alert.updatedAt <= cutoff) {
        this.alerts.delete(key);
      }
    }
  }

  reset() {
    this.alerts = new Map();
    this.history = [];
    this.eventIds = new Set();
    this.lastAudioAt = new Map();
    this.silenced = false;
  }
}

export function alertCopy(eventType) {
  return COPY[eventType] || eventType;
}
