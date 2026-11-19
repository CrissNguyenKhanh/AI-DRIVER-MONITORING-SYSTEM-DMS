export const DMS_AUTH_TOKEN_KEY = "dms_auth_token_v1";
export const DMS_AUTH_DRIVER_KEY = "dms_auth_driver_v1";
export const DMS_AUTH_EXPIRES_KEY = "dms_auth_expires_v1";

const LEGACY_BIOMETRIC_STORAGE_KEYS = Object.freeze(["driver_owner_image_v1"]);

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStorage(key) {
  try {
    return storage()?.getItem(key) || "";
  } catch {
    return "";
  }
}

export function getDmsAuthToken() {
  return readStorage(DMS_AUTH_TOKEN_KEY);
}

export function getStoredDmsDriver() {
  return readStorage(DMS_AUTH_DRIVER_KEY);
}

export function getStoredDmsExpiry() {
  return readStorage(DMS_AUTH_EXPIRES_KEY);
}

export function saveDmsAuthSession(accessToken, driverId, expiresAt = "") {
  if (!accessToken) throw new Error("Missing DMS access token");
  const target = storage();
  target?.setItem(DMS_AUTH_TOKEN_KEY, accessToken);
  if (driverId) target?.setItem(DMS_AUTH_DRIVER_KEY, String(driverId));
  if (expiresAt) target?.setItem(DMS_AUTH_EXPIRES_KEY, String(expiresAt));
  else target?.removeItem(DMS_AUTH_EXPIRES_KEY);
}

export function clearDmsAuthSession({ preserveDriver = false } = {}) {
  const target = storage();
  target?.removeItem(DMS_AUTH_TOKEN_KEY);
  if (!preserveDriver) target?.removeItem(DMS_AUTH_DRIVER_KEY);
  target?.removeItem(DMS_AUTH_EXPIRES_KEY);
}

export function removeLegacyBiometricStorage() {
  const target = storage();
  if (!target) return false;
  let removed = false;
  for (const key of LEGACY_BIOMETRIC_STORAGE_KEYS) {
    try {
      if (target.getItem(key) != null) removed = true;
      target.removeItem(key);
    } catch {
      // Best effort only; this never touches the server-side biometric profile.
    }
  }
  return removed;
}

export function dmsAuthHeaders(headers = {}) {
  const token = getDmsAuthToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
}

export function validateDriverId(value) {
  const driverId = String(value || "").trim();
  return /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(driverId);
}

