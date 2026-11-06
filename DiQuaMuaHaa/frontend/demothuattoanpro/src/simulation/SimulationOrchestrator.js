import {
  ADAS_DECISIONS,
  ASSISTANCE_MODES,
  DMS_STATES,
  MANEUVER_PHASES,
} from "./constants.js";

const impairedStates = new Set([
  DMS_STATES.DISTRACTED,
  DMS_STATES.DROWSY,
  DMS_STATES.HIGH_RISK,
]);

function maneuverDecision(maneuver) {
  if (maneuver.phase === MANEUVER_PHASES.STOPPING) return ADAS_DECISIONS.STOP;
  if (maneuver.phase === MANEUVER_PHASES.BRAKING) return ADAS_DECISIONS.SLOW_DOWN;
  if (maneuver.phase === MANEUVER_PHASES.LANE_CHANGE) {
    return maneuver.targetLane < maneuver.sourceLane
      ? ADAS_DECISIONS.SHIFT_LEFT
      : ADAS_DECISIONS.SHIFT_RIGHT;
  }
  if (maneuver.phase === MANEUVER_PHASES.ABORTING) {
    return maneuver.lateralEndX < maneuver.lateralStartX
      ? ADAS_DECISIONS.SHIFT_LEFT
      : ADAS_DECISIONS.SHIFT_RIGHT;
  }
  if (maneuver.phase === MANEUVER_PHASES.RECOVERY) {
    return maneuver.targetLane < maneuver.sourceLane
      ? ADAS_DECISIONS.SHIFT_LEFT
      : ADAS_DECISIONS.SHIFT_RIGHT;
  }
  return ADAS_DECISIONS.KEEP_LANE;
}

/**
 * Pure policy evaluation for the deterministic virtual world.
 * The returned object is a simulation intent and never an actuator command.
 */
export function evaluateSimulationOrchestrator({
  driverState,
  warningElapsed = 0,
  perception,
  frontHazard = null,
  leftClearance,
  rightClearance,
  maneuver,
  warningEscalationSeconds = 1,
}) {
  if (!perception?.available || !perception?.laneGeometryKnown) {
    return {
      mode: ASSISTANCE_MODES.UNKNOWN,
      decision: ADAS_DECISIONS.UNKNOWN,
      reason: "VIRTUAL_PERCEPTION_UNAVAILABLE",
      requestedTargetLane: null,
      requestControlledSlowdown: true,
      productionControlOutput: null,
    };
  }

  if (maneuver && ![MANEUVER_PHASES.NONE, MANEUVER_PHASES.COMPLETE].includes(maneuver.phase)) {
    let mode = ASSISTANCE_MODES.ASSISTANCE_EVALUATION;
    if (maneuver.phase === MANEUVER_PHASES.BRAKING) mode = ASSISTANCE_MODES.SIMULATED_BRAKING;
    if ([MANEUVER_PHASES.LANE_CHANGE, MANEUVER_PHASES.ABORTING].includes(maneuver.phase)) {
      mode = ASSISTANCE_MODES.SIMULATED_LANE_CHANGE;
    }
    if (maneuver.phase === MANEUVER_PHASES.STOPPING) mode = ASSISTANCE_MODES.SIMULATED_SAFE_STOP;
    if ([MANEUVER_PHASES.PASSING, MANEUVER_PHASES.RECOVERY].includes(maneuver.phase)) {
      mode = ASSISTANCE_MODES.RECOVERY;
    }
    return {
      mode,
      decision: maneuverDecision(maneuver),
      reason: `ACTIVE_VIRTUAL_MANEUVER_${maneuver.phase}`,
      requestedTargetLane: maneuver.targetLane,
      requestControlledSlowdown: [
        MANEUVER_PHASES.BRAKING,
        MANEUVER_PHASES.ABORTING,
        MANEUVER_PHASES.STOPPING,
      ].includes(maneuver.phase),
      productionControlOutput: null,
    };
  }

  if (driverState === DMS_STATES.UNKNOWN) {
    return {
      mode: ASSISTANCE_MODES.UNKNOWN,
      decision: ADAS_DECISIONS.UNKNOWN,
      reason: "DRIVER_STATE_UNKNOWN",
      requestedTargetLane: null,
      requestControlledSlowdown: true,
      productionControlOutput: null,
    };
  }

  if (!impairedStates.has(driverState)) {
    return {
      mode: ASSISTANCE_MODES.MANUAL_SIMULATED,
      decision: frontHazard ? ADAS_DECISIONS.SLOW_DOWN : ADAS_DECISIONS.KEEP_LANE,
      reason: frontHazard ? "ATTENTIVE_DRIVER_FRONT_HAZARD" : "ATTENTIVE_DRIVER_CLEAR_ROAD",
      requestedTargetLane: null,
      requestControlledSlowdown: Boolean(frontHazard),
      productionControlOutput: null,
    };
  }

  if (!frontHazard) {
    return {
      mode: ASSISTANCE_MODES.WARNING_DRIVER,
      decision: ADAS_DECISIONS.KEEP_LANE,
      reason: "DRIVER_WARNING_WITHOUT_ROAD_HAZARD",
      requestedTargetLane: null,
      requestControlledSlowdown: false,
      productionControlOutput: null,
    };
  }

  const escalationReady =
    driverState === DMS_STATES.HIGH_RISK ||
    warningElapsed >= warningEscalationSeconds ||
    frontHazard.timeToCollision <= 1.4;
  if (!escalationReady) {
    return {
      mode: ASSISTANCE_MODES.WARNING_DRIVER,
      decision: ADAS_DECISIONS.SLOW_DOWN,
      reason: "WARNING_ESCALATION_PENDING",
      requestedTargetLane: null,
      requestControlledSlowdown: true,
      productionControlOutput: null,
    };
  }

  if (leftClearance?.clear) {
    return {
      mode: ASSISTANCE_MODES.ASSISTANCE_EVALUATION,
      decision: ADAS_DECISIONS.SHIFT_LEFT,
      reason: "VIRTUAL_FRONT_HAZARD_LEFT_CORRIDOR_CLEAR",
      requestedTargetLane: leftClearance.lane,
      requestControlledSlowdown: true,
      productionControlOutput: null,
    };
  }
  if (rightClearance?.clear) {
    return {
      mode: ASSISTANCE_MODES.ASSISTANCE_EVALUATION,
      decision: ADAS_DECISIONS.SHIFT_RIGHT,
      reason: "VIRTUAL_FRONT_HAZARD_RIGHT_CORRIDOR_CLEAR",
      requestedTargetLane: rightClearance.lane,
      requestControlledSlowdown: true,
      productionControlOutput: null,
    };
  }

  return {
    mode: ASSISTANCE_MODES.SIMULATED_SAFE_STOP,
    decision: ADAS_DECISIONS.STOP,
    reason: "NO_VALIDATED_VIRTUAL_ESCAPE_CORRIDOR",
    requestedTargetLane: null,
    requestControlledSlowdown: true,
    productionControlOutput: null,
  };
}
