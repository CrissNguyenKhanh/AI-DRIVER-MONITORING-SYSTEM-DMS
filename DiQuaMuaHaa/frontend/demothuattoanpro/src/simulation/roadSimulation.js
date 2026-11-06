import {
  ADAS_DECISIONS,
  ASSISTANCE_MODES,
  DEFAULT_SIMULATION_CONFIG,
  DMS_STATES,
  MANEUVER_PHASES,
  RUN_STATES,
} from "./constants.js";
import { evaluateSimulationOrchestrator } from "./SimulationOrchestrator.js";
import { createScenario } from "./scenarios.js";

const EPSILON = 1e-9;
const validDriverStates = new Set(Object.values(DMS_STATES));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function laneCenters(laneCount, laneWidth) {
  const midpoint = (laneCount - 1) / 2;
  return Array.from({ length: laneCount }, (_, lane) => (lane - midpoint) * laneWidth);
}

function validateConfig(config) {
  if (!Number.isFinite(config.fixedTimeStep) || config.fixedTimeStep <= 0) {
    throw new RangeError("fixedTimeStep must be a positive number");
  }
  if (!Number.isInteger(config.laneCount) || config.laneCount < 2) {
    throw new RangeError("laneCount must be an integer of at least 2");
  }
  if (!Number.isFinite(config.laneWidth) || config.laneWidth <= 0) {
    throw new RangeError("laneWidth must be a positive number");
  }
}

function cloneStepState(state) {
  return {
    ...state,
    road: { ...state.road, laneCenters: [...state.road.laneCenters] },
    perception: { ...state.perception },
    driver: { ...state.driver },
    ego: { ...state.ego },
    obstacles: state.obstacles.map((obstacle) => ({ ...obstacle })),
    events: state.events.map((event) => ({ ...event })),
    orchestrator: { ...state.orchestrator },
    maneuver: { ...state.maneuver },
    metrics: {
      ...state.metrics,
      collidedObstacleIds: [...state.metrics.collidedObstacleIds],
      visitedLanes: [...state.metrics.visitedLanes],
    },
    timeline: [...state.timeline],
    security: { ...state.security },
    safety: { ...state.safety },
    localSession: { ...state.localSession },
  };
}

function appendTimeline(state, type, message, details = {}) {
  state.timeline.push({
    at: round(state.time, 3),
    type,
    message,
    localSimulationOnly: true,
    ...details,
  });
  if (state.timeline.length > state.config.timelineLimit) {
    state.timeline.splice(0, state.timeline.length - state.config.timelineLimit);
  }
}

function activeObstacles(state) {
  return state.obstacles.filter((obstacle) => obstacle.active);
}

function obstacleX(state, obstacle) {
  return Number.isFinite(obstacle.x)
    ? obstacle.x
    : state.road.laneCenters[obstacle.lane];
}

export function virtualClearance(ego, obstacle) {
  const longitudinal = Math.max(
    0,
    Math.abs(obstacle.s - ego.s) - (obstacle.length + ego.length) / 2,
  );
  const lateral = Math.max(
    0,
    Math.abs(obstacle.x - ego.x) - (obstacle.width + ego.width) / 2,
  );
  return Math.hypot(longitudinal, lateral);
}

export function hasVirtualCollision(ego, obstacle) {
  if (!obstacle.active) return false;
  const longitudinalOverlap =
    Math.abs(obstacle.s - ego.s) <= (obstacle.length + ego.length) / 2;
  const lateralOverlap =
    Math.abs(obstacle.x - ego.x) <= (obstacle.width + ego.width) / 2;
  return longitudinalOverlap && lateralOverlap;
}

/**
 * Constant-velocity collision prediction in known virtual coordinates.
 * The result must never be presented as camera-derived distance or real TTC.
 */
