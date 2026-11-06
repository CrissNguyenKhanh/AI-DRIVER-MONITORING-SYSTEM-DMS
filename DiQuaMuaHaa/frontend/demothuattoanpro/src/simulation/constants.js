export const DMS_STATES = Object.freeze({
  NORMAL: "NORMAL",
  DROWSY: "DROWSY",
  DISTRACTED: "DISTRACTED",
  HIGH_RISK: "HIGH_RISK",
  UNKNOWN: "UNKNOWN",
});

export const ADAS_DECISIONS = Object.freeze({
  KEEP_LANE: "KEEP_LANE",
  SLOW_DOWN: "SLOW_DOWN",
  STOP: "STOP",
  SHIFT_LEFT: "SHIFT_LEFT",
  SHIFT_RIGHT: "SHIFT_RIGHT",
  UNKNOWN: "UNKNOWN",
});

export const ASSISTANCE_MODES = Object.freeze({
  MANUAL_SIMULATED: "MANUAL_SIMULATED",
  WARNING_DRIVER: "WARNING_DRIVER",
  ASSISTANCE_EVALUATION: "ASSISTANCE_EVALUATION",
  SIMULATED_BRAKING: "SIMULATED_BRAKING",
  SIMULATED_LANE_CHANGE: "SIMULATED_LANE_CHANGE",
  SIMULATED_SAFE_STOP: "SIMULATED_SAFE_STOP",
  RECOVERY: "RECOVERY",
  UNKNOWN: "UNKNOWN",
});

export const MANEUVER_PHASES = Object.freeze({
  NONE: "NONE",
  BRAKING: "BRAKING",
  LANE_CHANGE: "LANE_CHANGE",
  PASSING: "PASSING",
  RECOVERY: "RECOVERY",
  ABORTING: "ABORTING",
  STOPPING: "STOPPING",
  COMPLETE: "COMPLETE",
});

export const RUN_STATES = Object.freeze({
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETE: "COMPLETE",
});

// SI units are used throughout the virtual world: metres and seconds.
// These values are simulation parameters, not measurements from road video.
export const DEFAULT_SIMULATION_CONFIG = Object.freeze({
  fixedTimeStep: 0.05,
  laneCount: 3,
  laneWidth: 3.6,
  roadLength: 4000,
  cruiseSpeed: 18,
  maximumSpeed: 28,
  maximumAcceleration: 2.4,
  comfortableBrake: 3.5,
  maximumBrake: 7,
  unknownPerceptionSpeed: 4,
  warningEscalationSeconds: 1,
  collisionPredictionHorizon: 3.25,
  laneClearanceHorizon: 3.5,
  frontLaneClearance: 18,
  rearLaneClearance: 12,
  hazardDistance: 58,
  emergencyTtc: 1.4,
  preLaneChangeBrakeSeconds: 0.65,
  laneChangeDuration: 2.8,
  minimumAbortDuration: 1.2,
  abortProgressThreshold: 0.58,
  passClearance: 12,
  stopBuffer: 5,
  stoppedSpeed: 0.08,
  timelineLimit: 500,
  egoLength: 4.6,
  egoWidth: 1.9,
});
