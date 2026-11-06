import assert from "node:assert/strict";
import test from "node:test";

import {
  AudioAlertManager,
  DrivingEventTimeline,
  EVENT_SEVERITIES,
  EVENT_SOURCE_MODES,
  NormalizedEventGuard,
  SafetyAlertEngine,
  buildSimulationReport,
  createInitialSimulationState,
  createNormalizedEvent,
  eventsFromSimulationTransition,
  simulateScenario,
  stepSimulation,
  timelineToCsv,
} from "../src/simulation/index.js";

function event(overrides = {}) {
  return createNormalizedEvent({
    eventId: "evt-1",
    eventType: "OBSTACLE_AHEAD",
    severity: EVENT_SEVERITIES.WARNING,
    source: "RoadPerceptionAdapter",
    sourceMode: EVENT_SOURCE_MODES.VIRTUAL_WORLD,
    simulated: true,
    streamId: "virtual-s03",
    sessionId: "offline-s03",
    occurredAt: 2.5,
    receivedAt: "2026-11-07T00:00:00.000Z",
    payload: { obstacleId: "front" },
    confidenceOrStatus: null,
    reason: "VIRTUAL_FRONT_HAZARD",
    ...overrides,
  });
}

test("normalized event contract rejects malformed input and duplicate events", () => {
  assert.throws(() => createNormalizedEvent({}), /severity/);
  const guard = new NormalizedEventGuard();
  assert.equal(guard.accept(event()).accepted, true);
  assert.equal(guard.accept(event()).reason, "DUPLICATE_EVENT");
  guard.reset();
  assert.equal(guard.accept(event()).accepted, true);
});

test("external event guard rejects stale and out-of-order live DMS events", () => {
  const now = Date.parse("2026-11-07T12:00:10.000Z");
  const guard = new NormalizedEventGuard({ maximumAgeMs: 5_000, now: () => now });
  const live = {
    ...event(),
    eventId: "live-1",
    sourceMode: EVENT_SOURCE_MODES.LIVE_DMS,
    simulated: false,
    occurredAt: "2026-11-07T12:00:08.000Z",
  };
  assert.equal(guard.accept(live).accepted, true);
  assert.equal(guard.accept({ ...live, eventId: "live-old", occurredAt: "2026-11-07T12:00:07.000Z" }).reason, "OUT_OF_ORDER_EVENT");
  assert.equal(guard.accept({ ...live, eventId: "live-stale", occurredAt: "2026-11-07T11:59:00.000Z" }).reason, "STALE_EVENT");
});

test("alert engine prioritizes critical alerts, deduplicates and resets", () => {
  let now = 1_000;
  const engine = new SafetyAlertEngine({ now: () => now });
  const warning = engine.ingest(event());
  assert.equal(warning.accepted, true);
  assert.equal(warning.alert.shouldPlayAudio, true);
  assert.equal(engine.ingest(event()).reason, "DUPLICATE_EVENT");
  now += 50;
  engine.ingest(event({ eventId: "critical", eventType: "SAFE_STOP", severity: "CRITICAL" }));
  assert.equal(engine.getPrimary().severity, "CRITICAL");
  engine.reset();
  assert.equal(engine.getPrimary(), null);
});

test("UNKNOWN is unavailable, never safe, and recovery clears driver alerts", () => {
  let now = 0;
  const engine = new SafetyAlertEngine({ now: () => now });
  engine.ingest(event({ eventId: "drowsy", eventType: "DRIVER_DROWSY", severity: "WARNING" }));
  now += 1_000;
  engine.ingest(event({ eventId: "unknown", eventType: "CAMERA_UNAVAILABLE", severity: "UNAVAILABLE" }));
  assert.equal(engine.getActive().some((alert) => alert.severity === "UNAVAILABLE"), true);
  now += 1_000;
  engine.ingest(event({ eventId: "recovered", eventType: "DRIVER_RECOVERED", severity: "INFO" }));
  assert.equal(engine.getActive().some((alert) => alert.type === "DRIVER_DROWSY"), false);
});

