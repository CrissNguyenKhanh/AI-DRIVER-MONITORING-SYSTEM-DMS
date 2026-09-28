import { resolveApiBase } from "./resolveApiBase.js";

function resolve(service, configured) {
  return resolveApiBase({
    service,
    configured,
    development: import.meta.env.DEV,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
}

export function getDmsApiBase() {
  return resolve("dms", import.meta.env.VITE_API_BASE);
}

export function getMedicalApiBase() {
  return resolve("medical", import.meta.env.VITE_MEDICAL_API_BASE);
}