export function predictVirtualCollision(
  state,
  obstacle,
  horizonSeconds = state.config.collisionPredictionHorizon,
) {
  if (!obstacle?.active || !Number.isFinite(horizonSeconds) || horizonSeconds < 0) {
    return {
      willCollide: false,
      timeToCollision: null,
      minimumLongitudinalClearance: null,
      virtualOnly: true,
    };
  }

  const obstaclePositionX = obstacleX(state, obstacle);
  const lateralOverlap =
    Math.abs(obstaclePositionX - state.ego.x) <=
    (obstacle.width + state.ego.width) / 2;
  const bumperGap =
    obstacle.s - state.ego.s - (obstacle.length + state.ego.length) / 2;
  const closingSpeed = state.ego.speed - obstacle.speed;

  if (!lateralOverlap || bumperGap < 0 || closingSpeed <= 0) {
    return {
      willCollide: lateralOverlap && bumperGap <= 0,
      timeToCollision: lateralOverlap && bumperGap <= 0 ? 0 : null,
      minimumLongitudinalClearance: Math.max(0, bumperGap),
      virtualOnly: true,
    };
  }

  const timeToCollision = bumperGap / closingSpeed;
  return {
    willCollide: timeToCollision <= horizonSeconds,
    timeToCollision,
    minimumLongitudinalClearance: Math.max(
      0,
      bumperGap - closingSpeed * horizonSeconds,
    ),
    virtualOnly: true,
  };
}

function minimumSweptDistance(initialDistance, relativeSpeed, horizonSeconds) {
  const endDistance = initialDistance + relativeSpeed * horizonSeconds;
  if (
    initialDistance === 0 ||
    endDistance === 0 ||
    Math.sign(initialDistance) !== Math.sign(endDistance)
  ) {
    return 0;
  }
  return Math.min(Math.abs(initialDistance), Math.abs(endDistance));
}

export function evaluateLaneClearance(
  state,
  lane,
  horizonSeconds = state.config.laneClearanceHorizon,
) {
  if (!state.perception.available || !state.perception.laneGeometryKnown) {
    return {
      lane,
      clear: false,
      reason: "VIRTUAL_PERCEPTION_UNKNOWN",
      blockingObstacleIds: [],
      minimumPredictedClearance: null,
      virtualOnly: true,
    };
  }
  if (!Number.isInteger(lane) || lane < 0 || lane >= state.road.laneCount) {
    return {
      lane,
      clear: false,
      reason: "OUTSIDE_VIRTUAL_ROAD",
      blockingObstacleIds: [],
      minimumPredictedClearance: null,
      virtualOnly: true,
    };
  }

  const targetX = state.road.laneCenters[lane];
  const blockingObstacleIds = [];
  let minimumPredictedClearance = null;
  for (const obstacle of activeObstacles(state)) {
    const candidateLateralOverlap =
      Math.abs(obstacleX(state, obstacle) - targetX) <=
      (obstacle.width + state.ego.width) / 2;
    if (!candidateLateralOverlap) continue;

    const longitudinalDistance = obstacle.s - state.ego.s;
    const sweptCenterDistance = minimumSweptDistance(
      longitudinalDistance,
      obstacle.speed - state.ego.speed,
      horizonSeconds,
    );
    const bodyClearance = Math.max(
      0,
      sweptCenterDistance - (obstacle.length + state.ego.length) / 2,
    );
    minimumPredictedClearance =
      minimumPredictedClearance == null
        ? bodyClearance
        : Math.min(minimumPredictedClearance, bodyClearance);
    const requiredClearance =
      longitudinalDistance >= 0
        ? state.config.frontLaneClearance
        : state.config.rearLaneClearance;
    if (bodyClearance < requiredClearance) blockingObstacleIds.push(obstacle.id);
  }

  return {
    lane,
    clear: blockingObstacleIds.length === 0,
    reason: blockingObstacleIds.length === 0 ? "VIRTUAL_CORRIDOR_CLEAR" : "VIRTUAL_CORRIDOR_OCCUPIED",
    blockingObstacleIds,
    minimumPredictedClearance,
    virtualOnly: true,
  };
}

function frontHazards(state) {
  const hazards = [];
  for (const obstacle of activeObstacles(state)) {
    const positionX = obstacleX(state, obstacle);
    const lateralOverlap =
      Math.abs(positionX - state.ego.x) <=
      (obstacle.width + state.ego.width) / 2;
    if (!lateralOverlap || obstacle.s <= state.ego.s) continue;
    const prediction = predictVirtualCollision(state, obstacle);
    const bumperGap =
      obstacle.s - state.ego.s - (obstacle.length + state.ego.length) / 2;
    if (prediction.willCollide || bumperGap <= state.config.hazardDistance) {
      hazards.push({
        obstacleId: obstacle.id,
        bumperGap,
        timeToCollision:
          prediction.timeToCollision == null ? Number.POSITIVE_INFINITY : prediction.timeToCollision,
        prediction,
      });
    }
  }
  hazards.sort((left, right) => left.bumperGap - right.bumperGap);
  return hazards;
}

