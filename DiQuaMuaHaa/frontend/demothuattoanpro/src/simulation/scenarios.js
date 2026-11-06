import { DMS_STATES } from "./constants.js";

export const SCENARIO_IDS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`),
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
