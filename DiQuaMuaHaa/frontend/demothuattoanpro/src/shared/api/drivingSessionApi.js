/**
 * Phiên lái / nhật ký cảnh báo — backend DMS (Flask :8000).
 */

export async function startDrivingSession(apiBase, { driverId = null, label = null } = {}) {
  const r = await fetch(`${apiBase}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(driverId ? { driver_id: String(driverId) } : {}),
      ...(label ? { label: String(label) } : {}),
    }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export async function endDrivingSession(apiBase, sessionId) {
  const r = await fetch(`${apiBase}/api/session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export async function recordDrivingAlert(apiBase, sessionId, alertType, delta = 1) {
  const r = await fetch(`${apiBase}/api/session/alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, alert_type: alertType, delta }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export async function listDrivingSessions(apiBase, { limit = 30, driverId = null } = {}) {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  if (driverId) q.set("driver_id", String(driverId));
  const r = await fetch(`${apiBase}/api/session/list?${q.toString()}`);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}
