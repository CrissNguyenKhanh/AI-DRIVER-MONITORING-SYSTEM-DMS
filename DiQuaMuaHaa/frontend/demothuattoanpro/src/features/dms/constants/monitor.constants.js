import { getDmsApiBase } from "../../../shared/constants/apiEndpoints";

export const API_BASE = getDmsApiBase();
export const API_INTERVAL_MS = 1000; // landmark + smoking vẫn 1s
export const HAND_API_INTERVAL_MS = 1000;
export const HAND_QUICK_CONFIDENCE = 0.75;
/** Nhan backend / model train_hands (collect_hands KEY_MAP) */
export const HAND_LABEL_OPENS_MENU = "open";
/** Dong menu khi khong con ky hieu (hoac nut Dong) */
export const HAND_LABEL_CLOSES_MENU = "no_sign";
export const IDENTITY_BURST_FRAMES = 2;
export const IDENTITY_BURST_GAP_MS = 110;
export const DRIVER_ID_KEY = "driver_owner_id_v1";
export const DEFAULT_DRIVER_ID = "driver_001";
export const HISTORY_SIZE = 10;
export const CONSISTENT_FRAMES = 4;
export const MIN_PROB_FOR_LABEL = 0.6;
export const EAR_BLINK_THRESH = 0.29; // tăng từ 0.21 → 0.27 để hoạt động tốt với người đeo kính
export const EAR_HISTORY = 90;
export const EYES_CLOSED_WARN_MS = 3000;

// ── PHONE — WebSocket YOLO, ~15fps ──────────────────────────
export const PHONE_WS_FPS = 15;
export const PHONE_YOLO_MIN_PROB = 0.55;
export const PHONE_HISTORY_LEN = 20;
export const PHONE_WARN_MS = 3000;
export const PHONE_STABLE_FRAMES = 4; // cần 4 lần liên tiếp mới bật cảnh báo
export const PHONE_OFF_FRAMES = 6; // cần 6 lần liên tiếp mất cảnh báo mới tắt
// ── SMOKING — WebSocket landmark, ~4fps (không cần nhanh hơn) ──
export const SMOKING_WS_FPS = 4;
export const SMOKING_MIN_PROB = 0.82;
export const SMOKING_HISTORY_LEN = 24;
export const SMOKING_STABLE_FRAMES = 10; // cần 10 frames liên tiếp mới bật (~10s * 4fps = 40 frames... thực tế 10 api calls)
export const SMOKING_OFF_FRAMES = 14;
export const SMOKING_WARN_MS = 4000;
// ─────────────────────────────────────────────────────────────

// Tạm tắt smoking trong test để tập trung fix phone detection
export const SMOKING_ENABLED = false;

// ── IDENTITY AUTH (vehicle UUID) ──────────────────────────────
export const ID_AUTH_LOCK_INTRUDER_FRAMES = 3; // liên tiếp không chính chủ thì khóa về auth
export const ID_AUTH_UNLOCK_FRAMES = 2; // liên tiếp chính chủ thì mở về active
export const ID_AUTH_RETRY_INTERVAL_MS = 1200;

export const LABEL_MAP = {
  safe: { vi: "NORMAL", level: "good", color: "#00f5a0" },
  drowsy: { vi: "DROWSY", level: "warning", color: "#ffc940" },
  yawning: { vi: "YAWNING", level: "warning", color: "#ffc940" },
  angry: { vi: "DISTRACTED", level: "risk", color: "#ff4560" },
  stressed: { vi: "STRESSED", level: "risk", color: "#ff6b6b" },
  unknown: { vi: "ANALYZING", level: "unknown", color: "#4a90d9" },
  no_face: { vi: "NO FACE", level: "unknown", color: "#4a90d9" },
};

export const STATUS_ICONS = [
  { id: "camera", label: "Camera", icon: "📷" },
  { id: "attentive", label: "Attentive", icon: "🧠" },
  { id: "awake", label: "Awake", icon: "👁" },
  { id: "seatbelt", label: "Seatbelt", icon: "🔒" },
  { id: "cabin", label: "Cabin", icon: "💡" },
  { id: "phone", label: "Phone", icon: "📱" },
  { id: "smoking", label: "Smoking", icon: "🚬" },
];