function applyScenarioEvents(state) {
  for (const event of state.events) {
    if (event.applied || event.at > state.time + EPSILON) continue;
    event.applied = true;
    if (event.type === "DRIVER_STATE" && validDriverStates.has(event.value)) {
      state.driver.attention = event.value;
      appendTimeline(state, "DRIVER_STATE", `Driver state changed to ${event.value}`, {
        driverState: event.value,
      });
    } else if (event.type === "PERCEPTION") {
      state.perception.available = Boolean(event.available);
      state.perception.laneGeometryKnown = Boolean(event.laneGeometryKnown);
      state.perception.obstaclesKnown = Boolean(event.available);
      appendTimeline(state, "PERCEPTION", "Synthetic perception availability changed", {
        available: state.perception.available,
        laneGeometryKnown: state.perception.laneGeometryKnown,
      });
    } else if (event.type === "OBSTACLE_ACTIVE") {
      const obstacle = state.obstacles.find((item) => item.id === event.obstacleId);
      if (obstacle) {
        obstacle.active = Boolean(event.value);
        appendTimeline(state, "OBSTACLE", `${obstacle.id} activation changed`, {
          obstacleId: obstacle.id,
          active: obstacle.active,
        });
      }
    } else if (event.type === "LOCAL_ALERT") {
      state.localSession.alertCount += 1;
      appendTimeline(state, "LOCAL_ALERT", `Local simulated alert: ${event.value}`, {
        alert: event.value,
        persisted: false,
      });
    } else if (event.type === "LOCAL_SESSION") {
      state.localSession.status = event.value;
      appendTimeline(state, "LOCAL_SESSION", `Local simulated session ${event.value}`, {
        persisted: false,
        protectedWorkflowUsed: false,
      });
    }
  }
}

function updateObstaclePositions(state, deltaSeconds) {
  for (const obstacle of state.obstacles) {
    obstacle.x = obstacleX(state, obstacle);
    if (obstacle.active && obstacle.dynamic) {
      obstacle.s += obstacle.speed * deltaSeconds;
    }
  }
}

function beginBrakingManeuver(state, targetLane, hazard) {
  state.maneuver = {
    ...state.maneuver,
    phase: MANEUVER_PHASES.BRAKING,
    sourceLane: state.ego.currentLane,
    originalLane: state.ego.currentLane,
    targetLane,
    plannedTargetLane: targetLane,
    hazardObstacleId: hazard?.obstacleId ?? null,
    phaseElapsed: 0,
    progress: 0,
    stopAfterAbort: false,
  };
  state.ego.targetLane = targetLane;
  appendTimeline(state, "MANEUVER", "Simulated braking started before lane evaluation", {
    phase: MANEUVER_PHASES.BRAKING,
    targetLane,
  });
}

function beginStop(state, reason, hazard = null) {
  state.maneuver = {
    ...state.maneuver,
    phase: MANEUVER_PHASES.STOPPING,
    sourceLane: state.ego.currentLane,
    targetLane: null,
    plannedTargetLane: null,
    hazardObstacleId: hazard?.obstacleId ?? state.maneuver.hazardObstacleId,
    phaseElapsed: 0,
    progress: 0,
    reason,
  };
  state.ego.targetLane = null;
  appendTimeline(state, "MANEUVER", "Virtual safe-stop braking selected", {
    phase: MANEUVER_PHASES.STOPPING,
    reason,
  });
}

function beginLateralTransition(state, phase, targetLane, duration) {
  state.maneuver = {
    ...state.maneuver,
    phase,
    sourceLane: state.ego.currentLane,
    targetLane,
    lateralStartX: state.ego.x,
    lateralEndX: state.road.laneCenters[targetLane],
    lateralElapsed: 0,
    lateralDuration: duration,
    phaseElapsed: 0,
    progress: 0,
  };
  state.ego.targetLane = targetLane;
  appendTimeline(state, "MANEUVER", `Continuous lateral transition started: ${phase}`, {
    phase,
    sourceLane: state.ego.currentLane,
    targetLane,
  });
}

