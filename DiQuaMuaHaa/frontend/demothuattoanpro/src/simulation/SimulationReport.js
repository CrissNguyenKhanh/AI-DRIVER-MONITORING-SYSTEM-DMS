function countBy(items, predicate) {
  return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}

export function buildSimulationReport(snapshot, normalizedTimeline = [], options = {}) {
  const alerts = options.alertHistory || [];
  return Object.freeze({
    reportVersion: 2,
    generatedAt: new Date().toISOString(),
    scenario: {
      id: snapshot.scenarioId,
      name: snapshot.scenarioName,
      seed: snapshot.seed,
      durationSeconds: snapshot.time,
    },
    finalDriverState: snapshot.driver.attention,
    counters: {
      warnings: countBy(alerts, (item) => item.severity === "WARNING"),
      critical: countBy(alerts, (item) => item.severity === "CRITICAL"),
      simulatedBraking: countBy(normalizedTimeline, (item) => item.eventType === "BRAKING"),
      virtualLaneChanges: countBy(normalizedTimeline, (item) => item.eventType === "LANE_CHANGE_STARTED"),
      simulatedSafeStops: countBy(normalizedTimeline, (item) => item.eventType === "SAFE_STOP"),
      virtualCollisions: snapshot.metrics.collisionCount,
    },
    metrics: {
      minimumVirtualClearanceMeters: snapshot.metrics.minimumVirtualClearance,
      maximumBrakingMetersPerSecondSquared: snapshot.metrics.maximumBraking,
      timeToVirtualStopSeconds: snapshot.metrics.timeToVirtualStop,
      visitedVirtualLanes: [...snapshot.metrics.visitedLanes],
    },
    provenance: {
      inputMode: options.inputMode || "OFFLINE_SIMULATION",
      driverInput: options.inputMode === "LIVE_DMS_VIRTUAL_ROAD"
        ? "LIVE_DMS_METRICS_ONLY"
        : options.inputMode === "ROAD_VIDEO_ANALYSIS"
          ? "NOT_USED_ROAD_VIDEO_STREAM"
          : "SCRIPTED_SYNTHETIC",
      roadCoordinates: options.inputMode === "ROAD_VIDEO_ANALYSIS"
        ? "NOT_USED_ROAD_VIDEO_ONLY"
        : "KNOWN_VIRTUAL_WORLD",
      roadVideoCoordinates: "IMAGE_SPACE_ONLY_NOT_CALIBRATED_TO_METERS",
      containsBiometricImages: false,
      containsCredentials: false,
      simulationOnly: true,
      productionControlOutput: null,
    },
    availability: options.availability || {},
    protectedSession: options.inputMode === "LIVE_DMS_VIRTUAL_ROAD"
      ? {
          status: "NOT_STARTED",
          reason: "START_FROM_DMS_WORKFLOW_WITH_ONE_TIME_SERVER_GRANT",
        }
      : {
          status: "NOT_APPLICABLE",
          reason: "EPHEMERAL_LOCAL_SESSION",
        },
    timeline: normalizedTimeline,
  });
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function timelineToCsv(items) {
  const columns = [
    "occurredAt", "eventType", "severity", "source", "sourceMode", "simulated",
    "dmsState", "roadEvent", "adasDecision", "vehicleResponse", "reason",
  ];
  return [
    columns.join(","),
    ...items.map((item) => columns.map((column) => csvCell(item[column])).join(",")),
  ].join("\n");
}

export function downloadTextFile(filename, contents, mimeType = "text/plain") {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
