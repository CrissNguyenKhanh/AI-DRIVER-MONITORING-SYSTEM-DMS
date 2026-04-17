/**
 * Khi mở web trên điện thoại (http://IP-PC:5173), hostname trùng IP PC
 * → gọi API cùng host, cổng 8000 (Flask DMS).
 *
 * .env: VITE_API_BASE=https://xxx.ngrok-free.app  (ghi đè khi tunnel)
 */
export function getDmsApiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, "");
  }
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location?.protocol === "https:"
  ) {
    return window.location.origin.replace(/\/$/, "");
  }
  if (typeof window === "undefined" || !window.location?.hostname) {
    return "http://localhost:8000";
  }
  const h = window.location.hostname;
  return `http://${h}:8000`;
}

/** API medical demo (len.py), cổng 5000 */
export function getMedicalApiBase() {
  const fromEnv = import.meta.env.VITE_MEDICAL_API_BASE;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, "");
  }
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location?.protocol === "https:"
  ) {
    return `${window.location.origin.replace(/\/$/, "")}/api-medical`;
  }
  if (typeof window === "undefined" || !window.location?.hostname) {
    return "http://localhost:5000";
  }
  const h = window.location.hostname;
  return `http://${h}:5000`;
}
