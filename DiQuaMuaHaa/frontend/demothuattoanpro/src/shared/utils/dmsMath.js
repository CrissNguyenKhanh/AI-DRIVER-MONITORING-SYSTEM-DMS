import { L_EYE, R_EYE } from "../constants/dmsConstants";

/**
 * Tính khoảng cách giữa 2 điểm
 * @param {{x: number, y: number}} a - Điểm thứ nhất
 * @param {{x: number, y: number}} b - Điểm thứ hai
 * @returns {number} Khoảng cách Euclidean
 */
export function distPts(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Tính Eye Aspect Ratio (EAR) cho một mắt
 * @param {Array} lm - Landmarks từ MediaPipe (468 points)
 * @param {Object} eye - Cấu trúc mắt (L_EYE hoặc R_EYE từ constants)
 * @returns {number} EAR value (default 0.3 nếu không tính được)
 */
export function computeEAR(lm, eye) {
  const p1 = lm[eye.p1],
    p2 = lm[eye.p2],
    p3 = lm[eye.p3],
    p4 = lm[eye.p4],
    p5 = lm[eye.p5],
    p6 = lm[eye.p6];
  if (!p1 || !p4) return 0.3;
  return (distPts(p2, p6) + distPts(p3, p5)) / (2.0 * distPts(p1, p4) + 0.001);
}

/**
 * Tính bán kính đồng tử
 * @param {Array} lm - Landmarks từ MediaPipe
 * @param {Array} irisIdx - Mảng indices của iris (từ L_EYE.iris hoặc R_EYE.iris)
 * @returns {number} Bán kính đồng tử (trả về 0 nếu không tính được)
 */
export function computePupilRadius(lm, irisIdx) {
  if (!lm[irisIdx[0]]) return 0;
  const c = lm[irisIdx[0]];
  return (
    irisIdx
      .slice(1)
      .map((i) => distPts(c, lm[i]))
      .reduce((a, b) => a + b, 0) / 4
  );
}

/**
 * Ước tính head pose (yaw, pitch, roll) từ landmarks
 * @param {Array} lm - Landmarks từ MediaPipe (468 points)
 * @returns {{yaw: number, pitch: number, roll: number}} Head pose angles
 */
export function estimateHeadPose(lm) {
  if (!lm || lm.length < 468) return { yaw: 0, pitch: 0, roll: 0 };
  const nose = lm[1],
    chin = lm[152],
    lEye = lm[33],
    rEye = lm[263];
  const eyeMidX = (lEye.x + rEye.x) / 2;
  const eyeWidth = Math.abs(rEye.x - lEye.x);
  const yaw = ((nose.x - eyeMidX) / (eyeWidth + 0.001)) * 2.2;
  const eyeMidY = (lEye.y + rEye.y) / 2;
  const faceH = Math.abs(chin.y - eyeMidY) + 0.001;
  const pitch = ((nose.y - eyeMidY) / faceH - 0.42) * 2.5;
  const roll = Math.atan2(rEye.y - lEye.y, rEye.x - lEye.x);
  return { yaw: -yaw, pitch: -pitch, roll: -roll };
}
