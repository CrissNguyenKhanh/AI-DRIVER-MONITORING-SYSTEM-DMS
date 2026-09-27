/** Pure resolver shared by Vite validation, REST callers and Socket.IO. */
export function resolveApiBase({ configured, development, origin = "", service = "dms" }) {
  const key = service === "medical" ? "VITE_MEDICAL_API_BASE" : "VITE_API_BASE";
  const value = String(configured || "").trim().replace(/\/+$/, "");
  if (String(configured || "").trim() === "/") {
    return origin.replace(/\/+$/, "");
  }
  if (!value) {
    if (!development) throw new Error(`${key} is required; use an HTTPS origin or / for an explicitly configured same-origin proxy`);
    if (origin) return origin.replace(/\/+$/, "") + (service === "medical" ? "/api-medical" : "");
    return service === "medical" ? "http://localhost:5000" : "http://localhost:8000";
  }
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key} must be a valid HTTP(S) URL`); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || (service === "dms" && url.pathname !== "/")) {
    throw new Error(`${key} must be an HTTP(S) origin without credentials, query or fragment`);
  }
  if (url.protocol === "http:" && (!development || origin.startsWith("https:"))) {
    throw new Error(`${key} must use HTTPS to avoid mixed content`);
  }
  return url.href.replace(/\/+$/, "");
}
