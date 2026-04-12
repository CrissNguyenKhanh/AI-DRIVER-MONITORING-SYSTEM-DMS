/**
 * @fileoverview Tập trung tất cả hằng số cấu hình của hệ thống DMS.
 *
 * Quy tắc: KHÔNG hardcode bất kỳ ngưỡng hay FPS nào trong hooks/components —
 * tất cả phải import từ file này.
 */

import { getDmsApiBase } from "../../config/apiEndpoints";

// ── API ────────────────────────────────────────────────────────
export const API_BASE             = getDmsApiBase();
export const API_INTERVAL_MS      = 1000;

// ── IDENTITY / BURST ───────────────────────────────────────────
export const IDENTITY_BURST_FRAMES   = 2;
export const IDENTITY_BURST_GAP_MS   = 110;
export const DRIVER_ID_KEY           = "driver_owner_id_v1";
export const DEFAULT_DRIVER_ID       = "driver_001";

// ── LABEL SMOOTHING ────────────────────────────────────────────
export const HISTORY_SIZE        = 10;
export const CONSISTENT_FRAMES   = 4;
export const MIN_PROB_FOR_LABEL  = 0.6;

// ── EAR / DROWSY ───────────────────────────────────────────────
export const EAR_BLINK_THRESH    = 0.21;
export const EAR_HISTORY         = 90;
export const EYES_CLOSED_WARN_MS = 3000;

// ── PHONE (WebSocket YOLO ~15fps) ──────────────────────────────
export const PHONE_WS_FPS        = 15;
export const PHONE_YOLO_MIN_PROB = 0.55;
export const PHONE_HISTORY_LEN   = 20;
export const PHONE_WARN_MS       = 3000;
export const PHONE_STABLE_FRAMES = 4;
export const PHONE_OFF_FRAMES    = 6;

// ── SMOKING (WebSocket ~4fps) ──────────────────────────────────
export const SMOKING_WS_FPS        = 4;
export const SMOKING_MIN_PROB      = 0.82;
export const SMOKING_HISTORY_LEN   = 24;
export const SMOKING_STABLE_FRAMES = 10;
export const SMOKING_OFF_FRAMES    = 14;
export const SMOKING_WARN_MS       = 4000;
export const SMOKING_ENABLED       = false; // [P0] bật lại sau khi fix WebSocket

// ── MEDIAPIPE / RAF LOOP ───────────────────────────────────────
export const FACE_MESH_FPS           = 30;       // fps gửi frame vào MediaPipe
export const FACE_MESH_INTERVAL_MS   = Math.round(1000 / 30); // ~33ms

// ── PHONE BBOX FILTER ──────────────────────────────────────────
export const PHONE_BOX_MIN_SIZE      = 0.05;  // tỉ lệ chiều rộng/cao min (normalized)
export const PHONE_BOX_MAX_SIZE      = 0.55;  // tỉ lệ chiều rộng/cao max
export const PHONE_MOTION_MAX_X      = 0.35;  // dịch chuyển ngang tối đa giữa 2 frame
export const PHONE_MOTION_MAX_Y      = 0.25;  // dịch chuyển dọc tối đa giữa 2 frame

// ── API DROWSY STREAK ──────────────────────────────────────────
export const API_STREAK_TRIGGER      = 5;     // số lần liên tiếp API trả drowsy/yawning → trigger
export const API_STREAK_MAX          = 20;    // giới hạn trên của counter streak

// ── ALERT INTERVAL ─────────────────────────────────────────────
export const ALERT_INTERVAL_MS       = 250;   // tần suất kiểm tra và sync UI state

// ── IDENTITY AUTH ─────────────────────────────────────────────
export const ID_AUTH_LOCK_INTRUDER_FRAMES = 3;
export const ID_AUTH_UNLOCK_FRAMES        = 2;
export const ID_AUTH_RETRY_INTERVAL_MS    = 1200;

// ── LABEL MAP ─────────────────────────────────────────────────
export const LABEL_MAP = {
  safe:    { vi: "NORMAL",    level: "good",    color: "#00f5a0" },
  drowsy:  { vi: "DROWSY",    level: "warning", color: "#ffc940" },
  yawning: { vi: "YAWNING",   level: "warning", color: "#ffc940" },
  angry:   { vi: "DISTRACTED",level: "risk",    color: "#ff4560" },
  stressed:{ vi: "STRESSED",  level: "risk",    color: "#ff6b6b" },
  unknown: { vi: "ANALYZING", level: "unknown", color: "#4a90d9" },
  no_face: { vi: "NO FACE",   level: "unknown", color: "#4a90d9" },
};

// ── STATUS ICONS ──────────────────────────────────────────────
export const STATUS_ICONS = [
  { id: "camera",    label: "Camera",   icon: "📷" },
  { id: "attentive", label: "Attentive",icon: "🧠" },
  { id: "awake",     label: "Awake",    icon: "👁"  },
  { id: "seatbelt",  label: "Seatbelt", icon: "🔒" },
  { id: "cabin",     label: "Cabin",    icon: "💡" },
  { id: "phone",     label: "Phone",    icon: "📱" },
  { id: "smoking",   label: "Smoking",  icon: "🚬" },
];