function sourceLaneReturnIsPossible(state) {
  const sourceLane = state.maneuver.originalLane;
  const sourceX = state.road.laneCenters[sourceLane];
  const stoppingDistance =
    (state.ego.speed * state.ego.speed) / (2 * state.config.maximumBrake) +
    state.config.stopBuffer;
  for (const obstacle of activeObstacles(state)) {
    if (
      Math.abs(obstacleX(state, obstacle) - sourceX) >
      (obstacle.width + state.ego.width) / 2
    ) {
      continue;
    }
    const bodyGap =
      Math.abs(obstacle.s - state.ego.s) - (obstacle.length + state.ego.length) / 2;
    if (obstacle.s >= state.ego.s && bodyGap < stoppingDistance) return false;
    if (obstacle.s < state.ego.s && bodyGap < state.config.rearLaneClearance) return false;
  }
  return true;
}

function beginAbort(state, reason) {
  const abandonedTargetLane = state.maneuver.targetLane;
  const returnLane = state.maneuver.originalLane;
  const remainingDistanceRatio = Math.max(0.2, state.maneuver.progress);
  const duration = Math.max(
    state.config.minimumAbortDuration,
    state.config.laneChangeDuration * remainingDistanceRatio,
  );
  state.maneuver.abandonedTargetLane = abandonedTargetLane;
  state.maneuver.stopAfterAbort = true;
  state.maneuver.reason = reason;
  beginLateralTransition(state, MANEUVER_PHASES.ABORTING, returnLane, duration);
  appendTimeline(state, "MANEUVER_ABORT", "Target lane became occupied; returning smoothly", {
    abandonedTargetLane,
    returnLane,
    reason,
  });
}

function updateManeuverState(state, policy, hazard, leftClearance, rightClearance) {
  const phase = state.maneuver.phase;
  if ([MANEUVER_PHASES.NONE, MANEUVER_PHASES.COMPLETE].includes(phase)) {
    if (
      [ADAS_DECISIONS.SHIFT_LEFT, ADAS_DECISIONS.SHIFT_RIGHT].includes(policy.decision) &&
      policy.requestedTargetLane != null
    ) {
      beginBrakingManeuver(state, policy.requestedTargetLane, hazard);
    } else if (policy.decision === ADAS_DECISIONS.STOP) {
      beginStop(state, policy.reason, hazard);
    }
    return;
  }

  state.maneuver.phaseElapsed += state.config.fixedTimeStep;
  if (phase === MANEUVER_PHASES.BRAKING) {
    const plannedLane = state.maneuver.plannedTargetLane;
    const clearance = evaluateLaneClearance(state, plannedLane);
    if (!clearance.clear) {
      const alternate =
        plannedLane < state.ego.currentLane ? rightClearance : leftClearance;
      if (alternate?.clear) {
        state.maneuver.plannedTargetLane = alternate.lane;
        state.maneuver.targetLane = alternate.lane;
        state.ego.targetLane = alternate.lane;
        appendTimeline(state, "MANEUVER", "Planned virtual corridor changed before steering", {
          targetLane: alternate.lane,
        });
      } else {
        beginStop(state, "PLANNED_CORRIDOR_BECAME_OCCUPIED", hazard);
        return;
      }
    }
    if (state.maneuver.phaseElapsed + EPSILON >= state.config.preLaneChangeBrakeSeconds) {
      beginLateralTransition(
        state,
        MANEUVER_PHASES.LANE_CHANGE,
        state.maneuver.plannedTargetLane,
        state.config.laneChangeDuration,
      );
    }
    return;
  }

  if (phase === MANEUVER_PHASES.LANE_CHANGE) {
    const clearance = evaluateLaneClearance(state, state.maneuver.targetLane);
    if (!clearance.clear) {
      if (
        state.maneuver.progress <= state.config.abortProgressThreshold &&
        sourceLaneReturnIsPossible(state)
      ) {
        beginAbort(state, "NEW_TARGET_LANE_OBSTACLE");
      } else {
        beginStop(state, "TARGET_LANE_OCCUPIED_ABORT_NOT_SAFE", hazard);
      }
    }
    return;
  }

  if (phase === MANEUVER_PHASES.PASSING) {
    const passedObstacle = state.obstacles.find(
      (obstacle) => obstacle.id === state.maneuver.hazardObstacleId,
    );
    const passed =
      !passedObstacle ||
      state.ego.s - passedObstacle.s >
        state.config.passClearance + (passedObstacle.length + state.ego.length) / 2;
    if (passed) {
      const returnClearance = evaluateLaneClearance(state, state.maneuver.originalLane);
      if (returnClearance.clear) {
        beginLateralTransition(
          state,
          MANEUVER_PHASES.RECOVERY,
          state.maneuver.originalLane,
          state.config.laneChangeDuration,
        );
      }
    }
  }
}

