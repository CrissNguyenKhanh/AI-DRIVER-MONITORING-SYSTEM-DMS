/**
 * DMS Constants
 * Các hằng số dùng chung cho Driver Monitoring System
 */

// EAR (Eye Aspect Ratio) Constants
export const EAR_BLINK_THRESH = 0.21;
export const EAR_HISTORY = 90;
export const EYES_CLOSED_WARN_MS = 3000;

// Label mapping for driver states
export const LABEL_MAP = {
  safe: { vi: "NORMAL", level: "good", color: "#00f5a0" },
  drowsy: { vi: "DROWSY", level: "warning", color: "#ffc940" },
  yawning: { vi: "YAWNING", level: "warning", color: "#ffc940" },
  angry: { vi: "DISTRACTED", level: "risk", color: "#ff4560" },
  stressed: { vi: "STRESSED", level: "risk", color: "#ff6b6b" },
  unknown: { vi: "ANALYZING", level: "unknown", color: "#4a90d9" },
  no_face: { vi: "NO FACE", level: "unknown", color: "#4a90d9" },
};

// Status icons for DMS dashboard
export const STATUS_ICONS = [
  { id: "camera", label: "Camera", icon: "📷" },
  { id: "attentive", label: "Attentive", icon: "🧠" },
  { id: "awake", label: "Awake", icon: "👁" },
  { id: "seatbelt", label: "Seatbelt", icon: "🔒" },
  { id: "cabin", label: "Cabin", icon: "💡" },
  { id: "phone", label: "Phone", icon: "📱" },
  { id: "smoking", label: "Smoking", icon: "🚬" },
];

// Left eye landmark indices (MediaPipe FaceMesh)
export const L_EYE = {
  p1: 33,
  p2: 160,
  p3: 158,
  p4: 133,
  p5: 153,
  p6: 144,
  outer: 33,
  inner: 133,
  iris: [468, 469, 470, 471, 472],
};

// Right eye landmark indices (MediaPipe FaceMesh)
export const R_EYE = {
  p1: 362,
  p2: 385,
  p3: 387,
  p4: 263,
  p5: 373,
  p6: 380,
  outer: 362,
  inner: 263,
  iris: [473, 474, 475, 476, 477],
};