test("audio manager requires explicit unlock and emits one Web Audio pattern", async () => {
  const calls = [];
  const oscillator = () => ({
    type: "sine",
    frequency: { value: 0 },
    connect() { return this; },
    start: (at) => calls.push(["start", at]),
    stop: (at) => calls.push(["stop", at]),
  });
  const gain = () => ({
    gain: {
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    },
    connect() { return this; },
  });
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    createOscillator: oscillator,
    createGain: gain,
    close: async () => calls.push(["close"]),
  };
  const manager = new AudioAlertManager({ audioContextFactory: () => context, speech: null });
  assert.equal(manager.play({ severity: "WARNING", shouldPlayAudio: true }), false);
  assert.equal(await manager.unlock(), true);
  assert.equal(manager.play({ type: "OBSTACLE_AHEAD", severity: "WARNING", shouldPlayAudio: true }), true);
  assert.equal(calls.filter(([name]) => name === "start").length, 2);
  await manager.dispose();
  assert.deepEqual(calls.at(-1), ["close"]);
});

test("road transition adapter emits obstacle and braking events once per transition", () => {
  let previous = createInitialSimulationState("S03", { seed: 20261105 });
  const found = [];
  for (let index = 0; index < 300 && !found.some((item) => item.eventType === "OBSTACLE_AHEAD"); index += 1) {
    const next = stepSimulation(previous);
    found.push(...eventsFromSimulationTransition(previous, next));
    previous = next;
  }
  assert.equal(found.some((item) => item.eventType === "OBSTACLE_AHEAD"), true);
  assert.equal(found.every((item) => item.simulated), true);
  assert.equal(found.every((item) => item.sourceMode === "VIRTUAL_WORLD"), true);
});

test("timeline is bounded, deduplicated and report export contains no biometric images", () => {
  const timeline = new DrivingEventTimeline({ limit: 2 });
  assert.equal(timeline.append(event()), true);
  assert.equal(timeline.append(event()), false);
  timeline.append(event({ eventId: "evt-2", eventType: "BRAKING" }));
  timeline.append(event({ eventId: "evt-3", eventType: "SAFE_STOP", severity: "CRITICAL" }));
  assert.deepEqual(timeline.list().map((item) => item.eventId), ["evt-2", "evt-3"]);
  const state = simulateScenario("S18", { seed: 20261105 });
  const report = buildSimulationReport(state, timeline.list(), { inputMode: "OFFLINE_DEMO" });
  assert.equal(report.provenance.containsBiometricImages, false);
  assert.equal(report.provenance.productionControlOutput, null);
  assert.equal(report.protectedSession.status, "BLOCKED");
  assert.match(timelineToCsv(timeline.list()), /eventType,severity/);
});

test("S11-S20 cover phone, escalation, abort, recovery, unavailable and showcase flows", () => {
  const results = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
      const id = `S${index + 11}`;
      return [id, simulateScenario(id, { seed: 20261105 })];
    }),
  );
  assert.equal(results.S11.timeline.some((item) => item.type === "PHONE_USAGE" && item.active), true);
  assert.deepEqual(results.S12.metrics.visitedLanes, [1]);
  assert.equal(results.S12.driver.attention, "HIGH_RISK");
  assert.equal(results.S13.timeline.some((item) => item.type === "MANEUVER_ABORT"), true);
  assert.equal(results.S14.metrics.visitedLanes.length > 1, true);
  assert.equal(results.S15.driver.attention, "NORMAL");
  assert.equal(results.S16.orchestrator.decision, "UNKNOWN");
  assert.deepEqual(results.S17.metrics.visitedLanes, [1]);
  assert.equal(results.S18.ego.speed, 0);
  assert.equal(results.S19.orchestrator.decision, "UNKNOWN");
  assert.deepEqual(results.S20.metrics.visitedLanes, [1, 0]);
  for (const state of Object.values(results)) {
    assert.equal(state.metrics.collisionCount, 0, state.scenarioId);
    assert.equal(state.safety.productionControlOutput, null, state.scenarioId);
  }
});
