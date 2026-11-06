export const RECORDING_MIME_CANDIDATES = Object.freeze([
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=h264",
  "video/mp4",
]);

export const MAX_LOCAL_RECORDING_BYTES = 250 * 1024 * 1024;
export const MAX_LOCAL_RECORDING_MS = 10 * 60 * 1000;

export function selectRecordingMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== "function") return "";
  return RECORDING_MIME_CANDIDATES.find((mime) => isTypeSupported(mime)) || "";
}

export function recordingExtension(mimeType) {
  return String(mimeType).startsWith("video/mp4") ? "mp4" : "webm";
}

export function disposeRecordingResources(active) {
  if (!active) return;
  if (active.frameHandle != null) {
    active.cancelFrame(active.frameHandle);
    active.frameHandle = null;
  }
  if (active.stopTimer != null) {
    active.clearTimer(active.stopTimer);
    active.stopTimer = null;
  }
  active.stream.getTracks().forEach((track) => track.stop());
}

export function drawRecordingComposite({
  context,
  sourceCanvas,
  width,
  height,
  overlay,
}) {
  context.clearRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);

  const lines = [
    "DMS + ADAS — MÔ PHỎNG, KHÔNG ĐIỀU KHIỂN XE THẬT",
    `Kịch bản: ${overlay.scenarioLabel}`,
    `Tài xế: ${overlay.driverState} · Chế độ: ${overlay.assistanceMode}`,
    `Quyết định: ${overlay.decision} · Tốc độ ảo: ${overlay.speedKph} km/h`,
  ];

  context.save();
  context.fillStyle = "rgba(3, 10, 18, 0.78)";
  context.fillRect(0, 0, width, 112);
  context.font = "700 18px system-ui, sans-serif";
  context.fillStyle = "#f8fafc";
  lines.forEach((line, index) => context.fillText(line, 20, 27 + index * 25));
  context.restore();
}
