export const DMS_AUTH_TOKEN_KEY = "dms_auth_token_v1";
export const DMS_AUTH_DRIVER_KEY = "dms_auth_driver_v1";

function storage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

export function getDmsAuthToken() {
  return storage()?.getItem(DMS_AUTH_TOKEN_KEY) || "";
}

export function saveDmsAuthSession(accessToken, driverId) {
  if (!accessToken) throw new Error("Missing DMS access token");
  storage()?.setItem(DMS_AUTH_TOKEN_KEY, accessToken);
  if (driverId) storage()?.setItem(DMS_AUTH_DRIVER_KEY, String(driverId));
}

export function clearDmsAuthSession() {
  storage()?.removeItem(DMS_AUTH_TOKEN_KEY);
  storage()?.removeItem(DMS_AUTH_DRIVER_KEY);
}

export function dmsAuthHeaders(headers = {}) {
  const token = getDmsAuthToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
}

export function medicalAuthHeaders(headers = {}) {
  const token = storage()?.getItem("token") || "";
  return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
}

export function getStoredMedicalUser() {
  try {
    return JSON.parse(storage()?.getItem("user") || "null");
  } catch {
    return null;
  }
}