function updateLateralMotion(state) {
  if (
    ![
      MANEUVER_PHASES.LANE_CHANGE,
      MANEUVER_PHASES.RECOVERY,
      MANEUVER_PHASES.ABORTING,
    ].includes(state.maneuver.phase)
  ) {
    state.ego.heading = 0;
    return;
  }

  const previousX = state.ego.x;
  state.maneuver.lateralElapsed += state.config.fixedTimeStep;
  const progress = clamp(
    state.maneuver.lateralElapsed / state.maneuver.lateralDuration,
    0,
    1,
  );
  const smoothed = progress * progress * (3 - 2 * progress);
  state.ego.x =
    state.maneuver.lateralStartX +
    (state.maneuver.lateralEndX - state.maneuver.lateralStartX) * smoothed;
  state.maneuver.progress = progress;
  const lateralStep = Math.abs(state.ego.x - previousX);
  state.metrics.maximumLateralStep = Math.max(state.metrics.maximumLateralStep, lateralStep);
  state.metrics.maximumLateralSpeed = Math.max(
    state.metrics.maximumLateralSpeed,
    lateralStep / state.config.fixedTimeStep,
  );
  state.ego.heading = Math.atan2(
    state.ego.x - previousX,
    Math.max(0.001, state.ego.speed * state.config.fixedTimeStep),
  );

  if (progress + EPSILON < 1) return;
  state.ego.x = state.maneuver.lateralEndX;
  state.ego.currentLane = state.maneuver.targetLane;
  if (!state.metrics.visitedLanes.includes(state.ego.currentLane)) {
    state.metrics.visitedLanes.push(state.ego.currentLane);
  }
  state.ego.targetLane = null;
  state.ego.heading = 0;
  if (state.maneuver.phase === MANEUVER_PHASES.LANE_CHANGE) {
    state.maneuver.phase = MANEUVER_PHASES.PASSING;
    state.maneuver.phaseElapsed = 0;
    appendTimeline(state, "MANEUVER", "Virtual lane change completed; passing obstacle", {
      lane: state.ego.currentLane,
    });
  } else if (state.maneuver.phase === MANEUVER_PHASES.ABORTING) {
    state.maneuver.phase = MANEUVER_PHASES.STOPPING;
    state.maneuver.phaseElapsed = 0;
    appendTimeline(state, "MANEUVER", "Virtual lane-change abort completed; safe stop continues", {
      lane: state.ego.currentLane,
    });
  } else {
    state.maneuver.phase = MANEUVER_PHASES.COMPLETE;
    state.maneuver.phaseElapsed = 0;
    state.maneuver.targetLane = null;
    appendTimeline(state, "MANEUVER", "Virtual recovery to original lane completed", {
      lane: state.ego.currentLane,
    });
  }
}

function nearestRelevantFrontGap(state) {
  let minimumGap = Number.POSITIVE_INFINITY;
  for (const obstacle of activeObstacles(state)) {
    if (obstacle.s <= state.ego.s) continue;
    const lateralReach =
      (obstacle.width + state.ego.width) / 2 + state.road.laneWidth * 0.35;
    if (Math.abs(obstacleX(state, obstacle) - state.ego.x) > lateralReach) continue;
    const gap =
      obstacle.s - state.ego.s - (obstacle.length + state.ego.length) / 2;
    minimumGap = Math.min(minimumGap, gap);
  }
  return minimumGap;
}

function desiredAcceleration(state, policy, hazard) {
  const phase = state.maneuver.phase;
  if ([MANEUVER_PHASES.STOPPING, MANEUVER_PHASES.ABORTING].includes(phase)) {
    const gap = nearestRelevantFrontGap(state);
    const usableGap = Math.max(0.5, gap - state.config.stopBuffer);
    const requiredBrake = Number.isFinite(gap)
      ? (state.ego.speed * state.ego.speed) / (2 * usableGap)
      : state.config.comfortableBrake;
    return -clamp(
      Math.max(state.config.comfortableBrake, requiredBrake),
      0,
      state.config.maximumBrake,
    );
  }
  if (phase === MANEUVER_PHASES.BRAKING) return -state.config.comfortableBrake;
  if (phase === MANEUVER_PHASES.LANE_CHANGE && hazard) {
    return state.ego.speed > state.config.cruiseSpeed * 0.68 ? -1.4 : 0;
  }
  if (policy.decision === ADAS_DECISIONS.UNKNOWN) {
    return state.ego.speed > state.config.unknownPerceptionSpeed
      ? -state.config.comfortableBrake
      : 0;
  }
  if (policy.requestControlledSlowdown && hazard) {
    return -state.config.comfortableBrake;
  }
  const speedError = state.config.cruiseSpeed - state.ego.speed;
  return clamp(speedError * 0.8, -state.config.comfortableBrake, state.config.maximumAcceleration);
}