export function enrollmentErrorMessage(code) {
  const messages = {
    invalid_enrollment_input: "Nhập Driver ID hợp lệ và Enrollment Code được quản trị viên cấp.",
    invalid_driver_id: "Driver ID dài 1–64 ký tự và chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
    invalid_enrollment_code: "Enrollment Code không đúng. Hãy kiểm tra lại hoặc liên hệ quản trị viên để nhận mã mới.",
    enrollment_code_expired: "Enrollment Code đã hết hạn. Hãy yêu cầu quản trị viên cấp mã mới.",
    enrollment_code_used: "Enrollment Code đã được sử dụng. Mỗi mã chỉ dùng một lần; hãy yêu cầu mã mới.",
    enrollment_code_replayed: "Enrollment Code đã được sử dụng hoặc hết hạn. Hãy yêu cầu mã mới.",
    driver_id_mismatch: "Enrollment Code không thuộc Driver ID này. Hãy kiểm tra Driver ID hoặc yêu cầu đúng mã.",
    request_timeout: "Máy chủ phản hồi quá chậm. Phiên hiện có chưa bị xóa; hãy thử lại.",
    network_unavailable: "Không thể kết nối máy chủ DMS. Kiểm tra mạng rồi thử lại.",
    session_expired: "Phiên DMS đã hết hạn hoặc bị thu hồi. Bạn cần Enrollment Code mới để đăng nhập lại.",
    invalid_admin_credentials: "Bootstrap secret không đúng.",
    admin_auth_unavailable: "Máy chủ chưa bật xác thực quản trị DMS.",
    admin_session_required: "Phiên quản trị chưa hợp lệ. Hãy xác thực lại.",
  };
  return messages[code] || "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

async function requestJson(url, {
  method = "GET",
  headers = {},
  body,
  signal,
  timeoutMs = 8_000,
} = {}) {
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
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (signal?.aborted) throw error;
    const code = timedOut ? "request_timeout" : "network_unavailable";
    const requestError = new Error(enrollmentErrorMessage(code));
    requestError.code = code;
    throw requestError;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function validateDmsSession(apiBase, { signal, timeoutMs } = {}) {
  const token = getDmsAuthToken();
  if (!token) {
    return { authenticated: false, state: "missing", code: "session_missing" };
  }
  try {
    const result = await requestJson(`${apiBase}/api/auth/me`, {
      headers: dmsAuthHeaders(),
      signal,
      timeoutMs,
    });
    if (result.ok && result.data?.role === "driver" && result.data?.driver_id) {
      saveDmsAuthSession(
        token,
        result.data.driver_id,
        result.data.expires_at || getStoredDmsExpiry(),
      );
      removeLegacyBiometricStorage();
      return { authenticated: true, state: "authenticated", principal: result.data };
    }
    if (result.status === 401 || result.status === 403) {
      clearDmsAuthSession({ preserveDriver: true });
      return {
        authenticated: false,
        state: "expired",
        code: "session_expired",
        message: enrollmentErrorMessage("session_expired"),
      };
    }
    return {
      authenticated: false,
      state: "unavailable",
      code: result.data?.code || "network_unavailable",
      message: result.data?.error || enrollmentErrorMessage("network_unavailable"),
      preserveToken: true,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      authenticated: false,
      state: "unavailable",
      code: error.code || "network_unavailable",
      message: error.message || enrollmentErrorMessage("network_unavailable"),
      preserveToken: true,
    };
  }
}

export async function enrollDmsDriver(
  apiBase,
  { driverId, enrollmentCode },
  { signal, timeoutMs } = {},
) {
  const normalizedDriverId = String(driverId || "").trim();
  const normalizedCode = String(enrollmentCode || "").trim();
  if (!validateDriverId(normalizedDriverId) || !normalizedCode) {
    const code = validateDriverId(normalizedDriverId)
      ? "invalid_enrollment_input"
      : "invalid_driver_id";
    return { ok: false, status: 400, code, message: enrollmentErrorMessage(code) };
  }
  try {
    const result = await requestJson(`${apiBase}/api/auth/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver_id: normalizedDriverId,
        enrollment_code: normalizedCode,
      }),
      signal,
      timeoutMs,
    });
    if (!result.ok || !result.data?.access_token) {
      const code = result.data?.code || "invalid_enrollment_code";
      return { ...result, code, message: enrollmentErrorMessage(code) };
    }
    const resolvedDriverId = result.data.driver_id || normalizedDriverId;
    saveDmsAuthSession(
      result.data.access_token,
      resolvedDriverId,
      result.data.expires_at || "",
    );
    removeLegacyBiometricStorage();
    return {
      ...result,
      code: "enrollment_success",
      message: "Đăng nhập DMS thành công. Phiên sẽ được kiểm tra lại khi tải trang.",
      principal: { role: "driver", driver_id: resolvedDriverId },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ok: false,
      status: 0,
      code: error.code || "network_unavailable",
      message: error.message || enrollmentErrorMessage("network_unavailable"),
    };
  }
}

export function createEnrollmentSubmissionManager({ enroll = enrollDmsDriver } = {}) {
  let pending = null;
  let controller = null;
  let disposed = false;
  return {
    submit(apiBase, input, options = {}) {
      if (disposed) return Promise.resolve({ ok: false, code: "disposed" });
      if (pending) return pending;
      controller = new AbortController();
      pending = enroll(apiBase, input, { ...options, signal: controller.signal })
        .finally(() => {
          pending = null;
          controller = null;
        });
      return pending;
    },
    cancel() {
      disposed = true;
      controller?.abort();
    },
    get pending() {
      return Boolean(pending);
    },
  };
}

export async function logoutDmsSession(apiBase, { signal, timeoutMs } = {}) {
  const token = getDmsAuthToken();
  let serverNotified = false;
  try {
    if (token) {
      const result = await requestJson(`${apiBase}/api/auth/logout`, {
        method: "POST",
        headers: dmsAuthHeaders({ "Content-Type": "application/json" }),
        body: "{}",
        signal,
        timeoutMs,
      });
      serverNotified = result.ok;
    }
  } catch {
    // Local logout must still succeed when the server or network is unavailable.
  } finally {
    clearDmsAuthSession();
  }
  return { ok: true, serverNotified };
}

export async function createDmsAdminSession(apiBase, bootstrapSecret, options = {}) {
  const secret = String(bootstrapSecret || "");
  if (!secret) {
    return { ok: false, code: "invalid_admin_credentials", message: "Nhập bootstrap secret." };
  }
  try {
    const result = await requestJson(`${apiBase}/api/auth/admin/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrap_secret: secret }),
      ...options,
    });
    const code = result.data?.code || (result.ok ? "admin_authenticated" : "invalid_admin_credentials");
    return {
      ...result,
      code,
      message: result.ok ? "Đã xác thực quản trị viên DMS." : enrollmentErrorMessage(code),
    };
  } catch (error) {
    return { ok: false, status: 0, code: error.code, message: error.message };
  }
}

export async function createDriverEnrollmentCode(
  apiBase,
  { adminToken, driverId },
  options = {},
) {
  const normalizedDriverId = String(driverId || "").trim();
  if (!adminToken || !validateDriverId(normalizedDriverId)) {
    const code = !adminToken ? "admin_session_required" : "invalid_driver_id";
    return { ok: false, status: 400, code, message: enrollmentErrorMessage(code) };
  }
  try {
    const result = await requestJson(`${apiBase}/api/admin/enrollment-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ driver_id: normalizedDriverId }),
      ...options,
    });
    const code = result.data?.code || (result.ok ? "code_created" : "admin_session_required");
    return {
      ...result,
      code,
      message: result.ok
        ? "Đã tạo mã một lần. Chỉ chia sẻ qua kênh tin cậy."
        : result.data?.error || enrollmentErrorMessage(code),
    };
  } catch (error) {
    return { ok: false, status: 0, code: error.code, message: error.message };
  }
}

export function medicalAuthHeaders(headers = {}) {
  const token = readStorage("token");
  return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
}

export function getStoredMedicalUser() {
  try {
    return JSON.parse(readStorage("user") || "null");
  } catch {
    return null;
  }
}
