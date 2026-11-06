export class SimulationSessionManager {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    this.session = null;
  }

  start(snapshot, mode = "OFFLINE_DEMO") {
    this.session = Object.freeze({
      sessionId: `${mode.toLowerCase()}-${snapshot.scenarioId}-${snapshot.seed}`,
      mode,
      scenarioId: snapshot.scenarioId,
      seed: snapshot.seed,
      startedAt: this.now(),
      persisted: false,
      protected: false,
      productionControlOutput: null,
    });
    return this.session;
  }

  end(snapshot) {
    if (!this.session) return null;
    this.session = Object.freeze({
      ...this.session,
      endedAt: this.now(),
      simulationDurationSeconds: snapshot.time,
    });
    return this.session;
  }

  reset() {
    this.session = null;
  }
}
