const L_EYE = {
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
const R_EYE = {
  p1: 362,
  p2: 385,
  p3: 387,
  p4: 263,
  p5: 373,
  p6: 380,
  outer: 263,
  inner: 362,
  iris: [473, 474, 475, 476, 477],
};
const LEFT_EYE_IDX = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
const RIGHT_EYE_IDX = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384,
  398,
];
const FACE_OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
const LIPS_IDX = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
  181, 91, 146,
];

/** Nối 21 điểm — topology MediaPipe Hands */
const HAND_CONNECTIONS = [
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

function distPts(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function computeEAR(lm, eye) {
  const p1 = lm[eye.p1],
    p2 = lm[eye.p2],
    p3 = lm[eye.p3],
    p4 = lm[eye.p4],
    p5 = lm[eye.p5],
    p6 = lm[eye.p6];
  if (!p1 || !p4) return 0.3;
  return (distPts(p2, p6) + distPts(p3, p5)) / (2.0 * distPts(p1, p4) + 0.001);
}
function computePupilRadius(lm, irisIdx) {
  if (!lm[irisIdx[0]]) return 0;
  const c = lm[irisIdx[0]];
  return (
    irisIdx
      .slice(1)
      .map((i) => distPts(c, lm[i]))
      .reduce((a, b) => a + b, 0) / 4
  );
}
function estimateHeadPose(lm) {
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

export {
  L_EYE,
  R_EYE,
  LEFT_EYE_IDX,
  RIGHT_EYE_IDX,
  FACE_OVAL_IDX,
  LIPS_IDX,
  HAND_CONNECTIONS,
  distPts,
  computeEAR,
  computePupilRadius,
  estimateHeadPose,
};
