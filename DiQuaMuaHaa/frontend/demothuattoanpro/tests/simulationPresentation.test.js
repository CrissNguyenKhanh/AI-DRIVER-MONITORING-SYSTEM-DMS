import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENARIO_PRESENTATION,
  laneAvailability,
  syntheticDmsMetrics,
} from "../src/simulation/presentation.js";
import {
  createInitialSimulationState,
  updateSimulationInput,
} from "../src/simulation/roadSimulation.js";

test("all twenty deterministic scenarios have explicit Vietnamese presentation copy", () => {
  assert.deepEqual(
    Object.keys(SCENARIO_PRESENTATION),
    Array.from({ length: 20 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`),
  );
  assert.match(SCENARIO_PRESENTATION.S10.description, /PR B\/C/);
  assert.match(SCENARIO_PRESENTATION.S20.description, /trình diễn/i);
});

test("DMS metrics are visibly synthetic and UNKNOWN never fabricates values", () => {
  assert.equal(syntheticDmsMetrics("DROWSY").perclos, 0.68);
  assert.equal(syntheticDmsMetrics("UNKNOWN").ear, null);
  assert.equal(syntheticDmsMetrics("UNKNOWN").perclos, null);
});

test("lane availability reuses the deterministic engine clearance policy", () => {
  const state = createInitialSimulationState("S03", { seed: 1 });
  const result = laneAvailability(state);
  assert.deepEqual(result, [
    { lane: 0, available: true },
    { lane: 1, available: true },
    { lane: 2, available: false },
  ]);

  const unknown = updateSimulationInput(state, {
    perception: { available: false, laneGeometryKnown: false },
  });
  assert.ok(laneAvailability(unknown).every((lane) => lane.available === false));
});
