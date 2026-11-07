import { dmsAuthHeaders } from "./authApi.js";

async function jsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function getDriverIdentityProfile(apiBase, driverId, { signal } = {}) {
  const response = await fetch(
    `${apiBase}/api/identity/driver_profile?driver_id=${encodeURIComponent(String(driverId))}`,
    { headers: dmsAuthHeaders(), signal },
  );
  return jsonResponse(response);
}

export async function createIdentityEnrollmentChallenge(
  apiBase,
  { driverId, operation },
) {
  const response = await fetch(`${apiBase}/api/identity/enrollment/challenge`, {
    method: "POST",
    headers: dmsAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      driver_id: String(driverId),
      operation,
    }),
  });
  return jsonResponse(response);
}

export async function getAuthorizationChallenge(apiBase, challengeId, { signal } = {}) {
  const response = await fetch(
    `${apiBase}/api/authorization/challenge/${encodeURIComponent(String(challengeId))}`,
    { headers: dmsAuthHeaders(), signal },
  );
  return jsonResponse(response);
}

export async function submitIdentityEnrollment(
  apiBase,
  { driverId, name, images, operation, enrollmentGrant },
) {
  if (!enrollmentGrant) {
    return {
      ok: false,
      status: 0,
      data: {
        code: "enrollment_grant_required",
        error: "Admin-approved enrollment grant required",
      },
    };
  }
  const response = await fetch(`${apiBase}/api/identity/register`, {
    method: "POST",
    headers: dmsAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      driver_id: String(driverId),
      name: String(name || driverId),
      images,
      operation,
      enrollment_grant: String(enrollmentGrant),
    }),
  });
  return jsonResponse(response);
}
