import { DMS_STATES } from "./constants.js";

export const SCENARIO_IDS = Object.freeze(
  Array.from({ length: 20 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`),
);

const car = (id, lane, s, options = {}) => ({
  id,
  kind: options.kind || "vehicle",
  lane,
  s,
  speed: options.speed ?? 0,
  length: options.length ?? 4.6,
  width: options.width ?? 1.9,
  active: options.active ?? true,
  dynamic: (options.speed ?? 0) !== 0,
  synthetic: true,
});

const catalog = {
  S01: {
    name: "Normal drive",
    description: "Attentive driver on a clear synthetic road.",
    duration: 12,
    driverState: DMS_STATES.NORMAL,
    obstacles: [],
    events: [],
    expected: "KEEP_LANE",
  },
  S02: {
    name: "Driver distracted",
    description: "Warning only; distraction without a road hazard must not cause swerving.",
    duration: 12,
    driverState: DMS_STATES.NORMAL,
    obstacles: [],
    events: [{ at: 0.5, type: "DRIVER_STATE", value: DMS_STATES.DISTRACTED }],
    expected: "WARNING_WITHOUT_LANE_CHANGE",
  },
  S03: {
    name: "Distracted with front obstacle",
    description: "Brake and use the clear left virtual lane.",
    duration: 18,
    driverState: DMS_STATES.NORMAL,
    obstacles: [car("front-static", 1, 86), car("right-blocker", 2, 36, { speed: 12 })],
    events: [{ at: 0.25, type: "DRIVER_STATE", value: DMS_STATES.DISTRACTED }],
    expected: "BRAKE_SHIFT_LEFT_RECOVER",
  },
  S04: {
    name: "Drowsy with front obstacle",
    description: "Brake and use the clear right virtual lane.",
    duration: 18,
    driverState: DMS_STATES.NORMAL,
    obstacles: [car("front-static", 1, 86), car("left-blocker", 0, 36, { speed: 12 })],
    events: [{ at: 0.25, type: "DRIVER_STATE", value: DMS_STATES.DROWSY }],
    expected: "BRAKE_SHIFT_RIGHT_RECOVER",
  },
  S05: {
    name: "Both sides blocked",
    description: "No validated escape corridor; brake to a virtual stop.",
    duration: 15,
    driverState: DMS_STATES.DISTRACTED,
    obstacles: [
      car("front-static", 1, 67),
      car("left-blocker", 0, 28, { speed: 13 }),
      car("right-blocker", 2, 30, { speed: 12 }),
    ],
    events: [],
    expected: "STOP",
  },
  S06: {
    name: "Sudden target-lane obstacle",
    description: "Abort an early left maneuver when its target lane becomes occupied.",
    duration: 16,
    driverState: DMS_STATES.DISTRACTED,
    obstacles: [
      car("front-static", 1, 86),
      car("right-blocker", 2, 34, { speed: 12 }),
      car("late-left-blocker", 0, 76, { active: false }),
    ],
    events: [{ at: 3.1, type: "OBSTACLE_ACTIVE", obstacleId: "late-left-blocker", value: true }],
    expected: "ABORT_AND_STOP",
  },
  S07: {
    name: "Camera lost / perception unknown",
    description: "Unknown perception produces no blind lane-change claim.",
    duration: 10,
    driverState: DMS_STATES.NORMAL,
    obstacles: [],
    events: [
      { at: 0.5, type: "DRIVER_STATE", value: DMS_STATES.UNKNOWN },
      { at: 0.5, type: "PERCEPTION", available: false, laneGeometryKnown: false },
    ],
    expected: "UNKNOWN_NO_LANE_CHANGE",
  },
  S08: {
    name: "Driver recovers",
    description: "The driver recovers while a virtual avoidance maneuver is active.",
    duration: 18,
    driverState: DMS_STATES.DISTRACTED,
    obstacles: [car("front-static", 1, 86), car("right-blocker", 2, 36, { speed: 12 })],
    events: [{ at: 3.25, type: "DRIVER_STATE", value: DMS_STATES.NORMAL }],
    expected: "CONSISTENT_MANEUVER_COMPLETION",
  },
  S09: {
    name: "Multiple obstacles",
    description: "Static and moving synthetic traffic constrains lane selection.",
    duration: 24,
    driverState: DMS_STATES.DROWSY,
    obstacles: [
      car("front-static", 1, 90),
      car("left-near", 0, 31, { speed: 13 }),
      car("left-far", 0, 116, { speed: 8 }),
      car("right-far", 2, 145, { speed: 14 }),
      car("center-moving", 1, 155, { speed: 8 }),
    ],
    events: [],
    expected: "RESPECT_OCCUPIED_LANES",
  },
  S10: {
    name: "Offline end-to-end timeline",
    description: "A local-only synthetic session. Secure workflow integration is explicitly blocked.",
    duration: 16,
    driverState: DMS_STATES.NORMAL,
    obstacles: [
      car("front-static", 1, 76),
      car("left-blocker", 0, 29, { speed: 12 }),
      car("right-blocker", 2, 32, { speed: 12 }),
    ],
    events: [
      { at: 0.1, type: "LOCAL_SESSION", value: "STARTED" },
      { at: 0.75, type: "DRIVER_STATE", value: DMS_STATES.DISTRACTED },
      { at: 1.8, type: "LOCAL_ALERT", value: "DISTRACTION_WARNING" },
      { at: 13.5, type: "LOCAL_SESSION", value: "ENDED" },
    ],
    expected: "LOCAL_TIMELINE_SAFE_STOP",
    security: {
      secureWorkflowAvailable: false,
      integrationBlocked: true,
      reason: "PR_B_SERVER_VERIFICATION_GRANT_NOT_AVAILABLE",
    },
  },
  S11: {
    name: "Phone distraction with obstacle",
    description: "Phone use escalates distraction before a front obstacle; the virtual car brakes and uses a clear corridor.",
    duration: 18,
    driverState: DMS_STATES.NORMAL,
    obstacles: [car("phone-front", 1, 86), car("phone-right", 2, 38, { speed: 12 })],
    events: [
      { at: 0.5, type: "PHONE_USAGE", value: true },
      { at: 0.5, type: "DRIVER_STATE", value: DMS_STATES.DISTRACTED },
      { at: 11, type: "PHONE_USAGE", value: false },
    ],
    expected: "PHONE_WARNING_BRAKE_SHIFT_LEFT",
  },
  S12: {
    name: "Drowsiness escalation",
    description: "Drowsiness escalates to high risk without inventing a road hazard or arbitrary steering.",
    duration: 12,
    driverState: DMS_STATES.NORMAL,
    obstacles: [],
    events: [
      { at: 1, type: "DRIVER_STATE", value: DMS_STATES.DROWSY },
      { at: 5, type: "DRIVER_STATE", value: DMS_STATES.HIGH_RISK },
    ],
    expected: "ESCALATE_WARNING_KEEP_LANE",
  },
  S13: {
    name: "Moving target-lane cut-in",
    description: "A moving vehicle enters the planned left corridor and forces a deterministic abort and stop.",
    duration: 17,
    driverState: DMS_STATES.DISTRACTED,
    obstacles: [
      car("cutin-front", 1, 88),
      car("cutin-right", 2, 35, { speed: 12 }),
      car("cutin-moving", 0, 78, { speed: 7, active: false }),
    ],
    events: [{ at: 3, type: "OBSTACLE_ACTIVE", obstacleId: "cutin-moving", value: true }],
    expected: "MOVING_CUT_IN_ABORT",
  },
  S14: {
    name: "Consecutive obstacles",
    description: "Multiple virtual vehicles constrain the corridor while the car completes one stable avoidance cycle.",
    duration: 24,
    driverState: DMS_STATES.DROWSY,
    obstacles: [
      car("series-front", 1, 88),
      car("series-left", 0, 34, { speed: 13 }),
      car("series-right-far", 2, 142, { speed: 10 }),
      car("series-center-far", 1, 185, { speed: 9 }),
    ],
    events: [],
    expected: "STABLE_MULTI_OBSTACLE_RESPONSE",
  },
  S15: {
    name: "Driver recovery after warning",
    description: "A distraction warning clears after a stable recovery; no road hazard means no lane change.",
    duration: 11,
    driverState: DMS_STATES.DISTRACTED,
    obstacles: [],
    events: [{ at: 5, type: "DRIVER_STATE", value: DMS_STATES.NORMAL }],
    expected: "WARNING_RECOVERY_KEEP_LANE",
  },
  S16: {
    name: "Sensor and model unavailable",
    description: "Unavailable perception is represented as UNKNOWN and cannot authorize a blind maneuver.",
    duration: 10,
    driverState: DMS_STATES.UNKNOWN,
    obstacles: [],
    events: [{ at: 0.5, type: "PERCEPTION", available: false, laneGeometryKnown: false }],
    expected: "UNAVAILABLE_CONTROLLED_SLOWDOWN",
  },
  S17: {
    name: "Low-risk moving obstacle",
    description: "A faster vehicle remains far ahead; no unnecessary maneuver is triggered.",
    duration: 14,
    driverState: DMS_STATES.NORMAL,
    obstacles: [car("low-risk-car", 1, 115, { speed: 22 })],
    events: [],
    expected: "KEEP_LANE_NO_UNNECESSARY_ACTION",
  },
  S18: {
    name: "Critical obstacle and blocked sides",
    description: "A close front obstacle and two occupied corridors force maximum bounded virtual braking and safe stop.",
    duration: 15,
    driverState: DMS_STATES.HIGH_RISK,
    obstacles: [
      car("critical-front", 1, 58),
      car("critical-left", 0, 29, { speed: 12 }),
      car("critical-right", 2, 30, { speed: 12 }),
    ],
    events: [],
    expected: "CRITICAL_BRAKE_SAFE_STOP",
  },
  S19: {
    name: "Camera disconnects mid-trip",
    description: "The DMS/perception signal becomes unavailable mid-trip and the virtual car slows without steering blindly.",
    duration: 12,
    driverState: DMS_STATES.NORMAL,
    obstacles: [],
    events: [
      { at: 4, type: "DRIVER_STATE", value: DMS_STATES.UNKNOWN },
      { at: 4, type: "PERCEPTION", available: false, laneGeometryKnown: false },
    ],
    expected: "MID_TRIP_UNKNOWN_NO_LANE_CHANGE",
  },
  S20: {
    name: "Integrated presentation showcase",
    description: "A timed presentation: normal drive, distraction, obstacle warning, braking, lane change, recovery and local summary.",
    duration: 20,
    driverState: DMS_STATES.NORMAL,
    visualCurveAmplitude: 2.2,
    obstacles: [car("showcase-front", 1, 102), car("showcase-right", 2, 42, { speed: 12 })],
    events: [
      { at: 0.1, type: "LOCAL_SESSION", value: "STARTED" },
      { at: 2.2, type: "DRIVER_STATE", value: DMS_STATES.DISTRACTED },
      { at: 13.5, type: "DRIVER_STATE", value: DMS_STATES.NORMAL },
      { at: 19, type: "LOCAL_SESSION", value: "ENDED" },
    ],
    expected: "FULL_PRESENTATION_AVOID_RECOVER_REPORT",
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const SCENARIO_CATALOG = deepFreeze(
  Object.fromEntries(
    Object.entries(catalog).map(([id, scenario]) => [id, { id, ...scenario }]),
  ),
);

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed ?? "dms-road-simulation");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createScenario(id = "S01", seed = 20261105) {
  const template = SCENARIO_CATALOG[id];
  if (!template) {
    throw new RangeError(`Unknown road simulation scenario: ${id}`);
  }

  const normalizedSeed = normalizeSeed(seed);
  const random = mulberry32(normalizedSeed ^ normalizeSeed(id));
  const scenario = clone(template);
  // Small seeded variations make the fixture genuinely seeded without changing
  // the intended lane topology or expected outcome.
  scenario.initialSpeed = 17.8 + random() * 0.4;
  scenario.obstacles = scenario.obstacles.map((obstacle) => ({
    ...obstacle,
    s: obstacle.s + (random() - 0.5) * 0.8,
  }));
  scenario.seed = normalizedSeed;
  return scenario;
}
