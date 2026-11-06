export const SCENARIO_PRESENTATION = Object.freeze({
  S01: {
    label: "S01 — Lái xe bình thường",
    description: "Tài xế tỉnh táo, đường trống; xe ảo giữ làn.",
  },
  S02: {
    label: "S02 — Tài xế mất tập trung",
    description: "Chỉ cảnh báo; không tự đánh lái khi phía trước không có vật cản.",
  },
  S03: {
    label: "S03 — Mất tập trung + vật cản",
    description: "Phanh, kiểm tra làn trái, chuyển làn liên tục rồi phục hồi.",
  },
  S04: {
    label: "S04 — Buồn ngủ + vật cản",
    description: "Phanh, kiểm tra làn phải, chuyển làn liên tục rồi phục hồi.",
  },
  S05: {
    label: "S05 — Hai bên đều bị chặn",
    description: "Không có hành lang hợp lệ; xe ảo phanh và dừng.",
  },
  S06: {
    label: "S06 — Làn đích xuất hiện vật cản",
    description: "Đang né thì làn đích bị chiếm; engine hủy liên tục rồi phanh dừng trong fixture ảo.",
  },
  S07: {
    label: "S07 — Mất camera / UNKNOWN",
    description: "Perception không chắc chắn; không chuyển làn mù.",
  },
  S08: {
    label: "S08 — Tài xế phục hồi",
    description: "Cảnh báo hạ cấp nhưng maneuver ảo kết thúc nhất quán.",
  },
  S09: {
    label: "S09 — Nhiều vật cản",
    description: "Xe ảo tôn trọng nhiều làn bị chiếm và khoảng hở động.",
  },
  S10: {
    label: "S10 — Diễn tập phiên lái offline",
    description: "Timeline cục bộ; secure authentication/history chưa tích hợp vì PR B/C thiếu.",
  },
});

const DMS_FIXTURES = Object.freeze({
  NORMAL: { ear: 0.31, perclos: 0.07, headPose: "CENTER" },
  DROWSY: { ear: 0.16, perclos: 0.68, headPose: "CENTER" },
  DISTRACTED: { ear: 0.29, perclos: 0.12, headPose: "LOOKING AWAY" },
  HIGH_RISK: { ear: 0.14, perclos: 0.76, headPose: "DOWN / AWAY" },
  UNKNOWN: { ear: null, perclos: null, headPose: "UNKNOWN" },
});

export function syntheticDmsMetrics(attention) {
  return DMS_FIXTURES[attention] || DMS_FIXTURES.UNKNOWN;
}

export function laneAvailability(snapshot) {
  const laneCount = snapshot?.road?.laneCount || 0;
  return Array.from({ length: laneCount }, (_, lane) => {
    const clearance = evaluateLaneClearance(snapshot, lane);
    return {
      lane,
      available: clearance.clear,
    };
  });
}

export function eventText(event) {
  return String(event?.message || event?.label || event?.type || "Simulation event");
}

import { evaluateLaneClearance } from "./roadSimulation.js";
