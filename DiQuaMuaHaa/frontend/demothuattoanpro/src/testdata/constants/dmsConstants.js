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

// Hand connections — topology MediaPipe Hands (21 points)
export const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

// FaceMesh landmark indices for drawing
export const LEFT_EYE_IDX = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];

export const RIGHT_EYE_IDX = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
];

export const FACE_OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];

export const LIPS_IDX = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
  181, 91, 146,
];