function updateLongitudinalMotion(state, acceleration) {
  const deltaSeconds = state.config.fixedTimeStep;
  const boundedAcceleration = clamp(
    acceleration,
    -state.config.maximumBrake,
    state.config.maximumAcceleration,
  );
  const previousSpeed = state.ego.speed;
  const nextSpeed = clamp(
    previousSpeed + boundedAcceleration * deltaSeconds,
    0,
    state.config.maximumSpeed,
  );
  state.ego.s += ((previousSpeed + nextSpeed) / 2) * deltaSeconds;
  state.ego.speed = nextSpeed < state.config.stoppedSpeed ? 0 : nextSpeed;
  state.ego.acceleration = state.ego.speed === 0 ? 0 : boundedAcceleration;
  state.metrics.maximumAcceleration = Math.max(
    state.metrics.maximumAcceleration,
    Math.max(0, boundedAcceleration),
  );
  state.metrics.maximumBraking = Math.max(
    state.metrics.maximumBraking,
    Math.max(0, -boundedAcceleration),
  );
  if (
    state.ego.speed === 0 &&
    state.metrics.timeToVirtualStop == null &&
    [MANEUVER_PHASES.STOPPING, MANEUVER_PHASES.ABORTING].includes(state.maneuver.phase)
  ) {
    state.metrics.timeToVirtualStop = state.time;
    appendTimeline(state, "SAFE_STOP", "Ego vehicle reached a virtual stop", {
      position: round(state.ego.s, 3),
    });
  }
}

function updateSafetyMetrics(state) {
  for (const obstacle of activeObstacles(state)) {
    obstacle.x = obstacleX(state, obstacle);
    const clearance = virtualClearance(state.ego, obstacle);
    state.metrics.minimumVirtualClearance =
      state.metrics.minimumVirtualClearance == null
        ? clearance
        : Math.min(state.metrics.minimumVirtualClearance, clearance);
    if (
      hasVirtualCollision(state.ego, obstacle) &&
      !state.metrics.collidedObstacleIds.includes(obstacle.id)
    ) {
      state.metrics.collidedObstacleIds.push(obstacle.id);
      state.metrics.collisionCount += 1;
      appendTimeline(state, "COLLISION", "Virtual collision detected", {
        obstacleId: obstacle.id,
      });
    }
  }
}

function orchestratorSnapshot(policy) {
  return {
    mode: policy.mode,
    decision: policy.decision,
    reason: policy.reason,
    requestedTargetLane: policy.requestedTargetLane,
    productionControlOutput: null,
  };
}

