import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  ASSISTANCE_MODES,
  SCENARIO_CATALOG,
  SCENARIO_IDS,
  createInitialSimulationState,
  createScenario,
  simulateScenario,
  stepSimulation,
} from "../src/simulation/index.js";

const simulationSourceUrl = new URL("../src/simulation/roadSimulation.js", import.meta.url);
const simulationDirectoryUrl = new URL("../src/simulation/", import.meta.url);

function maneuverTimeline(state) {
  return state.timeline.filter((event) => event.type === "MANEUVER");
}

function assertSafeSimulationBoundary(state) {
  assert.equal(state.safety.simulationOnly, true);
  assert.equal(state.safety.productionControlOutput, null);
  assert.equal(state.safety.realVehicleControlCapable, false);
  assert.equal(state.safety.virtualDistancesOnly, true);
  assert.equal(state.safety.modelAccuracyClaim, null);
  assert.equal(state.orchestrator.productionControlOutput, null);
}

test("S01 normal drive keeps its lane", () => {
  const state = simulateScenario("S01", { seed: 20261105 });
  assert.equal(state.metrics.collisionCount, 0);
  assert.deepEqual(state.metrics.visitedLanes, [1]);
  assert.equal(state.ego.currentLane, 1);
  assert.equal(maneuverTimeline(state).length, 0);
  assert.equal(state.orchestrator.mode, ASSISTANCE_MODES.MANUAL_SIMULATED);
});

test("S02 distracted driver receives a warning without arbitrary steering", () => {
  const state = simulateScenario("S02", { seed: 20261105 });
  assert.equal(state.driver.attention, "DISTRACTED");
  assert.equal(state.orchestrator.mode, ASSISTANCE_MODES.WARNING_DRIVER);
  assert.deepEqual(state.metrics.visitedLanes, [1]);
  assert.equal(state.ego.x, state.road.laneCenters[1]);
  assert.equal(state.metrics.collisionCount, 0);
});

test("S03 follows brake, left lane, pass, recovery without collision", () => {
  const state = simulateScenario("S03", { seed: 20261105 });
  const events = maneuverTimeline(state);
  assert.deepEqual(
    events.map((event) => event.phase).filter(Boolean).slice(0, 3),
    ["BRAKING", "LANE_CHANGE", "RECOVERY"],
  );
  assert.equal(events.find((event) => event.phase === "LANE_CHANGE").targetLane, 0);
  assert.deepEqual(state.metrics.visitedLanes, [1, 0]);
  assert.equal(state.ego.currentLane, 1);
  assert.equal(state.metrics.collisionCount, 0);
});

test("S04 follows brake, right lane, pass, recovery without collision", () => {
  const state = simulateScenario("S04", { seed: 20261105 });
  const laneChange = maneuverTimeline(state).find((event) => event.phase === "LANE_CHANGE");
  assert.equal(laneChange.targetLane, 2);
  assert.deepEqual(state.metrics.visitedLanes, [1, 2]);
  assert.equal(state.ego.currentLane, 1);
  assert.equal(state.metrics.collisionCount, 0);
});

test("S05 both adjacent lanes blocked results in a bounded virtual stop", () => {
  const state = simulateScenario("S05", { seed: 20261105 });
  assert.equal(state.ego.speed, 0);
  assert.equal(state.maneuver.phase, "STOPPING");
  assert.ok(state.metrics.timeToVirtualStop > 0);
  assert.equal(state.metrics.collisionCount, 0);
  assert.deepEqual(state.metrics.visitedLanes, [1]);
  assert.ok(state.metrics.minimumVirtualClearance > 0);
});

test("S06 newly occupied target lane aborts continuously and stops", () => {
  const state = simulateScenario("S06", { seed: 20261105 });
  const abortEvent = state.timeline.find((event) => event.type === "MANEUVER_ABORT");
  assert.ok(abortEvent);
  assert.equal(abortEvent.reason, "NEW_TARGET_LANE_OBSTACLE");
  assert.equal(state.ego.currentLane, 1);
  assert.equal(state.ego.speed, 0);
  assert.equal(state.metrics.collisionCount, 0);
  assert.ok(state.metrics.maximumLateralStep < state.road.laneWidth / 10);
});

