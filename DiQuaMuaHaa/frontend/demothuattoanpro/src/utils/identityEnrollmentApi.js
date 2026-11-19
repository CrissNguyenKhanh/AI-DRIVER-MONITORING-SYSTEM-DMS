import { dmsAuthHeaders } from "./authApi.js";

async function jsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function requestJson(url, init = {}, { signal, timeoutMs = 8_000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return jsonResponse(response);
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      const timeoutError = new Error("Máy chủ phản hồi quá chậm. Vui lòng thử lại.");
      timeoutError.code = "request_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function getDriverIdentityProfile(apiBase, driverId, options = {}) {
  return requestJson(
    `${apiBase}/api/identity/driver_profile?driver_id=${encodeURIComponent(String(driverId))}`,
    { headers: dmsAuthHeaders() },
    options,
  );
}

export async function createIdentityEnrollmentChallenge(
  apiBase,
  { driverId, operation },
  options = {},
) {
  return requestJson(
    `${apiBase}/api/identity/enrollment/challenge`,
    {
      method: "POST",
      headers: dmsAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        driver_id: String(driverId),
        operation,
      }),
    },
    options,
  );
}

export async function getAuthorizationChallenge(apiBase, challengeId, options = {}) {
  return requestJson(
    `${apiBase}/api/authorization/challenge/${encodeURIComponent(String(challengeId))}`,
    { headers: dmsAuthHeaders() },
    options,
  );
}

export async function submitIdentityEnrollment(
  apiBase,
  { driverId, name, images, operation, enrollmentGrant },
  options = {},
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
  return requestJson(
    `${apiBase}/api/identity/register`,
    {
      method: "POST",
      headers: dmsAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        driver_id: String(driverId),
        name: String(name || driverId),
        images,
        operation,
        enrollment_grant: String(enrollmentGrant),
      }),
    },
    options,
  );
}