export function createInitialSimulationState(
  scenarioId = "S01",
  options = {},
) {
  const scenario = createScenario(scenarioId, options.seed);
  const config = { ...DEFAULT_SIMULATION_CONFIG, ...(options.config || {}) };
  validateConfig(config);
  const centers = laneCenters(config.laneCount, config.laneWidth);
  const startingLane = Math.floor(config.laneCount / 2);
  const security = {
    offlineOnly: true,
    secureWorkflowAvailable: false,
    integrationBlocked: Boolean(scenario.security?.integrationBlocked),
    protectedWorkflowStatus: scenario.security?.integrationBlocked
      ? "UNAVAILABLE_PR_B"
      : "NOT_USED_OFFLINE_SIMULATION",
    reason: scenario.security?.reason || "ISOLATED_DETERMINISTIC_SIMULATOR",
  };
  const state = {
    version: 1,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioExpected: scenario.expected,
    scenarioDuration: scenario.duration,
    seed: scenario.seed,
    time: 0,
    stepCount: 0,
    accumulator: 0,
    runState: RUN_STATES.RUNNING,
    playbackRate: 1,
    config,
    road: {
      laneCount: config.laneCount,
      laneWidth: config.laneWidth,
      laneCenters: centers,
      minX: centers[0] - config.laneWidth / 2,
      maxX: centers[centers.length - 1] + config.laneWidth / 2,
      length: config.roadLength,
      geometryKnown: true,
    },
    perception: {
      available: true,
      laneGeometryKnown: true,
      obstaclesKnown: true,
      source: "DETERMINISTIC_SYNTHETIC",
    },
    driver: {
      attention: scenario.driverState,
      warningElapsed: 0,
    },
    ego: {
      id: "ego",
      s: 0,
      x: centers[startingLane],
      speed: scenario.initialSpeed,
      acceleration: 0,
      heading: 0,
      currentLane: startingLane,
      targetLane: null,
      length: config.egoLength,
      width: config.egoWidth,
    },
    obstacles: scenario.obstacles.map((obstacle) => ({
      ...obstacle,
      x: centers[obstacle.lane],
    })),
    events: scenario.events.map((event) => ({ ...event, applied: false })),
    orchestrator: {
      mode: ASSISTANCE_MODES.MANUAL_SIMULATED,
      decision: ADAS_DECISIONS.KEEP_LANE,
      reason: "SIMULATION_INITIALIZED",
      requestedTargetLane: null,
      productionControlOutput: null,
    },
    maneuver: {
      phase: MANEUVER_PHASES.NONE,
      sourceLane: startingLane,
      originalLane: startingLane,
      targetLane: null,
      plannedTargetLane: null,
      hazardObstacleId: null,
      phaseElapsed: 0,
      lateralElapsed: 0,
      lateralDuration: config.laneChangeDuration,
      lateralStartX: centers[startingLane],
      lateralEndX: centers[startingLane],
      progress: 0,
      stopAfterAbort: false,
      reason: null,
    },
    metrics: {
      collisionCount: 0,
      collidedObstacleIds: [],
      minimumVirtualClearance: null,
      timeToVirtualStop: null,
      maximumAcceleration: 0,
      maximumBraking: 0,
      maximumLateralStep: 0,
      maximumLateralSpeed: 0,
      visitedLanes: [startingLane],
    },
    timeline: [],
    security,
    safety: {
      simulationOnly: true,
      productionControlOutput: null,
      realVehicleControlCapable: false,
      virtualDistancesOnly: true,
      modelAccuracyClaim: null,
    },
    localSession: {
      status: "NOT_STARTED",
      alertCount: 0,
      persisted: false,
    },
  };
  appendTimeline(state, "INITIALIZED", `Scenario ${scenario.id} initialized`, {
    seed: scenario.seed,
    expected: scenario.expected,
  });
  return state;
}

export function stepSimulation(state) {
  if (state.runState !== RUN_STATES.RUNNING) return state;
  const next = cloneStepState(state);
  const deltaSeconds = next.config.fixedTimeStep;
  next.time = round(next.time + deltaSeconds, 9);
  next.stepCount += 1;

  applyScenarioEvents(next);
  updateObstaclePositions(next, deltaSeconds);
  const impaired = [DMS_STATES.DISTRACTED, DMS_STATES.DROWSY, DMS_STATES.HIGH_RISK].includes(
    next.driver.attention,
  );
  next.driver.warningElapsed = impaired
    ? next.driver.warningElapsed + deltaSeconds
    : 0;

  const hazard = frontHazards(next)[0] || null;
  const leftLane = next.ego.currentLane - 1;
  const rightLane = next.ego.currentLane + 1;
  const leftClearance = evaluateLaneClearance(next, leftLane);
  const rightClearance = evaluateLaneClearance(next, rightLane);
  const policy = evaluateSimulationOrchestrator({
    driverState: next.driver.attention,
    warningElapsed: next.driver.warningElapsed,
    perception: next.perception,
    frontHazard: hazard,
    leftClearance,
    rightClearance,
    maneuver: next.maneuver,
    warningEscalationSeconds: next.config.warningEscalationSeconds,
  });
  next.orchestrator = orchestratorSnapshot(policy);
  updateManeuverState(next, policy, hazard, leftClearance, rightClearance);

  // Refresh the public policy after a state transition so UI snapshots show the
  // actual phase (braking first, never an instantaneous lane-change claim).
  const phasePolicy = evaluateSimulationOrchestrator({
    driverState: next.driver.attention,
    warningElapsed: next.driver.warningElapsed,
    perception: next.perception,
    frontHazard: hazard,
    leftClearance,
    rightClearance,
    maneuver: next.maneuver,
    warningEscalationSeconds: next.config.warningEscalationSeconds,
  });
  next.orchestrator = orchestratorSnapshot(phasePolicy);
  updateLongitudinalMotion(next, desiredAcceleration(next, phasePolicy, hazard));
  updateLateralMotion(next);
  updateSafetyMetrics(next);

  if (next.time + EPSILON >= next.scenarioDuration) {
    next.runState = RUN_STATES.COMPLETE;
    appendTimeline(next, "COMPLETE", `Scenario ${next.scenarioId} completed`, {
      collisionCount: next.metrics.collisionCount,
      minimumVirtualClearance: round(next.metrics.minimumVirtualClearance ?? 0, 3),
    });
  }
  // Reassert the non-production boundary on every generated snapshot.
  next.safety.simulationOnly = true;
  next.safety.productionControlOutput = null;
  next.orchestrator.productionControlOutput = null;
  return next;
}

