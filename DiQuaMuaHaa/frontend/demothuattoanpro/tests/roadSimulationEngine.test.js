import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SIMULATION_CONFIG,
  DMS_STATES,
  MANEUVER_PHASES,
  SimulationController,
  advanceSimulation,
  createInitialSimulationState,
  evaluateLaneClearance,
  evaluateSimulationOrchestrator,
  hasVirtualCollision,
  predictVirtualCollision,
  stepSimulation,
  updateSimulationInput,
} from "../src/simulation/index.js";

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("fixed timestep produces the same state for different render-frame partitions", () => {
  const initial = createInitialSimulationState("S03", { seed: 77 });
  const oneChunk = advanceSimulation(initial, 2);
  let manyChunks = initial;
  for (const elapsed of [0.013, 0.021, 0.09, 0.2, 0.076, 0.4, 0.5, 0.7]) {
    manyChunks = advanceSimulation(manyChunks, elapsed);
  }

  assert.equal(oneChunk.stepCount, 40);
  assert.equal(manyChunks.stepCount, oneChunk.stepCount);
  assert.equal(manyChunks.time, oneChunk.time);
  closeTo(manyChunks.ego.s, oneChunk.ego.s);
  closeTo(manyChunks.ego.speed, oneChunk.ego.speed);
  closeTo(manyChunks.ego.x, oneChunk.ego.x);
  closeTo(manyChunks.accumulator, oneChunk.accumulator);
});

test("stepSimulation is functional and moves static/dynamic obstacles correctly", () => {
  const initial = createInitialSimulationState("S03", { seed: 90 });
  const staticBefore = initial.obstacles.find((obstacle) => obstacle.id === "front-static").s;
  const dynamicBefore = initial.obstacles.find((obstacle) => obstacle.id === "right-blocker").s;
  const next = stepSimulation(initial);

  assert.notEqual(next, initial);
  assert.equal(initial.time, 0);
  assert.equal(initial.ego.s, 0);
  assert.equal(initial.obstacles.find((obstacle) => obstacle.id === "front-static").s, staticBefore);
  assert.equal(next.obstacles.find((obstacle) => obstacle.id === "front-static").s, staticBefore);
  assert.ok(next.obstacles.find((obstacle) => obstacle.id === "right-blocker").s > dynamicBefore);
});

test("acceleration and braking remain within configured physical bounds", () => {
  let state = createInitialSimulationState("S05", { seed: 10 });
  let previousSpeed = state.ego.speed;
  let observedBraking = false;
  while (state.time < 8) {
    state = stepSimulation(state);
    const speedDelta = state.ego.speed - previousSpeed;
    assert.ok(
      speedDelta <= state.config.maximumAcceleration * state.config.fixedTimeStep + 1e-9,
    );
    assert.ok(
      speedDelta >= -state.config.maximumBrake * state.config.fixedTimeStep - 1e-9,
    );
    if (state.ego.acceleration < 0) observedBraking = true;
    previousSpeed = state.ego.speed;
  }
  assert.equal(observedBraking, true);
  assert.ok(state.metrics.maximumBraking <= state.config.maximumBrake);
  assert.ok(state.metrics.maximumAcceleration <= state.config.maximumAcceleration);
  assert.equal(state.ego.speed, 0);
});

test("lane clearance rejects occupied, unknown, and out-of-road corridors", () => {
  const clearLeft = createInitialSimulationState("S03", { seed: 1 });
  assert.equal(evaluateLaneClearance(clearLeft, 0).clear, true);
  assert.equal(evaluateLaneClearance(clearLeft, 2).clear, false);

  const bothBlocked = createInitialSimulationState("S05", { seed: 1 });
  assert.equal(evaluateLaneClearance(bothBlocked, 0).clear, false);
  assert.equal(evaluateLaneClearance(bothBlocked, 2).clear, false);
  assert.equal(evaluateLaneClearance(bothBlocked, -1).reason, "OUTSIDE_VIRTUAL_ROAD");

  const unknown = updateSimulationInput(clearLeft, {
    perception: { available: false, laneGeometryKnown: false },
  });
  assert.equal(evaluateLaneClearance(unknown, 0).reason, "VIRTUAL_PERCEPTION_UNKNOWN");
});