test("S07 unknown perception slows down and never starts a blind maneuver", () => {
  const state = simulateScenario("S07", { seed: 20261105 });
  assert.equal(state.perception.available, false);
  assert.equal(state.perception.laneGeometryKnown, false);
  assert.equal(state.orchestrator.mode, ASSISTANCE_MODES.UNKNOWN);
  assert.equal(state.orchestrator.decision, "UNKNOWN");
  assert.deepEqual(state.metrics.visitedLanes, [1]);
  assert.equal(maneuverTimeline(state).length, 0);
  assert.ok(state.ego.speed <= state.config.unknownPerceptionSpeed + 0.01);
});

test("S08 driver recovery does not teleport or abandon an active maneuver", () => {
  const state = simulateScenario("S08", { seed: 20261105 });
  assert.equal(state.driver.attention, "NORMAL");
  assert.deepEqual(state.metrics.visitedLanes, [1, 0]);
  assert.equal(state.ego.currentLane, 1);
  assert.equal(state.metrics.collisionCount, 0);
  assert.ok(state.timeline.some((event) => event.message.includes("recovery to original lane completed")));
});

test("S09 respects the occupied left lane when multiple objects move", () => {
  const state = simulateScenario("S09", { seed: 20261105 });
  const laneChanges = maneuverTimeline(state).filter((event) => event.phase === "LANE_CHANGE");
  assert.ok(laneChanges.length >= 1);
  assert.ok(laneChanges.every((event) => event.targetLane === 2));
  assert.equal(state.metrics.visitedLanes.includes(0), false);
  assert.equal(state.metrics.visitedLanes.includes(2), true);
  assert.equal(state.metrics.collisionCount, 0);
});

test("S10 is a local-only timeline and protected workflow remains blocked", () => {
  const state = simulateScenario("S10", { seed: 20261105 });
  assert.equal(state.security.offlineOnly, true);
  assert.equal(state.security.secureWorkflowAvailable, false);
  assert.equal(state.security.integrationBlocked, true);
  assert.equal(state.security.protectedWorkflowStatus, "UNAVAILABLE_PR_B");
  assert.equal(state.localSession.status, "ENDED");
  assert.equal(state.localSession.alertCount, 1);
  assert.equal(state.localSession.persisted, false);
  assert.ok(state.timeline.every((event) => event.localSimulationOnly));
  assert.equal(state.metrics.collisionCount, 0);
  assert.equal(state.ego.speed, 0);
});

test("all seeded scenarios are reproducible and every snapshot remains simulation-only", () => {
  assert.equal(Object.isFrozen(SCENARIO_CATALOG), true);
  assert.equal(Object.isFrozen(SCENARIO_CATALOG.S03.obstacles), true);
  for (const scenarioId of SCENARIO_IDS) {
    assert.deepEqual(createScenario(scenarioId, 144), createScenario(scenarioId, 144));
    assert.notDeepEqual(createScenario(scenarioId, 144), createScenario(scenarioId, 145));

    let state = createInitialSimulationState(scenarioId, { seed: 144 });
    while (state.runState === "RUNNING") {
      assertSafeSimulationBoundary(state);
      state = stepSimulation(state);
    }
    assertSafeSimulationBoundary(state);
    assert.equal(state.metrics.collisionCount, 0, `${scenarioId} must not collide`);
  }
});

test("engine source has no browser network, authentication, or vehicle-control dependency", async () => {
  const source = await readFile(simulationSourceUrl, "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bWebSocket\b/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /Authorization|Bearer|driving\/session/);
  assert.doesNotMatch(source, /steeringCommand|throttleCommand|brakeCommand/);
});

test("the complete simulator source has no API, storage, camera, or authorization path", async () => {
  const entries = await readdir(simulationDirectoryUrl, { withFileTypes: true });
  const sourceFiles = entries.filter(
    (entry) => entry.isFile() && /\.(?:js|jsx)$/.test(entry.name),
  );
  assert.ok(sourceFiles.length > 0);

  for (const entry of sourceFiles) {
    const source = await readFile(new URL(entry.name, simulationDirectoryUrl), "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(/, entry.name);
    assert.doesNotMatch(source, /\baxios\s*\./, entry.name);
    assert.doesNotMatch(source, /\bXMLHttpRequest\b/, entry.name);
    assert.doesNotMatch(source, /new\s+WebSocket\s*\(/, entry.name);
    assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\s*\./, entry.name);
    assert.doesNotMatch(source, /\bgetUserMedia\s*\(/, entry.name);
    assert.doesNotMatch(source, /\/api\//, entry.name);
    assert.doesNotMatch(source, /dmsAuthHeaders|driving\/session/, entry.name);
  }
});