export function advanceSimulation(state, elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("elapsedSeconds must be a finite non-negative number");
  }
  if (state.runState !== RUN_STATES.RUNNING || elapsedSeconds === 0) return state;
  const scaledElapsed = elapsedSeconds * state.playbackRate;
  const total = state.accumulator + scaledElapsed;
  const stepCount = Math.floor((total + EPSILON) / state.config.fixedTimeStep);
  let current = state;
  for (let index = 0; index < stepCount && current.runState === RUN_STATES.RUNNING; index += 1) {
    current = stepSimulation(current);
  }
  return {
    ...current,
    accumulator:
      current.runState === RUN_STATES.RUNNING
        ? Math.max(0, total - stepCount * state.config.fixedTimeStep)
        : 0,
  };
}

export function updateSimulationInput(state, input = {}) {
  const next = cloneStepState(state);
  if (input.driverState != null) {
    if (!validDriverStates.has(input.driverState)) {
      throw new RangeError(`Unsupported driver state: ${input.driverState}`);
    }
    next.driver.attention = input.driverState;
    next.driver.warningElapsed = 0;
    appendTimeline(next, "DRIVER_INPUT", `Offline driver input set to ${input.driverState}`, {
      driverState: input.driverState,
    });
  }
  if (input.perception != null) {
    next.perception = { ...next.perception, ...input.perception };
    appendTimeline(next, "PERCEPTION_INPUT", "Offline perception input changed");
  }
  return next;
}

export function simulateScenario(scenarioId, options = {}) {
  let state = createInitialSimulationState(scenarioId, options);
  while (state.runState === RUN_STATES.RUNNING) state = stepSimulation(state);
  return state;
}

export class SimulationController {
  constructor(scenarioId = "S01", options = {}) {
    this.scenarioId = scenarioId;
    this.options = options;
    this.state = createInitialSimulationState(scenarioId, options);
  }

  getState() {
    return this.state;
  }

  step(steps = 1) {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError("steps must be a non-negative integer");
    }
    for (let index = 0; index < steps; index += 1) {
      this.state = stepSimulation(this.state);
    }
    return this.state;
  }

  advance(elapsedSeconds) {
    this.state = advanceSimulation(this.state, elapsedSeconds);
    return this.state;
  }

  pause() {
    if (this.state.runState === RUN_STATES.RUNNING) {
      this.state = { ...this.state, runState: RUN_STATES.PAUSED };
    }
    return this.state;
  }

  resume() {
    if (this.state.runState === RUN_STATES.PAUSED) {
      this.state = { ...this.state, runState: RUN_STATES.RUNNING };
    }
    return this.state;
  }

  reset() {
    this.state = createInitialSimulationState(this.scenarioId, this.options);
    return this.state;
  }

  loadScenario(scenarioId, options = this.options) {
    this.scenarioId = scenarioId;
    this.options = options;
    this.state = createInitialSimulationState(scenarioId, options);
    return this.state;
  }

  setPlaybackRate(playbackRate) {
    if (!Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 8) {
      throw new RangeError("playbackRate must be greater than 0 and at most 8");
    }
    this.state = { ...this.state, playbackRate };
    return this.state;
  }

  setDriverState(driverState) {
    this.state = updateSimulationInput(this.state, { driverState });
    return this.state;
  }
}