test("virtual collision and TTC checks use only synthetic world coordinates", () => {
  const state = createInitialSimulationState("S01", { seed: 1 });
  const overlapping = {
    id: "overlap",
    active: true,
    x: state.ego.x,
    s: state.ego.s,
    speed: 0,
    length: 4.6,
    width: 1.9,
  };
  const ahead = { ...overlapping, id: "ahead", s: 20 };
  const adjacent = { ...ahead, id: "adjacent", x: state.road.laneCenters[0] };

  assert.equal(hasVirtualCollision(state.ego, overlapping), true);
  assert.equal(hasVirtualCollision(state.ego, ahead), false);
  assert.equal(predictVirtualCollision(state, ahead, 2).willCollide, true);
  assert.equal(predictVirtualCollision(state, ahead, 2).virtualOnly, true);
  assert.equal(predictVirtualCollision(state, adjacent, 10).willCollide, false);
});

test("lane changes are continuous and never teleport by a lane width", () => {
  let state = createInitialSimulationState("S03", { seed: 33 });
  let previousX = state.ego.x;
  let observedLateralMotion = false;
  while (state.runState === "RUNNING") {
    state = stepSimulation(state);
    const lateralStep = Math.abs(state.ego.x - previousX);
    assert.ok(lateralStep < state.road.laneWidth / 10);
    if (lateralStep > 0) observedLateralMotion = true;
    previousX = state.ego.x;
  }
  assert.equal(observedLateralMotion, true);
  assert.ok(state.metrics.maximumLateralStep < state.road.laneWidth / 10);
  assert.deepEqual(state.metrics.visitedLanes, [1, 0]);
  assert.equal(state.ego.currentLane, 1);
});

test("controller supports pause, resume, playback speed, scenario selection, and reset", () => {
  const controller = new SimulationController("S01", { seed: 12 });
  controller.advance(1);
  assert.equal(controller.getState().time, 1);

  controller.pause();
  controller.advance(4);
  assert.equal(controller.getState().time, 1);

  controller.resume();
  controller.setPlaybackRate(2);
  controller.advance(1);
  assert.equal(controller.getState().time, 3);

  controller.loadScenario("S04", { seed: 12 });
  assert.equal(controller.getState().scenarioId, "S04");
  controller.step(5);
  assert.equal(controller.getState().stepCount, 5);
  controller.reset();
  assert.equal(controller.getState().scenarioId, "S04");
  assert.equal(controller.getState().time, 0);
  assert.equal(controller.getState().stepCount, 0);
});

test("invalid engine input is rejected without external side effects", () => {
  const state = createInitialSimulationState("S01");
  assert.throws(() => advanceSimulation(state, -1), /elapsedSeconds/);
  assert.throws(() => updateSimulationInput(state, { driverState: "SAFE" }), /Unsupported/);
  assert.throws(
    () => createInitialSimulationState("S01", { config: { fixedTimeStep: 0 } }),
    /fixedTimeStep/,
  );
  assert.equal(DEFAULT_SIMULATION_CONFIG.fixedTimeStep, 0.05);
  assert.equal(state.safety.productionControlOutput, null);
});

test("DMS warning escalation and right-lane abort expose deterministic intents", () => {
  const base = {
    driverState: DMS_STATES.DISTRACTED,
    perception: { available: true, laneGeometryKnown: true },
    frontHazard: { timeToCollision: 2 },
    leftClearance: { lane: 0, clear: true },
    rightClearance: { lane: 2, clear: false },
    maneuver: { phase: MANEUVER_PHASES.NONE },
    warningEscalationSeconds: 1,
  };
  const warning = evaluateSimulationOrchestrator({ ...base, warningElapsed: 0.5 });
  const escalated = evaluateSimulationOrchestrator({ ...base, warningElapsed: 1 });
  assert.equal(warning.mode, "WARNING_DRIVER");
  assert.equal(warning.decision, "SLOW_DOWN");
  assert.equal(escalated.mode, "ASSISTANCE_EVALUATION");
  assert.equal(escalated.decision, "SHIFT_LEFT");

  const abortingRight = evaluateSimulationOrchestrator({
    ...base,
    warningElapsed: 1,
    maneuver: {
      phase: MANEUVER_PHASES.ABORTING,
      lateralStartX: 1.2,
      lateralEndX: 0,
      targetLane: 1,
    },
  });
  assert.equal(abortingRight.decision, "SHIFT_LEFT");
  assert.equal(abortingRight.productionControlOutput, null);
});
