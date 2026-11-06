import { EVENT_SEVERITIES, EVENT_SOURCE_MODES, createNormalizedEvent } from "./eventContract.js";

const driverTypes = {
  DISTRACTED: ["DRIVER_DISTRACTED", EVENT_SEVERITIES.WARNING, "Tài xế mất tập trung"],
  DROWSY: ["DRIVER_DROWSY", EVENT_SEVERITIES.WARNING, "Cảnh báo buồn ngủ"],
  HIGH_RISK: ["DRIVER_HIGH_RISK", EVENT_SEVERITIES.CRITICAL, "Rủi ro tài xế ở mức cao"],
  NORMAL: ["DRIVER_RECOVERED", EVENT_SEVERITIES.INFO, "Tài xế đã trở lại bình thường"],
  UNKNOWN: ["CAMERA_UNAVAILABLE", EVENT_SEVERITIES.UNAVAILABLE, "Không xác định được trạng thái tài xế"],
};

const phaseTypes = {
  BRAKING: ["BRAKING", EVENT_SEVERITIES.WARNING, "Xe mô phỏng đang giảm tốc"],
  LANE_CHANGE: ["LANE_CHANGE_STARTED", EVENT_SEVERITIES.WARNING, "Xe mô phỏng đang chuyển làn"],
  ABORTING: ["LANE_CHANGE_ABORTED", EVENT_SEVERITIES.CRITICAL, "Đã hủy chuyển làn vì hành lang không còn an toàn"],
  STOPPING: ["SAFE_STOP", EVENT_SEVERITIES.CRITICAL, "Không có hành lang né phù hợp — đang dừng xe"],
};

function eventEnvelope(snapshot, eventType, severity, reason, payload = {}) {
  const sessionId = `offline-${snapshot.scenarioId}-${snapshot.seed}`;
  return createNormalizedEvent({
    eventId: `${sessionId}:${Number(snapshot.time).toFixed(3)}:${eventType}`,
    eventType,
    severity,
    source: eventType.startsWith("DRIVER") || eventType === "CAMERA_UNAVAILABLE"
      ? "DriverMonitoringAdapter"
      : "RoadPerceptionAdapter",
    sourceMode: EVENT_SOURCE_MODES.VIRTUAL_WORLD,
    simulated: true,
    streamId: `virtual-${snapshot.scenarioId}`,
    sessionId,
    occurredAt: snapshot.time,
    payload,
    confidenceOrStatus: payload.status ?? null,
    reason,
  });
}

/** Creates events only for state transitions, never once per render/frame. */
export function eventsFromSimulationTransition(previous, current) {
  if (!current) return [];
  const events = [];
  if (previous && previous.driver.attention !== current.driver.attention) {
    const definition = driverTypes[current.driver.attention];
    if (definition) {
      events.push(eventEnvelope(current, ...definition, { state: current.driver.attention }));
    }
  }
  if (previous && previous.driver.phoneUsage !== current.driver.phoneUsage && current.driver.phoneUsage) {
    events.push(eventEnvelope(
      current,
      "PHONE_USAGE",
      EVENT_SEVERITIES.WARNING,
      "Kịch bản ghi nhận sử dụng điện thoại",
      { active: true },
    ));
  }
  if (previous && previous.maneuver.phase !== current.maneuver.phase) {
    const definition = phaseTypes[current.maneuver.phase];
    if (definition) {
      events.push(eventEnvelope(current, ...definition, {
        phase: current.maneuver.phase,
        targetLane: current.maneuver.targetLane,
      }));
    }
  }
  if (!previous?.risk?.frontHazard && current.risk?.frontHazard) {
    const critical = current.risk.frontHazard.timeToCollision <= current.config.emergencyTtc;
    events.push(eventEnvelope(
      current,
      critical ? "OBSTACLE_CRITICAL" : "OBSTACLE_AHEAD",
      critical ? EVENT_SEVERITIES.CRITICAL : EVENT_SEVERITIES.WARNING,
      critical ? "Vật cản ảo ở ngưỡng khẩn cấp" : "Phát hiện vật cản trong hành lang xe ảo",
      { ...current.risk.frontHazard },
    ));
  }
  if (previous?.risk?.frontHazard && previous.risk.level !== "CRITICAL" && current.risk?.level === "CRITICAL" && current.risk?.frontHazard) {
    events.push(eventEnvelope(
      current,
      "OBSTACLE_CRITICAL",
      EVENT_SEVERITIES.CRITICAL,
      "Vật cản ảo đã đi vào ngưỡng khẩn cấp",
      { ...current.risk.frontHazard },
    ));
  }
  if (previous && previous.perception.available && !current.perception.available) {
    events.push(eventEnvelope(
      current,
      "MODEL_UNAVAILABLE",
      EVENT_SEVERITIES.UNAVAILABLE,
      "Mất dữ liệu perception; không cho phép chuyển làn mù",
      { status: "UNAVAILABLE" },
    ));
  }
  if ((previous?.metrics?.collisionCount || 0) < current.metrics.collisionCount) {
    events.push(eventEnvelope(
      current,
      "COLLISION_SIMULATED",
      EVENT_SEVERITIES.CRITICAL,
      "Đã ghi nhận va chạm trong thế giới ảo",
      { collisionCount: current.metrics.collisionCount },
    ));
  }
  if (previous && previous.runState !== "COMPLETE" && current.runState === "COMPLETE") {
    events.push(eventEnvelope(
      current,
      "SESSION_COMPLETE",
      EVENT_SEVERITIES.INFO,
      "Kịch bản mô phỏng đã hoàn tất",
      { collisionCount: current.metrics.collisionCount },
    ));
  }
  return events;
}

export function virtualRoadStatus(snapshot) {
  return {
    sourceMode: EVENT_SOURCE_MODES.VIRTUAL_WORLD,
    calibratedRealWorldMeasurement: false,
    frontObstacle: snapshot?.risk?.frontHazard || null,
    riskLevel: snapshot?.risk?.level || "CLEAR",
    productionControlOutput: null,
  };
}
