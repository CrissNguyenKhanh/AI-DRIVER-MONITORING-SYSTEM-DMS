import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { io } from "socket.io-client";
import OwnerVerifyGate from "../systeamdetectface/OwnerVerifyGate";
import TelegramOwnerRejectOverlay from "../systeamdetectface/TelegramOwnerRejectOverlay";
import DriverAuthenticatedWelcome from "../systeamdetectface/DriverAuthenticatedWelcome";
import { getDmsApiBase } from "../config/apiEndpoints";
import { getWebcamSupportErrorMessage } from "../utils/cameraContext";
import {
  speakOwnerGreeting,
  warmSpeechVoices,
} from "../utils/speakOwnerGreeting";
import {
  startDrivingSession,
  endDrivingSession,
  recordDrivingAlert,
  listDrivingSessions,
} from "../utils/drivingSessionApi";
import VoiceCarAssistant from "../voice/VoiceCarAssistant";
import FakeYouTubeLayout from "../voice/FakeYouTubeLayout";

const API_BASE = getDmsApiBase();
const API_INTERVAL_MS = 1000; // landmark + smoking vẫn 1s
const IDENTITY_BURST_FRAMES = 2;
const IDENTITY_BURST_GAP_MS = 110;
const DRIVER_ID_KEY = "driver_owner_id_v1";
const DEFAULT_DRIVER_ID = "driver_001";
const HISTORY_SIZE = 10;
const CONSISTENT_FRAMES = 4;
const MIN_PROB_FOR_LABEL = 0.6;
const EAR_BLINK_THRESH = 0.21;
const EAR_HISTORY = 90;
const EYES_CLOSED_WARN_MS = 3000;

// ── PHONE — WebSocket YOLO, ~15fps ──────────────────────────
const PHONE_WS_FPS = 15;
const PHONE_YOLO_MIN_PROB = 0.55;
const PHONE_HISTORY_LEN = 20;
const PHONE_WARN_MS = 3000;
const PHONE_STABLE_FRAMES = 4; // cần 4 lần liên tiếp mới bật cảnh báo
const PHONE_OFF_FRAMES = 6; // cần 6 lần liên tiếp mất cảnh báo mới tắt
// ── SMOKING — WebSocket landmark, ~4fps (không cần nhanh hơn) ──
const SMOKING_WS_FPS = 4;
const SMOKING_MIN_PROB = 0.82;
const SMOKING_HISTORY_LEN = 24;
const SMOKING_STABLE_FRAMES = 10; // cần 10 frames liên tiếp mới bật (~10s * 4fps = 40 frames... thực tế 10 api calls)
const SMOKING_OFF_FRAMES = 14;
const SMOKING_WARN_MS = 4000;
// ─────────────────────────────────────────────────────────────

// Tạm tắt smoking trong test để tập trung fix phone detection
const SMOKING_ENABLED = false;

// ── IDENTITY AUTH (vehicle UUID) ──────────────────────────────
const ID_AUTH_LOCK_INTRUDER_FRAMES = 3; // liên tiếp không chính chủ thì khóa về auth
const ID_AUTH_UNLOCK_FRAMES = 2; // liên tiếp chính chủ thì mở về active
const ID_AUTH_RETRY_INTERVAL_MS = 1200;

const LABEL_MAP = {
  safe: { vi: "NORMAL", level: "good", color: "#00f5a0" },
  drowsy: { vi: "DROWSY", level: "warning", color: "#ffc940" },
  yawning: { vi: "YAWNING", level: "warning", color: "#ffc940" },
  angry: { vi: "DISTRACTED", level: "risk", color: "#ff4560" },
  stressed: { vi: "STRESSED", level: "risk", color: "#ff6b6b" },
  unknown: { vi: "ANALYZING", level: "unknown", color: "#4a90d9" },
  no_face: { vi: "NO FACE", level: "unknown", color: "#4a90d9" },
};

const STATUS_ICONS = [
  { id: "camera", label: "Camera", icon: "📷" },
  { id: "attentive", label: "Attentive", icon: "🧠" },
  { id: "awake", label: "Awake", icon: "👁" },
  { id: "seatbelt", label: "Seatbelt", icon: "🔒" },
  { id: "cabin", label: "Cabin", icon: "💡" },
  { id: "phone", label: "Phone", icon: "📱" },
  { id: "smoking", label: "Smoking", icon: "🚬" },
];

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

// ─────────────────────────────────────────────────────────
// PhoneFOMOOverlay — đọc từ phoneDetectionRef, vẽ RAF 60fps
// ─────────────────────────────────────────────────────────
function PhoneFOMOOverlay({ phoneDetectionRef, landmarksRef, videoRef }) {
  const canvasRef = useRef(null);
  const smoothBoxRef = useRef(null);
  const pulseRef = useRef(0);

  // resize canvas theo video
  useEffect(() => {
    const canvas = canvasRef.current;
    const vid = videoRef.current;
    if (!canvas || !vid) return;
    const ro = new ResizeObserver(() => {
      canvas.width = vid.offsetWidth || 640;
      canvas.height = vid.offsetHeight || 480;
    });
    ro.observe(vid);
    canvas.width = vid.offsetWidth || 640;
    canvas.height = vid.offsetHeight || 480;
    return () => ro.disconnect();
  }, []);

  // RAF draw loop — luôn chạy 60fps, chỉ đọc ref
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function getFallbackBox(lm, W, H) {
      if (!lm || !lm.length) return null;
      const mx = (x) => W - x * W,
        my = (y) => y * H;
      const chin = lm[152],
        lEar = lm[234],
        rEar = lm[454];
      if (!chin) return null;
      const faceW = lEar && rEar ? Math.abs(mx(lEar.x) - mx(rEar.x)) : W * 0.25;
      const bw = faceW * 0.65,
        bh = bw * 0.55;
      return {
        x: mx(chin.x) - bw / 2,
        y: my(chin.y) + 8,
        w: bw,
        h: bh,
        fallback: true,
      };
    }

    function drawBrackets(ctx, x, y, w, h, color, size, lw) {
      const cs = Math.min(size, w * 0.25, h * 0.15);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ].forEach(([cx, cy, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * cs);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * cs, cy);
        ctx.stroke();
      });
    }

    function draw() {
      rafId = requestAnimationFrame(draw);
      const vid = videoRef.current;
      if (!vid || !canvas) return;
      const W = canvas.width,
        H = canvas.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);

      const det = phoneDetectionRef.current;
      if (!det || !det.active) {
        smoothBoxRef.current = null;
        return;
      }

      pulseRef.current = (pulseRef.current + 0.04) % (Math.PI * 2);
      const pulse = Math.sin(pulseRef.current);
      const now = Date.now();

      // target box từ YOLO bbox (đã flip x vì video mirror)
      let targetBox = null;
      if (det.bbox) {
        const { x1, y1, x2, y2 } = det.bbox;
        targetBox = {
          x: W - x2 * W,
          y: y1 * H,
          w: (x2 - x1) * W,
          h: (y2 - y1) * H,
          fallback: false,
        };
      }
      // Nếu YOLO chưa có bbox thì không vẽ fallback từ landmarks nữa
      // để tránh "lung tung" khi phone_detection bị mất tạm thời.
      if (!targetBox) return;

      // smooth LERP — nhanh hơn khi có bbox thực
      const LERP = 0.22;
      if (!smoothBoxRef.current) {
        smoothBoxRef.current = { ...targetBox };
      } else {
        smoothBoxRef.current.x = lerp(
          smoothBoxRef.current.x,
          targetBox.x,
          LERP,
        );
        smoothBoxRef.current.y = lerp(
          smoothBoxRef.current.y,
          targetBox.y,
          LERP,
        );
        smoothBoxRef.current.w = lerp(
          smoothBoxRef.current.w,
          targetBox.w,
          LERP,
        );
        smoothBoxRef.current.h = lerp(
          smoothBoxRef.current.h,
          targetBox.h,
          LERP,
        );
      }

      const { x, y, w, h } = smoothBoxRef.current;
      const prob = det.prob || 0.5;

      // outer glow pulse
      ctx.strokeStyle = `rgba(255,160,0,${0.07 + 0.05 * pulse})`;
      ctx.lineWidth = 6 + pulse * 2;
      ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);

      // dashed box
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = `rgba(255,160,0,0.55)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // fill
      ctx.fillStyle = `rgba(255,140,0,${0.04 + 0.02 * pulse})`;
      ctx.fillRect(x, y, w, h);

      // corner brackets
      const colorAlpha = `rgba(255,${Math.round(80 + (1 - prob) * 100)},30,0.9)`;
      drawBrackets(
        ctx,
        x,
        y,
        w,
        h,
        colorAlpha,
        Math.min(22, w * 0.25, h * 0.15),
        2.5,
      );
      const off = 5;
      if (w > off * 4 && h > off * 4)
        drawBrackets(
          ctx,
          x + off,
          y + off,
          w - off * 2,
          h - off * 2,
          `rgba(255,200,50,0.35)`,
          Math.min(12, w * 0.15),
          1,
        );

      // scan line
      const scanY = y + h * ((now % 1600) / 1600);
      const grad = ctx.createLinearGradient(x, scanY - 8, x, scanY + 8);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, "rgba(255,160,30,0.55)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(x, scanY - 8, w, 16);

      // prob bar
      const bW = w * 0.7,
        bH = 4,
        bX = x + (w - bW) / 2,
        bY = y + h + 6;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(bX, bY, bW, bH);
      ctx.fillStyle = "rgba(255,180,0,0.8)";
      ctx.fillRect(bX, bY, bW * prob, bH);

      // label tag
      const labelText = `PHONE ${(prob * 100).toFixed(0)}%`;
      ctx.font = "bold 11px monospace";
      const tw = ctx.measureText(labelText).width;
      const tagX = x,
        tagY = Math.max(4, y - 22);
      ctx.fillStyle = "rgba(255,140,0,0.92)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tagX, tagY, tw + 12, 18, 3);
      else ctx.rect(tagX, tagY, tw + 12, 18);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fillText(labelText, tagX + 6, tagY + 13);

      // confidence ring
      const rR = 15,
        rCX = x + w - rR - 4,
        rCY = y + rR + 4;
      ctx.beginPath();
      ctx.arc(rCX, rCY, rR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        rCX,
        rCY,
        rR - 4,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * prob,
      );
      ctx.strokeStyle = "rgba(255,180,30,0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = "rgba(255,180,30,0.9)";
      ctx.textAlign = "center";
      ctx.fillText((prob * 100).toFixed(0) + "%", rCX, rCY + 3);
      ctx.textAlign = "left";

      // crosshair
      const cx2 = x + w / 2,
        cy2 = y + h / 2;
      ctx.strokeStyle = `rgba(255,160,0,${0.4 + 0.2 * pulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx2 - 8, cy2);
      ctx.lineTo(cx2 + 8, cy2);
      ctx.moveTo(cx2, cy2 - 8);
      ctx.lineTo(cx2, cy2 + 8);
      ctx.stroke();
    }

    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 7,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// SmokingFOMOOverlay
// ─────────────────────────────────────────────────────────
function SmokingFOMOOverlay({ smokingDetectionRef, landmarksRef, videoRef }) {
  const canvasRef = useRef(null);
  const smoothBoxRef = useRef(null);
  const pulseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const vid = videoRef.current;
    if (!canvas || !vid) return;
    const ro = new ResizeObserver(() => {
      canvas.width = vid.offsetWidth || 640;
      canvas.height = vid.offsetHeight || 480;
    });
    ro.observe(vid);
    canvas.width = vid.offsetWidth || 640;
    canvas.height = vid.offsetHeight || 480;
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function mouthBox(lm, W, H) {
      if (!lm || !lm.length) return null;
      const mx = (x) => W - x * W,
        my = (y) => y * H;
      const pts = [0, 11, 12, 13, 14, 15, 16, 17, 18]
        .map((i) => lm[i])
        .filter(Boolean);
      if (!pts.length) return null;
      const mX = pts.reduce((s, p) => s + mx(p.x), 0) / pts.length;
      const mY = pts.reduce((s, p) => s + my(p.y), 0) / pts.length;
      const faceXs = lm.slice(0, 100).map((p) => mx(p.x));
      const faceW = Math.max(...faceXs) - Math.min(...faceXs);
      const bw = faceW * 0.7,
        bh = bw * 0.22;
      return {
        x: mX - bw * 0.2,
        y: mY - bh / 2,
        w: bw,
        h: bh,
        estimated: true,
      };
    }

    function draw() {
      rafId = requestAnimationFrame(draw);
      const vid = videoRef.current;
      if (!vid || !canvas) return;
      const W = canvas.width,
        H = canvas.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const det = smokingDetectionRef.current;
      if (!det || !det.active) {
        smoothBoxRef.current = null;
        return;
      }
      pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2);
      const pulse = Math.sin(pulseRef.current);
      let tb = null;
      if (det.bbox && det.bbox.x1 != null) {
        const { x1, y1, x2, y2 } = det.bbox;
        tb = {
          x: W - x2 * W,
          y: y1 * H,
          w: (x2 - x1) * W,
          h: (y2 - y1) * H,
          estimated: false,
        };
      }
      if (!tb) tb = mouthBox(landmarksRef.current, W, H);
      if (!tb) return;
      const LR = tb.estimated ? 0.05 : 0.2;
      if (!smoothBoxRef.current) {
        smoothBoxRef.current = { ...tb };
      } else {
        smoothBoxRef.current.x = lerp(smoothBoxRef.current.x, tb.x, LR);
        smoothBoxRef.current.y = lerp(smoothBoxRef.current.y, tb.y, LR);
        smoothBoxRef.current.w = lerp(smoothBoxRef.current.w, tb.w, LR);
        smoothBoxRef.current.h = lerp(smoothBoxRef.current.h, tb.h, LR);
      }
      const { x, y, w, h } = smoothBoxRef.current;
      const prob = det.prob || 0.5;
      ctx.strokeStyle = `rgba(255,80,40,${0.1 + 0.05 * pulse})`;
      ctx.lineWidth = 5 + pulse;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(255,80,40,0.55)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,60,20,${0.04 + 0.02 * pulse})`;
      ctx.fillRect(x, y, w, h);
      const cs = Math.min(14, w * 0.2, h * 0.3);
      ctx.strokeStyle = "rgba(255,80,40,0.9)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ].forEach(([cx, cy, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * cs);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * cs, cy);
        ctx.stroke();
      });
      const st = (Date.now() % 2000) / 2000;
      for (let i = 0; i < 4; i++) {
        const t = (st + i * 0.25) % 1;
        ctx.beginPath();
        ctx.arc(
          x + w * 0.6 + Math.sin(t * Math.PI * 4) * 6,
          y - t * 30,
          2 + t * 3,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(200,200,200,${0.5 * (1 - t)})`;
        ctx.fill();
      }
      const lt = `SMOKING ${(prob * 100).toFixed(0)}%`;
      ctx.font = "bold 11px monospace";
      const tw = ctx.measureText(lt).width;
      ctx.fillStyle = "rgba(255,60,20,0.9)";
      if (ctx.roundRect) ctx.roundRect(x, y - 22, tw + 12, 18, 3);
      else ctx.rect(x, y - 22, tw + 12, 18);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(lt, x + 6, y - 9);
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 8,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// FaceMeshOverlay
// ─────────────────────────────────────────────────────────
function FaceMeshOverlay({ landmarksRef, eyeDataRef, videoRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const vid = videoRef.current;
    if (!canvas || !vid) return;
    const ro = new ResizeObserver(() => {
      canvas.width = vid.offsetWidth || 640;
      canvas.height = vid.offsetHeight || 480;
    });
    ro.observe(vid);
    canvas.width = vid.offsetWidth || 640;
    canvas.height = vid.offsetHeight || 480;
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function drawEye(ctx, lm, irisIdx, eyeIdxList, ear, W, H) {
      const mx = (x) => W - x * W,
        my = (y) => y * H;
      ctx.beginPath();
      eyeIdxList.forEach((idx, i) => {
        const p = lm[idx];
        if (!p) return;
        i === 0 ? ctx.moveTo(mx(p.x), my(p.y)) : ctx.lineTo(mx(p.x), my(p.y));
      });
      ctx.closePath();
      const blink = ear < EAR_BLINK_THRESH;
      ctx.strokeStyle = blink ? "rgba(255,200,60,0.9)" : "rgba(0,200,255,0.75)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = blink ? "rgba(255,200,60,0.06)" : "rgba(0,200,255,0.04)";
      ctx.fill();
      const iris = lm[irisIdx[0]];
      if (!iris) return;
      const ix = mx(iris.x),
        iy = my(iris.y);
      const ie = lm[irisIdx[1]];
      const iR = ie
        ? Math.sqrt((mx(ie.x) - ix) ** 2 + (my(ie.y) - iy) ** 2) * 1.1
        : W * 0.018;
      ctx.beginPath();
      ctx.arc(ix, iy, iR * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = blink ? "rgba(255,200,60,0.3)" : "rgba(0,180,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ix, iy, iR, 0, Math.PI * 2);
      ctx.strokeStyle = blink ? "rgba(255,200,60,0.9)" : "rgba(0,200,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = blink ? "rgba(255,200,60,0.12)" : "rgba(0,150,255,0.1)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ix, iy, iR * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(ix + Math.cos(a) * iR * 0.42, iy + Math.sin(a) * iR * 0.42);
        ctx.lineTo(ix + Math.cos(a) * iR * 0.92, iy + Math.sin(a) * iR * 0.92);
        ctx.strokeStyle = blink
          ? "rgba(255,200,60,0.25)"
          : "rgba(0,180,255,0.22)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ix - iR * 0.22, iy - iR * 0.28, iR * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
      ctx.font = "9px monospace";
      ctx.fillStyle = blink ? "#ffc940" : "rgba(0,200,255,0.7)";
      ctx.fillText(`EAR ${ear.toFixed(2)}`, ix - 14, iy - iR * 1.9);
    }
    function draw() {
      rafId = requestAnimationFrame(draw);
      const vid = videoRef.current;
      if (!vid || !canvas) return;
      const W = canvas.width,
        H = canvas.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const lm = landmarksRef.current;
      if (!lm || !lm.length) return;
      const mx = (x) => W - x * W,
        my = (y) => y * H;
      ctx.beginPath();
      FACE_OVAL_IDX.forEach((idx, i) => {
        const p = lm[idx];
        if (!p) return;
        i === 0 ? ctx.moveTo(mx(p.x), my(p.y)) : ctx.lineTo(mx(p.x), my(p.y));
      });
      ctx.closePath();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(0,200,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      LIPS_IDX.forEach((idx, i) => {
        const p = lm[idx];
        if (!p) return;
        i === 0 ? ctx.moveTo(mx(p.x), my(p.y)) : ctx.lineTo(mx(p.x), my(p.y));
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(100,180,255,0.35)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      for (let i = 0; i < lm.length; i += 4) {
        const p = lm[i];
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(mx(p.x), my(p.y), 1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,200,255,0.45)";
        ctx.fill();
      }
      const ed = eyeDataRef.current;
      drawEye(ctx, lm, L_EYE.iris, LEFT_EYE_IDX, ed.left.ear || 0.3, W, H);
      drawEye(ctx, lm, R_EYE.iris, RIGHT_EYE_IDX, ed.right.ear || 0.3, W, H);
      const nT = lm[6],
        nB = lm[4];
      if (nT && nB) {
        ctx.beginPath();
        ctx.moveTo(mx(nT.x), my(nT.y));
        ctx.lineTo(mx(nB.x), my(nB.y));
        ctx.strokeStyle = "rgba(0,200,255,0.3)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      const xs = lm.map((p) => mx(p.x)).filter(Boolean),
        ys = lm.map((p) => my(p.y)).filter(Boolean);
      if (xs.length && ys.length) {
        const bx1 = Math.min(...xs),
          bx2 = Math.max(...xs),
          by1 = Math.min(...ys),
          by2 = Math.max(...ys);
        const pad = 10,
          bx = bx1 - pad,
          by = by1 - pad,
          bw = bx2 - bx1 + pad * 2,
          bh = by2 - by1 + pad * 2,
          cs = 18;
        [
          [bx, by, 1, 1],
          [bx + bw, by, -1, 1],
          [bx, by + bh, 1, -1],
          [bx + bw, by + bh, -1, -1],
        ].forEach(([cx2, cy2, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(cx2, cy2 + dy * cs);
          ctx.lineTo(cx2, cy2);
          ctx.lineTo(cx2 + dx * cs, cy2);
          ctx.strokeStyle = "rgba(204,204,0,0.9)";
          ctx.lineWidth = 2;
          ctx.stroke();
        });
        ctx.font = "bold 13px monospace";
        ctx.fillStyle = "rgba(204,204,0,0.9)";
        ctx.fillText(((bx1 / W) * 100).toFixed(1), bx - 2, by - 6);
        ctx.fillText(((bx2 / W) * 100).toFixed(1), bx + bw - 24, by - 6);
      }
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}

function EyeCanvas({ eyeDataRef, side }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function draw() {
      rafId = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      const W = canvas.width,
        H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const d = eyeDataRef.current[side] || {
        ear: 0.3,
        yaw: 0,
        pitch: 0,
        blinking: false,
      };
      const oR = Math.max(0.05, Math.min(1, (d.ear - 0.1) / 0.25));
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2,
        cy = H / 2,
        ew = W * 0.72,
        eh = H * 0.62 * oR;
      ctx.beginPath();
      ctx.moveTo(cx - ew / 2, cy);
      ctx.bezierCurveTo(
        cx - ew / 4,
        cy - eh * 1.3,
        cx + ew / 4,
        cy - eh * 1.3,
        cx + ew / 2,
        cy,
      );
      ctx.bezierCurveTo(
        cx + ew / 4,
        cy + eh * 1.3,
        cx - ew / 4,
        cy + eh * 1.3,
        cx - ew / 2,
        cy,
      );
      ctx.fillStyle = "#0a1a2e";
      ctx.fill();
      ctx.strokeStyle = "#2060a0";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (oR > 0.15) {
        const gx = cx + (d.yaw || 0) * 10,
          gy = cy + (d.pitch || 0) * 6;
        const iR = Math.min(ew, H) * 0.26 * Math.min(1, oR * 1.4);
        const ig = ctx.createRadialGradient(gx, gy, 0, gx, gy, iR);
        ig.addColorStop(0, "rgba(30,120,255,0.3)");
        ig.addColorStop(0.6, "rgba(20,80,200,0.7)");
        ig.addColorStop(1, "rgba(10,40,140,0.95)");
        ctx.beginPath();
        ctx.arc(gx, gy, iR, 0, Math.PI * 2);
        ctx.fillStyle = ig;
        ctx.fill();
        ctx.strokeStyle = "#1e90ff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(gx + Math.cos(a) * iR * 0.3, gy + Math.sin(a) * iR * 0.3);
          ctx.lineTo(
            gx + Math.cos(a) * iR * 0.92,
            gy + Math.sin(a) * iR * 0.92,
          );
          ctx.strokeStyle = "rgba(30,144,255,0.22)";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(gx, gy, iR * (0.32 + (1 - oR) * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = "#000810";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx - iR * 0.18, gy - iR * 0.22, iR * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - ew / 2 + 6, cy);
        ctx.lineTo(cx + ew / 2 - 6, cy);
        ctx.strokeStyle = "#1e90ff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (d.blinking) {
        ctx.fillStyle = "#ffc940";
        ctx.font = "bold 8px monospace";
        ctx.fillText("BLINK", W - 34, H - 3);
      }
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, [side]);
  return React.createElement("canvas", {
    ref: canvasRef,
    width: 200,
    height: 100,
    style: { width: "100%", height: "100%", display: "block" },
  });
}

function WaveformCanvas({ earHistoryRef, side, color = "#1e90ff" }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function draw() {
      rafId = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      const W = canvas.width,
        H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const hist = earHistoryRef.current[side] || [];
      if (hist.length < 2) return;
      const bW = Math.max(1, (W / EAR_HISTORY) * 0.8);
      for (let i = 0; i < hist.length; i++) {
        const v = hist[i],
          x = (i / (EAR_HISTORY - 1)) * (W - 4) + 2;
        const bH = Math.min(H - 2, Math.max(2, (v / 0.5) * H));
        ctx.fillStyle = color;
        ctx.fillRect(x - bW / 2, H - bH, bW, bH);
      }
      const ty = H - (EAR_BLINK_THRESH / 0.5) * H;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(0, ty);
      ctx.lineTo(W, ty);
      ctx.strokeStyle = "rgba(255,200,60,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, [side, color]);
  return React.createElement("canvas", {
    ref: canvasRef,
    width: 280,
    height: 50,
    style: { width: "100%", height: "100%", display: "block" },
  });
}

function Head3D({ poseRef }) {
  const mountRef = useRef(null);
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || 280,
      H = el.clientHeight || 260;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(0, 0.1, 3.4);
    camera.lookAt(0, 0.1, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaabbcc, 0.4);
    fill.position.set(-2, 1, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8899bb, 0.25);
    rim.position.set(0, -2, -3);
    scene.add(rim);
    const headGroup = new THREE.Group();
    scene.add(headGroup);
    const hMat = new THREE.MeshPhongMaterial({
      color: 0xb8bcc4,
      shininess: 30,
      specular: new THREE.Color(0x444444),
    });
    function addS(geo, pos, sc) {
      const g = geo.clone();
      if (sc)
        g.applyMatrix4(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]));
      const m = new THREE.Mesh(g, hMat);
      m.position.set(...pos);
      headGroup.add(m);
    }
    addS(
      new THREE.SphereGeometry(0.66, 48, 32),
      [0, 0.12, 0],
      [1.0, 1.18, 0.88],
    );
    addS(
      new THREE.SphereGeometry(0.48, 32, 24),
      [0, -0.32, 0.05],
      [0.86, 0.74, 0.78],
    );
    addS(
      new THREE.SphereGeometry(0.11, 14, 10),
      [0, -0.02, 0.56],
      [0.78, 0.66, 1.1],
    );
    addS(
      new THREE.SphereGeometry(0.09, 12, 10),
      [-0.68, 0.04, 0],
      [0.5, 0.85, 0.36],
    );
    addS(
      new THREE.SphereGeometry(0.09, 12, 10),
      [0.68, 0.04, 0],
      [0.5, 0.85, 0.36],
    );
    const sMat = new THREE.MeshPhongMaterial({
      color: 0x8a8e96,
      shininess: 20,
    });
    [
      [-0.22, 0.14, 0.5],
      [0.22, 0.14, 0.5],
    ].forEach((p) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), sMat);
      s.position.set(...p);
      headGroup.add(s);
    });
    const lMat = new THREE.MeshPhongMaterial({
      color: 0xd0d4da,
      shininess: 15,
    });
    [
      [-0.22, 0.14, 0.52],
      [0.22, 0.14, 0.52],
    ].forEach((p) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8), lMat);
      l.position.set(...p);
      l.scale.set(1, 0.38, 0.7);
      headGroup.add(l);
    });
    const mMat = new THREE.MeshPhongMaterial({
      color: 0x9a9ea6,
      shininess: 10,
    });
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mMat);
    mouth.position.set(0, -0.21, 0.49);
    mouth.scale.set(2, 0.5, 0.8);
    headGroup.add(mouth);
    let cY = 0,
      cP = 0,
      cR = 0,
      rafId2;
    function animate() {
      rafId2 = requestAnimationFrame(animate);
      const p = poseRef.current;
      cY += ((p.yaw || 0) - cY) * 0.12;
      cP += ((p.pitch || 0) - cP) * 0.12;
      cR += ((p.roll || 0) - cR) * 0.12;
      headGroup.rotation.order = "YXZ";
      headGroup.rotation.y = cY;
      headGroup.rotation.x = cP;
      headGroup.rotation.z = cR;
      renderer.render(scene, camera);
    }
    animate();
    const ro = new ResizeObserver(() => {
      const nW = el.clientWidth,
        nH = el.clientHeight;
      renderer.setSize(nW, nH);
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId2);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);
  return React.createElement("div", {
    ref: mountRef,
    style: { width: "100%", height: "100%" },
  });
}

// ═════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════
export default function DriverMonitorDMS() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceMeshRef = useRef(null);
  const poseRef = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const landmarksRef = useRef([]);
  const eyeDataRef = useRef({
    left: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
    right: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
  });
  const earHistoryRef = useRef({ left: [], right: [] });
  const blinkStateRef = useRef({ left: false, right: false });
  const blinkTimesRef = useRef([]);
  const blinkDurRef = useRef({ start: null, dur: 0 });
  const eyesClosedSinceRef = useRef(null);
  const eyesClosedSecRef = useRef(0);
  const audioCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const vibrateIntervalRef = useRef(null);

  const phoneDetectionRef = useRef({ active: false, prob: 0, bbox: null });
  const phoneActiveFilteredRef = useRef(false);
  const phoneOnStreakRef = useRef(0);
  const phoneOffStreakRef = useRef(0);
  const phoneLastBoxRef = useRef(null);
  const smokingDetectionRef = useRef({ active: false, prob: 0, bbox: null });

  // Smoking hysteresis — tránh nhấp nháy
  const smokingActiveRef = useRef(false); // trạng thái hiện tại (đã qua filter)
  const smokingSinceRef = useRef(null); // timestamp bắt đầu hút liên tục
  const smokingSecRef = useRef(0);

  // Phone continuous alert
  const phoneSinceRef = useRef(null);
  const phoneSecRef = useRef(0);

  // WebSocket refs — phone
  const socketRef = useRef(null);
  const wsReadyRef = useRef(false);
  const wsPendingRef = useRef(false);
  const wsLastSentRef = useRef(0);
  // WebSocket refs — smoking (dùng chung socket, event riêng)
  const wsSmokePendingRef = useRef(false);
  const wsSmokLastSentRef = useRef(0);

  const drivingSessionIdRef = useRef(null);
  const prevPhoneAlertRef = useRef(null);
  const prevSmokingAlertRef = useRef(null);
  const prevDrowsyAlertRef = useRef(null);

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [apiResult, setApiResult] = useState(null);
  const apiLabelRef = useRef("unknown");
  const apiLabelStreakRef = useRef(0);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(false);
  const [smokingResult, setSmokingResult] = useState(null);
  const [smokingError, setSmokingError] = useState("");
  const [smokingHistory, setSmokingHistory] = useState([]);
  const [phoneError, setPhoneError] = useState("");
  const [phoneHistory, setPhoneHistory] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [history, setHistory] = useState([]);
  const [time, setTime] = useState(new Date());
  const [frameCount, setFrameCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [displayPose, setDisplayPose] = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [displayEye, setDisplayEye] = useState({
    blinkRate: 0,
    blinkDur: 0,
    pupilL: "33.5",
    lYaw: "-11.8",
    lPitch: "-21.6",
    rYaw: "-19.9",
    rPitch: "-25.1",
    lX: "61.4",
    lY: "3.9",
    lZ: "-2.7",
    rX: "63.2",
    rY: "9.7",
    rZ: "-3.3",
  });
  const [drowsyAlert, setDrowsyAlert] = useState(null);
  const [phoneActive, setPhoneActive] = useState(false);
  const [phoneAlert, setPhoneAlert] = useState(null);
  const [smokingActive, setSmokingActive] = useState(false); // state để trigger re-render icon
  const [smokingAlert, setSmokingAlert] = useState(null);
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID);
  const [identityOwner, setIdentityOwner] = useState(null);
  const [identityHasRegistered, setIdentityHasRegistered] = useState(false);
  const [identitySimilarity, setIdentitySimilarity] = useState(null);
  const [identityThreshold, setIdentityThreshold] = useState(0.975);
  const [identityError, setIdentityError] = useState("");
  const [identitySamples, setIdentitySamples] = useState(0);
  /** Khi locked: phân biệt màn hình Telegram Reject vs các lý do khác */
  const [identityLockCause, setIdentityLockCause] = useState(
    /** @type {"owner_reject" | "owner_timeout" | "generic" | null} */ (null),
  );
  const [identityRejectLockedAt, setIdentityRejectLockedAt] = useState("");
  /** Hồ sơ hiển thị popup chào mừng sau khi auth xong (~5s) */
  const [authWelcomeProfile, setAuthWelcomeProfile] = useState(null);
  /** Đèn cabin / điều hòa — điều khiển bằng giọng (Hey Car) */
  const [cabinLightsOn, setCabinLightsOn] = useState(false);
  const [cabinAcOn, setCabinAcOn] = useState(false);
  const [youtubeMockOpen, setYoutubeMockOpen] = useState(false);
  const [drivingSessionId, setDrivingSessionId] = useState(null);
  const [drivingSessionStartedAt, setDrivingSessionStartedAt] = useState(null);
  const [sessionAlertCounts, setSessionAlertCounts] = useState({
    phone: 0,
    smoking: 0,
    drowsy: 0,
  });
  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [sessionLogLoading, setSessionLogLoading] = useState(false);
  const [sessionLogItems, setSessionLogItems] = useState([]);

  const dismissAuthWelcome = useCallback(() => setAuthWelcomeProfile(null), []);

  /** Phiên lái: bắt đầu khi active, kết thúc khi rời active (locked / idle / …). */
  useEffect(() => {
    if (status !== "active") {
      const sid = drivingSessionIdRef.current;
      drivingSessionIdRef.current = null;
      setDrivingSessionId(null);
      setDrivingSessionStartedAt(null);
      prevPhoneAlertRef.current = null;
      prevSmokingAlertRef.current = null;
      prevDrowsyAlertRef.current = null;
      setSessionAlertCounts({ phone: 0, smoking: 0, drowsy: 0 });
      if (sid) {
        endDrivingSession(API_BASE, sid).catch(() => {});
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await startDrivingSession(API_BASE, { driverId });
      if (cancelled) {
        if (ok && data?.session_id) {
          await endDrivingSession(API_BASE, data.session_id).catch(() => {});
        }
        return;
      }
      if (ok && data?.session_id) {
        drivingSessionIdRef.current = data.session_id;
        setDrivingSessionId(data.session_id);
        setDrivingSessionStartedAt(data.started_at || "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, driverId]);

  /** Khi vừa có session_id, một lần: baseline cảnh báo hiện tại (không tính sự kiện đang bật sẵn là “lần mới”). */
  useEffect(() => {
    if (!drivingSessionId || status !== "active") return;
    prevPhoneAlertRef.current = phoneAlert;
    prevSmokingAlertRef.current = smokingAlert;
    prevDrowsyAlertRef.current = drowsyAlert;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khi gán session mới
  }, [drivingSessionId, status]);

  /** Mỗi lần cảnh báo chuyển tắt → bật: ghi nhận một lần theo loại. */
  useEffect(() => {
    const sid = drivingSessionIdRef.current;
    if (!sid || status !== "active") return;

    if (phoneAlert !== null && prevPhoneAlertRef.current === null) {
      recordDrivingAlert(API_BASE, sid, "phone").then((r) => {
        if (r.ok)
          setSessionAlertCounts((c) => ({ ...c, phone: c.phone + 1 }));
      });
    }
    prevPhoneAlertRef.current = phoneAlert;

    if (smokingAlert !== null && prevSmokingAlertRef.current === null) {
      recordDrivingAlert(API_BASE, sid, "smoking").then((r) => {
        if (r.ok)
          setSessionAlertCounts((c) => ({ ...c, smoking: c.smoking + 1 }));
      });
    }
    prevSmokingAlertRef.current = smokingAlert;

    if (drowsyAlert !== null && prevDrowsyAlertRef.current === null) {
      recordDrivingAlert(API_BASE, sid, "drowsy").then((r) => {
        if (r.ok)
          setSessionAlertCounts((c) => ({ ...c, drowsy: c.drowsy + 1 }));
      });
    }
    prevDrowsyAlertRef.current = drowsyAlert;
  }, [phoneAlert, smokingAlert, drowsyAlert, status]);

  const refreshSessionLog = useCallback(async () => {
    setSessionLogLoading(true);
    try {
      const { ok, data } = await listDrivingSessions(API_BASE, {
        limit: 25,
        driverId,
      });
      if (ok && data?.sessions) setSessionLogItems(data.sessions);
    } catch (_) {
      setSessionLogItems([]);
    } finally {
      setSessionLogLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    if (sessionLogOpen) refreshSessionLog();
  }, [sessionLogOpen, refreshSessionLog]);

  // ── Audio helpers ──
  function getAudioCtx() {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (
        window.AudioContext || window.webkitAudioContext
      )();
    return audioCtxRef.current;
  }
  function playBeep(freq, dur, vol) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator(),
        g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  }
  function startAlarm() {
    stopAlarm();
    playBeep(880, 0.18, 0.7);
    setTimeout(() => playBeep(660, 0.18, 0.7), 200);
    alarmIntervalRef.current = setInterval(() => {
      playBeep(880, 0.18, 0.7);
      setTimeout(() => playBeep(660, 0.18, 0.7), 200);
    }, 900);
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
      vibrateIntervalRef.current = setInterval(
        () => navigator.vibrate([300, 150, 300, 150, 300]),
        1500,
      );
    }
  }
  function stopAlarm() {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  }

  // ── Owner identity gate callbacks (tách riêng khỏi thucmuctest) ──
  const handleIdentityUnlock = useCallback(
    async (detail) => {
      setIdentityError("");
      setIdentityLockCause(null);
      setIdentityRejectLockedAt("");
      setStatus((prev) => (prev === "active" ? prev : "active"));

      const id =
        (detail && (detail.driver_id || detail.driverId)) || driverId;

      let merged = {
        driver_id: id,
        registered_name:
          (detail && (detail.registered_name || detail.name)) || "",
        profile_image_base64: detail && detail.profile_image_base64,
        registered_at: detail && detail.registered_at,
        similarity:
          detail && typeof detail.similarity === "number"
            ? detail.similarity
            : null,
        threshold:
          detail && typeof detail.threshold === "number"
            ? detail.threshold
            : null,
        samples_used: detail && detail.samples_used,
        source: (detail && detail.source) || "face",
      };

      if (!merged.profile_image_base64 && id) {
        try {
          const r = await fetch(
            `${API_BASE}/api/identity/driver_profile?driver_id=${encodeURIComponent(id)}`,
          );
          const d = await r.json();
          if (r.ok && d.driver_id) {
            merged = {
              ...merged,
              registered_name:
                merged.registered_name || d.registered_name || id,
              profile_image_base64:
                merged.profile_image_base64 || d.profile_image_base64,
              registered_at: merged.registered_at || d.registered_at,
            };
          }
        } catch (_) {
          /* ignore */
        }
      }

      if (!merged.registered_name) merged.registered_name = id;

      setAuthWelcomeProfile(merged);
      speakOwnerGreeting(merged.registered_name);
    },
    [driverId],
  );

  const handleIdentityLock = useCallback((reason) => {
    stopAlarm();
    setDrowsyAlert(null);
    setPhoneAlert(null);
    setSmokingAlert(null);
    const msg = String(reason || "ENGINE OFF: NOT OWNER");
    setIdentityError(msg);
    if (/reject/i.test(msg)) {
      setIdentityLockCause("owner_reject");
      setIdentityRejectLockedAt(new Date().toLocaleString("vi-VN"));
    } else {
      setIdentityRejectLockedAt("");
      if (msg.includes("NO RESPONSE") || /expired/i.test(msg))
        setIdentityLockCause("owner_timeout");
      else setIdentityLockCause("generic");
    }
    setStatus("locked");
  }, []);

  const handleUpdateIdentity = useCallback((payload) => {
    const hasRegistered = Boolean(payload?.hasRegistered);
    const isOwner = Boolean(payload?.isOwner);

    setIdentityHasRegistered(hasRegistered);
    setIdentityOwner(hasRegistered ? isOwner : null);
    setIdentitySimilarity(
      typeof payload?.similarity === "number" ? payload.similarity : null,
    );
    if (typeof payload?.threshold === "number") {
      setIdentityThreshold(payload.threshold);
    }
    setIdentitySamples(typeof payload?.samplesUsed === "number" ? payload.samplesUsed : 0);
    setIdentityError(payload?.error || "");
  }, []);

  // clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    warmSpeechVoices();
  }, []);

  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(DRIVER_ID_KEY);
      if (savedId) setDriverId(savedId);
    } catch (_) {}
  }, []);

  // ── WebSocket setup ──────────────────────────────────────
  useEffect(() => {
    const sock = io(API_BASE, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = sock;

    sock.on("connect", () => {
      wsReadyRef.current = true;
      setWsConnected(true);
      setPhoneError("");
    });
    sock.on("disconnect", () => {
      wsReadyRef.current = false;
      wsPendingRef.current = false;
      setWsConnected(false);
    });
    sock.on("connect_error", () => {
      wsReadyRef.current = false;
      setPhoneError("WebSocket unreachable");
    });

    // ← kết quả smoking từ server
    sock.on("smoking_result", (data) => {
      if (!SMOKING_ENABLED) return;
      wsSmokePendingRef.current = false;
      const lbl = data?.label ? String(data.label) : "";
      const prob = typeof data?.prob === "number" ? data.prob : 0;

      setSmokingHistory((prev) => {
        const n = prev.concat([{ label: lbl, prob }]);
        const trimmed =
          n.length > SMOKING_HISTORY_LEN
            ? n.slice(n.length - SMOKING_HISTORY_LEN)
            : n;

        const recentOn = trimmed.slice(-SMOKING_STABLE_FRAMES);
        const recentOff = trimmed.slice(-SMOKING_OFF_FRAMES);
        const shouldTurnOn =
          recentOn.length === SMOKING_STABLE_FRAMES &&
          recentOn.every(
            (h) => h.label === "smoking" && h.prob >= SMOKING_MIN_PROB,
          );
        const shouldTurnOff =
          recentOff.length === SMOKING_OFF_FRAMES &&
          recentOff.every(
            (h) => h.label !== "smoking" || h.prob < SMOKING_MIN_PROB,
          );

        if (shouldTurnOn) {
          smokingActiveRef.current = true;
          setSmokingActive(true);
        }
        if (shouldTurnOff) {
          smokingActiveRef.current = false;
          setSmokingActive(false);
        }

        smokingDetectionRef.current = {
          active: smokingActiveRef.current,
          prob,
          bbox: null,
        };
        return trimmed;
      });
    });

    // ← kết quả YOLO từ server
    sock.on("phone_result", (data) => {
      wsPendingRef.current = false; // sẵn sàng nhận frame tiếp

      const boxesArr = Array.isArray(data?.boxes) ? data.boxes : [];
      const bestBox =
        boxesArr
          .filter((b) => b && (b.prob || 0) >= PHONE_YOLO_MIN_PROB)
          .sort((a, b) => (b.prob || 0) - (a.prob || 0))[0] || null;

      let yoloBox = null;
      if (bestBox) {
        const { x: cx, y: cy, w: bw, h: bh } = bestBox;
        yoloBox = {
          x1: Math.max(0, cx - bw / 2),
          y1: Math.max(0, cy - bh / 2),
          x2: Math.min(1, cx + bw / 2),
          y2: Math.min(1, cy + bh / 2),
        };
      }

      const rawProb = bestBox?.prob || 0;
      // Phone bbox sanity check to reduce "lung tung" false positives
      const candW = yoloBox ? yoloBox.x2 - yoloBox.x1 : 0;
      const candH = yoloBox ? yoloBox.y2 - yoloBox.y1 : 0;
      const sizeOk = yoloBox && candW >= 0.05 && candH >= 0.05 && candW <= 0.55 && candH <= 0.55;

      // If bbox jumps too far from previous, treat it as unstable
      let motionOk = true;
      if (phoneLastBoxRef.current && yoloBox) {
        const lastCx = (phoneLastBoxRef.current.x1 + phoneLastBoxRef.current.x2) / 2;
        const lastCy = (phoneLastBoxRef.current.y1 + phoneLastBoxRef.current.y2) / 2;
        const candCx = (yoloBox.x1 + yoloBox.x2) / 2;
        const candCy = (yoloBox.y1 + yoloBox.y2) / 2;
        const dx = Math.abs(candCx - lastCx);
        const dy = Math.abs(candCy - lastCy);
        // normalized threshold
        if (dx > 0.35 || dy > 0.25) motionOk = false;
      }

      const strongDetected =
        bestBox !== null &&
        rawProb >= PHONE_YOLO_MIN_PROB &&
        sizeOk &&
        motionOk;

      if (strongDetected && yoloBox) {
        phoneLastBoxRef.current = yoloBox;
      }

      // Hysteresis filter: giảm nhấp nháy trạng thái phone
      if (strongDetected) {
        phoneOnStreakRef.current += 1;
        phoneOffStreakRef.current = 0;
      } else {
        phoneOffStreakRef.current += 1;
        phoneOnStreakRef.current = 0;
      }

      if (!phoneActiveFilteredRef.current) {
        if (phoneOnStreakRef.current >= PHONE_STABLE_FRAMES) {
          phoneActiveFilteredRef.current = true;
          setPhoneActive(true);
        }
      } else {
        if (phoneOffStreakRef.current >= PHONE_OFF_FRAMES) {
          phoneActiveFilteredRef.current = false;
          setPhoneActive(false);
        }
      }

      const filteredActive = phoneActiveFilteredRef.current;
      phoneDetectionRef.current = {
        active: filteredActive,
        prob: rawProb,
        bbox: filteredActive ? phoneLastBoxRef.current || yoloBox : null,
      };

      setPhoneHistory((prev) => {
        const n = prev.concat([
          { label: strongDetected ? "phone" : "no_phone", prob: rawProb },
        ]);
        return n.length > PHONE_HISTORY_LEN
          ? n.slice(n.length - PHONE_HISTORY_LEN)
          : n;
      });
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  // ── Phone WebSocket send loop — RAF-based, ~15fps ────────
  useEffect(() => {
    if (!status || status !== "active") return;
    let rafId;
    const interval = 1000 / PHONE_WS_FPS; // ~67ms

    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = Date.now();
      const sock = socketRef.current;
      const vid = videoRef.current;

      // chỉ gửi khi: socket ready, không đang pending, đủ interval
      if (!sock || !wsReadyRef.current || wsPendingRef.current) return;
      if (now - wsLastSentRef.current < interval) return;
      if (!vid || vid.readyState < 2) return;

      // capture frame nhỏ hơn để giảm latency
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 240; // downscale: YOLO vẫn detect tốt ở 320x240
      c.getContext("2d").drawImage(vid, 0, 0, 320, 240);
      const image = c.toDataURL("image/jpeg", 0.6); // quality 0.6 đủ cho YOLO

      wsPendingRef.current = true;
      wsLastSentRef.current = now;
      sock.emit("phone_frame", { image });
    }

    loop();
    return () => cancelAnimationFrame(rafId);
  }, [status, driverId]);

  // ── Smoking WebSocket send loop — RAF-based, ~4fps ─────────
  useEffect(() => {
    if (!SMOKING_ENABLED) return;
    if (!status || status !== "active") return;
    let rafId;
    const interval = 1000 / SMOKING_WS_FPS; // ~250ms

    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = Date.now();
      const sock = socketRef.current;
      const vid = videoRef.current;
      if (!sock || !wsReadyRef.current || wsSmokePendingRef.current) return;
      if (now - wsSmokLastSentRef.current < interval) return;
      if (!vid || vid.readyState < 2) return;

      // capture frame full size cho smoking (landmark perlu ảnh rõ)
      const c = document.createElement("canvas");
      c.width = vid.videoWidth || 640;
      c.height = vid.videoHeight || 480;
      c.getContext("2d").drawImage(vid, 0, 0);
      const image = c.toDataURL("image/jpeg", 0.7);

      wsSmokePendingRef.current = true;
      wsSmokLastSentRef.current = now;
      sock.emit("smoking_frame", { image });
    }

    loop();
    return () => cancelAnimationFrame(rafId);
  }, [status]);
  useEffect(() => {
    function loadScript(src) {
      return new Promise((res, rej) => {
        if (document.querySelector('script[src="' + src + '"]')) {
          res();
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    async function init() {
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js",
        );
        const FM = window.FaceMesh;
        if (!FM) return;
        const fm = new FM({
          locateFile: (f) =>
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + f,
        });
        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        fm.onResults((results) => {
          if (!results.multiFaceLandmarks || !results.multiFaceLandmarks[0]) {
            landmarksRef.current = [];
            return;
          }
          const lm = results.multiFaceLandmarks[0];
          landmarksRef.current = lm;
          poseRef.current = estimateHeadPose(lm);
          const earL = computeEAR(lm, L_EYE),
            earR = computeEAR(lm, R_EYE);
          const prL = computePupilRadius(lm, L_EYE.iris) * 100;
          const leOX = (lm[L_EYE.outer].x + lm[L_EYE.inner].x) / 2,
            leOY = (lm[L_EYE.outer].y + lm[L_EYE.inner].y) / 2;
          const eyeSpan =
            Math.abs(lm[L_EYE.outer].x - lm[L_EYE.inner].x) + 0.001;
          const lGY = ((lm[L_EYE.iris[0]].x - leOX) / eyeSpan) * 2,
            lGP = ((lm[L_EYE.iris[0]].y - leOY) / eyeSpan) * 2;
          const reOX = (lm[R_EYE.outer].x + lm[R_EYE.inner].x) / 2,
            reOY = (lm[R_EYE.outer].y + lm[R_EYE.inner].y) / 2;
          const rGY = ((lm[R_EYE.iris[0]].x - reOX) / eyeSpan) * 2,
            rGP = ((lm[R_EYE.iris[0]].y - reOY) / eyeSpan) * 2;
          const now = Date.now();
          const isBlinkL = earL < EAR_BLINK_THRESH,
            isBlinkR = earR < EAR_BLINK_THRESH,
            isBlink = isBlinkL && isBlinkR;
          if (isBlink && !blinkStateRef.current.left) {
            blinkTimesRef.current.push(now);
            blinkDurRef.current.start = now;
          }
          if (
            !isBlink &&
            blinkStateRef.current.left &&
            blinkDurRef.current.start
          )
            blinkDurRef.current.dur = (now - blinkDurRef.current.start) / 1000;
          blinkStateRef.current = { left: isBlinkL, right: isBlinkR };
          blinkTimesRef.current = blinkTimesRef.current.filter(
            (t) => now - t < 60000,
          );
          if (isBlinkL && isBlinkR) {
            if (eyesClosedSinceRef.current === null)
              eyesClosedSinceRef.current = now;
            eyesClosedSecRef.current =
              (now - eyesClosedSinceRef.current) / 1000;
          } else {
            eyesClosedSinceRef.current = null;
            eyesClosedSecRef.current = 0;
          }
          eyeDataRef.current = {
            left: {
              ear: earL,
              blinking: isBlinkL,
              yaw: lGY,
              pitch: lGP,
              pupilR: prL,
            },
            right: {
              ear: earR,
              blinking: isBlinkR,
              yaw: rGY,
              pitch: rGP,
              pupilR: prL * 0.98,
            },
          };
          earHistoryRef.current.left = earHistoryRef.current.left
            .slice(-(EAR_HISTORY - 1))
            .concat([earL]);
          earHistoryRef.current.right = earHistoryRef.current.right
            .slice(-(EAR_HISTORY - 1))
            .concat([earR]);
        });
        faceMeshRef.current = fm;
      } catch (e) {
        console.warn("MediaPipe init error", e);
      }
    }
    init();
    const dispId = setInterval(() => {
      const p = poseRef.current;
      setDisplayPose({ yaw: p.yaw, pitch: p.pitch, roll: p.roll });
      const ed = eyeDataRef.current,
        now = Date.now();
      setDisplayEye({
        blinkRate: blinkTimesRef.current.length,
        blinkDur: blinkDurRef.current.dur,
        pupilL: ed.left.pupilR ? ed.left.pupilR.toFixed(1) : "33.5",
        lYaw: ed.left.yaw ? (-ed.left.yaw * 18).toFixed(1) : "-11.8",
        lPitch: ed.left.pitch ? (-ed.left.pitch * 18).toFixed(1) : "-21.6",
        rYaw: ed.right.yaw ? (-ed.right.yaw * 18).toFixed(1) : "-19.9",
        rPitch: ed.right.pitch ? (-ed.right.pitch * 18).toFixed(1) : "-25.1",
        lX: (62 + Math.sin(now / 1100) * 3).toFixed(1),
        lY: (3.9 + Math.cos(now / 900) * 1.2).toFixed(1),
        lZ: (-2.7 + Math.sin(now / 1300) * 0.8).toFixed(1),
        rX: (63.2 + Math.cos(now / 1200) * 2.8).toFixed(1),
        rY: (9.7 + Math.sin(now / 800) * 1.5).toFixed(1),
        rZ: (-3.3 + Math.cos(now / 1400) * 0.9).toFixed(1),
      });
      setFrameCount((f) => f);
      // ── smoking continuous timer ──
      if (smokingDetectionRef.current?.active) {
        if (smokingSinceRef.current === null)
          smokingSinceRef.current = Date.now();
        smokingSecRef.current = (Date.now() - smokingSinceRef.current) / 1000;
      } else {
        smokingSinceRef.current = null;
        smokingSecRef.current = 0;
      }
      if (smokingSecRef.current >= SMOKING_WARN_MS / 1000) {
        setSmokingAlert(smokingSecRef.current);
        if (!alarmIntervalRef.current) startAlarm();
      } else {
        setSmokingAlert(null);
      }
      // ── phone continuous timer ──
      if (phoneDetectionRef.current?.active) {
        if (phoneSinceRef.current === null) phoneSinceRef.current = Date.now();
        phoneSecRef.current = (Date.now() - phoneSinceRef.current) / 1000;
      } else {
        phoneSinceRef.current = null;
        phoneSecRef.current = 0;
      }
      if (phoneSecRef.current >= PHONE_WARN_MS / 1000) {
        setPhoneAlert(phoneSecRef.current);
        if (!alarmIntervalRef.current) startAlarm();
      } else {
        setPhoneAlert(null);
      }
      // ── drowsy detection: kết hợp EAR (client) + API label (server) ──
      const closedSec = eyesClosedSecRef.current;
      const apiLabel  = apiLabelRef.current;

      // Đếm streak: API liên tục trả drowsy/yawning → tăng bộ đếm
      if (apiLabel === "drowsy" || apiLabel === "yawning") {
        apiLabelStreakRef.current = Math.min(apiLabelStreakRef.current + 1, 20);
      } else {
        apiLabelStreakRef.current = Math.max(apiLabelStreakRef.current - 1, 0);
      }
      const apiStreakTriggered = apiLabelStreakRef.current >= 5; // 5 × 250ms = 1.25s liên tiếp

      // Kích hoạt cảnh báo nếu MẮT NHẮM lâu (EAR) HOẶC model API nhận định drowsy liên tục
      const drowsyTriggered = closedSec >= EYES_CLOSED_WARN_MS / 1000 || apiStreakTriggered;

      if (drowsyTriggered) {
        // Nếu EAR không detect được thì dùng closedSec=1 làm giá trị tối thiểu
        setDrowsyAlert(closedSec > 0 ? closedSec : 1);
        if (!alarmIntervalRef.current) startAlarm();
      } else {
        setDrowsyAlert(null);
        // stop alarm chỉ khi cả 3 đều không active
        const anyAlert =
          phoneSecRef.current >= PHONE_WARN_MS / 1000 ||
          smokingSecRef.current >= SMOKING_WARN_MS / 1000;
        if (alarmIntervalRef.current && !anyAlert) stopAlarm();
      }
    }, 250);
    return () => clearInterval(dispId);
  }, []);

  // ── Face mesh send loop ──
  useEffect(() => {
    if (status !== "active") return;
    let running = true,
      last = 0;
    async function loop(now) {
      if (!running) return;
      if (now - last >= 33) {
        last = now;
        const fm = faceMeshRef.current,
          vid = videoRef.current;
        if (fm && vid && vid.readyState >= 2)
          try {
            await fm.send({ image: vid });
          } catch (_) {}
        setFrameCount((f) => f + 1);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return () => {
      running = false;
    };
  }, [status]);

  async function startWebcam() {
    const supportErr = getWebcamSupportErrorMessage();
    if (supportErr) {
      setErrorMsg(supportErr);
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("auth");
    } catch (err) {
      setErrorMsg(err.message || "Cannot access webcam");
      setStatus("error");
    }
  }
  function stopWebcam() {
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarksRef.current = [];
    setStatus("idle");
    poseRef.current = { yaw: 0, pitch: 0, roll: 0 };
    stopAlarm();
    setDrowsyAlert(null);
    eyesClosedSinceRef.current = null;
    eyesClosedSecRef.current = 0;
    phoneDetectionRef.current = { active: false, prob: 0, bbox: null };
    phoneActiveFilteredRef.current = false;
    phoneOnStreakRef.current = 0;
    phoneOffStreakRef.current = 0;
    phoneLastBoxRef.current = null;
    smokingDetectionRef.current = { active: false, prob: 0, bbox: null };
    wsPendingRef.current = false;
    wsSmokePendingRef.current = false;
    phoneSinceRef.current = null;
    phoneSecRef.current = 0;
    smokingActiveRef.current = false;
    smokingSinceRef.current = null;
    smokingSecRef.current = 0;
    setPhoneActive(false);
    setPhoneAlert(null);
    setSmokingActive(false);
    setSmokingAlert(null);
    setIdentityOwner(null);
    setIdentitySimilarity(null);
    setIdentityError("");
    setIdentitySamples(0);
    setIdentityLockCause(null);
    setIdentityRejectLockedAt("");
  }
  useEffect(() => {
    startWebcam();
    return () => stopWebcam();
  }, []);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function captureFrame(vid, quality = 0.7) {
    if (!vid || vid.readyState < 2) return null;

    // Downscale để giảm request payload base64
    const maxW = 480;
    const srcW = vid.videoWidth || 640;
    const srcH = vid.videoHeight || 480;
    const scale = Math.min(1, maxW / srcW);
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const c = document.createElement("canvas");
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0, targetW, targetH);
    return c.toDataURL("image/jpeg", quality);
  }
  async function captureBurstFrames(
    vid,
    count = IDENTITY_BURST_FRAMES,
    gapMs = IDENTITY_BURST_GAP_MS,
  ) {
    const frames = [];
    for (let i = 0; i < count; i++) {
      const frame = captureFrame(vid, 0.7);
      if (frame) frames.push(frame);
      if (i < count - 1) await sleep(gapMs);
    }
    return frames;
  }

  // ── REST API loop: landmark + smoking (giữ 1s) ──────────
  useEffect(() => {
    if (status !== "active") return;
    let cancelled = false,
      tid;
    async function loop() {
      if (cancelled) return;
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) {
        if (!cancelled) tid = setTimeout(loop, API_INTERVAL_MS);
        return;
      }
      try {
        setApiLoading(true);
        setApiError("");
        const frames = await captureBurstFrames(vid);
        const image = frames[0] || captureFrame(vid, 0.75);
        if (!image) {
          throw new Error("Không lấy được hình ảnh webcam");
        }

        // Chỉ gọi landmark REST — smoking đã chuyển sang WebSocket
        const res = await fetch(`${API_BASE}/api/landmark/predict_from_frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "API failed");
        setApiResult(data);
        apiLabelRef.current = data?.label || "unknown";
        setLastUpdated(new Date().toLocaleTimeString());

        // label history
        const scores = data?.scores || {};
        const entries = Object.entries(scores);
        let topLabel = data?.label || "unknown",
          topProb = typeof data?.prob === "number" ? data.prob : 0;
        if (entries.length) {
          const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
          topLabel = topLabel || sorted[0][0];
          if (!topProb || isNaN(topProb)) topProb = sorted[0][1] || 0;
        }
        setHistory((prev) => {
          const n = prev.concat([{ label: topLabel, prob: topProb }]);
          return n.length > HISTORY_SIZE ? n.slice(n.length - HISTORY_SIZE) : n;
        });
      } catch (err) {
        setApiError(err.message || "Cannot reach API");
      } finally {
        setApiLoading(false);
      }
      if (!cancelled) tid = setTimeout(loop, API_INTERVAL_MS);
    }
    loop();
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [status]);

  // ── Smoothed label ──
  let smoothedLabel = apiResult?.label || "unknown";
  if (history.length > 0) {
    const rel = history.filter((h) => h.prob >= MIN_PROB_FOR_LABEL);
    if (rel.length > 0) {
      const cnt = {};
      rel.forEach((h) => {
        cnt[h.label] = (cnt[h.label] || 0) + 1;
      });
      const maj = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
      const rec = rel.slice(-CONSISTENT_FRAMES);
      if (rec.length === CONSISTENT_FRAMES && rec.every((h) => h.label === maj))
        smoothedLabel = maj;
    }
  }
  const currentLabel = smoothedLabel;
  const info = LABEL_MAP[currentLabel] || LABEL_MAP.unknown;
  const isAlert = info.level === "risk" || info.level === "warning";
  const yDeg = ((displayPose.yaw * 180) / Math.PI).toFixed(1);
  const pDeg = ((displayPose.pitch * 180) / Math.PI).toFixed(1);
  const rDeg = ((displayPose.roll * 180) / Math.PI).toFixed(1);
  const phoneIconActive = status === "active" && phoneActive;
  const smokingIconActive = status === "active" && SMOKING_ENABLED && smokingActive;
  const activeIcons = STATUS_ICONS.map((ic) => {
    let active = false;
    if (ic.id === "camera") active = status === "active";
    if (ic.id === "attentive") active = currentLabel === "safe";
    if (ic.id === "awake")
      active =
        status === "active" &&
        currentLabel !== "drowsy" &&
        currentLabel !== "yawning" &&
        !drowsyAlert;
    if (ic.id === "seatbelt") active = true;
    if (ic.id === "cabin") active = cabinLightsOn || cabinAcOn;
    if (ic.id === "phone") active = phoneIconActive;
    if (ic.id === "smoking") active = smokingIconActive;
    return { ...ic, active };
  });
  const iconCircleBase = {
    width: 56,
    height: 56,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    cursor: "pointer",
  };
  const blinkHL = displayEye.blinkDur > 0.15;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        fontFamily: "'Segoe UI',Arial,sans-serif",
        color: "#ccd8e8",
        display: "flex",
        overflow: "hidden",
        fontSize: 12,
      }}
    >
      {/* ══ LEFT ══ */}
      <div
        style={{
          width: "35%",
          minWidth: 340,
          background: "#000",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid #0d1e30",
        }}
      >
        <div
          style={{
            flex: "0 0 260px",
            background: "#000",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Head3D poseRef={poseRef} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#000",
            overflow: "hidden",
            padding: "4px 8px",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                background: "#1e5fc0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              i
            </div>
            {["Yaw", "Pitch", "Roll"].map((label, i) => (
              <React.Fragment key={label}>
                <div
                  style={{
                    background: "#0a1828",
                    border: "1px solid #1a3a58",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#5a8ab0",
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    background: "#0a1828",
                    border: "1px solid #1a3a58",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#7ab8d8",
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {[yDeg, pDeg, rDeg][i]}°
                </div>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {[
              { label: "Pupil dilation", val: `${displayEye.pupilL}%` },
              { label: "Blink rate", val: `${displayEye.blinkRate}` },
            ].map(({ label, val }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  style={{ fontSize: 9, color: "#5a8ab0", textAlign: "center" }}
                >
                  {label}
                </span>
                <div
                  style={{
                    background: "#0a1828",
                    border: "1px solid #1a3a58",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#7ab8d8",
                    textAlign: "center",
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
            <div
              style={{
                flex: 1.3,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{ fontSize: 9, color: "#5a8ab0", textAlign: "center" }}
              >
                Blink duration
              </span>
              <div
                style={{
                  background: blinkHL ? "#1e5fc0" : "#0a1828",
                  border: blinkHL ? "1px solid #3b9eff" : "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: blinkHL ? "#fff" : "#7ab8d8",
                  textAlign: "center",
                }}
              >
                {typeof displayEye.blinkDur === "number"
                  ? displayEye.blinkDur.toFixed(2)
                  : "0.00"}{" "}
                sec
              </div>
            </div>
            <div
              style={{
                flex: 0.8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 9, color: "#5a8ab0" }}>Glasses</span>
              <div
                style={{
                  background: "#0a1828",
                  border: "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "2px 6px",
                  fontSize: 18,
                  textAlign: "center",
                }}
              >
                🕶️
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {["Left_Eye", "Right_Eye"].map((e) => (
              <div
                key={e}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 11,
                  color: "#7ab8d8",
                  borderBottom: "1px solid #1a3a58",
                  paddingBottom: 3,
                }}
              >
                <span
                  style={{ textDecoration: "underline", cursor: "pointer" }}
                >
                  {e}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, height: 90 }}>
            {["left", "right"].map((side) => (
              <div
                key={side}
                style={{
                  flex: 1,
                  background: "#000",
                  border: "1px solid #0d2a44",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <EyeCanvas eyeDataRef={eyeDataRef} side={side} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              [displayEye.lYaw, displayEye.lPitch],
              [displayEye.rYaw, displayEye.rPitch],
            ].map((vals, i) => (
              <div key={i} style={{ flex: 1, display: "flex", gap: 3 }}>
                {["Yaw", "Pitch"].map((lbl, j) => (
                  <div
                    key={lbl}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#5a8ab0" }}>{lbl}</span>
                    <div
                      style={{
                        background: "#0a1828",
                        border: "1px solid #1a3a58",
                        borderRadius: 3,
                        padding: "3px 4px",
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "#7ab8d8",
                        textAlign: "center",
                      }}
                    >
                      {vals[j]}°
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              [displayEye.lX, displayEye.lY, displayEye.lZ],
              [displayEye.rX, displayEye.rY, displayEye.rZ],
            ].map((vals, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  gap: 2,
                  alignItems: "center",
                }}
              >
                {["X", "Y", "Z"].map((lbl, j) => (
                  <React.Fragment key={lbl}>
                    <span
                      style={{ fontSize: 9, color: "#3a6a88", flexShrink: 0 }}
                    >
                      {lbl}
                    </span>
                    <div
                      style={{
                        background: "#0a1828",
                        border: "1px solid #1a3a58",
                        borderRadius: 3,
                        padding: "2px 4px",
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "#7ab8d8",
                        textAlign: "center",
                        flex: 1,
                      }}
                    >
                      {vals[j]}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              gap: 5,
              minHeight: 0,
              overflow: "hidden",
              paddingBottom: 4,
            }}
          >
            {[
              ["left", 2],
              ["right", 0.7],
              ["left", 2],
              ["right", 0.7],
            ].map(([side, flex], i) => (
              <div
                key={i}
                style={{
                  flex,
                  background: "#000",
                  border: "1px solid #0a1e30",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <WaveformCanvas
                  earHistoryRef={earHistoryRef}
                  side={side}
                  color="#1e90ff"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ RIGHT ══ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#000",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* icons */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            gap: 16,
            paddingTop: 10,
            paddingBottom: 8,
            background:
              "linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 100%)",
            pointerEvents: "none",
          }}
        >
          {activeIcons.map((ic) => (
            <div
              key={ic.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
              }}
            >
              <div
                style={{
                  ...iconCircleBase,
                  background: ic.active
                    ? "radial-gradient(circle at 35% 35%,#5ab0ff,#1e70e0)"
                    : "radial-gradient(circle at 35% 35%,#3a5070,#1a2840)",
                  border: ic.active
                    ? "2px solid rgba(100,180,255,0.6)"
                    : "2px solid rgba(40,80,120,0.5)",
                  boxShadow: ic.active
                    ? "0 0 14px rgba(60,150,255,0.5),inset 0 1px 0 rgba(255,255,255,0.2)"
                    : "inset 0 1px 0 rgba(255,255,255,0.05)",
                  filter: ic.active ? "none" : "grayscale(0.6) opacity(0.55)",
                  pointerEvents: "auto",
                  ...(ic.id === "phone" && ic.active
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#ffaa40,#ff6b00)",
                        border: "2px solid rgba(255,160,50,0.8)",
                        boxShadow: "0 0 18px rgba(255,140,0,0.7)",
                      }
                    : {}),
                  ...(ic.id === "smoking" && ic.active
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#ff6060,#cc2020)",
                        border: "2px solid rgba(255,80,40,0.8)",
                        boxShadow: "0 0 18px rgba(255,60,20,0.7)",
                      }
                    : {}),
                  ...(ic.id === "cabin" && cabinLightsOn
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#ffe08a,#d4a017)",
                        border: "2px solid rgba(255,220,120,0.85)",
                        boxShadow: "0 0 20px rgba(255,210,80,0.65)",
                        filter: "none",
                      }
                    : {}),
                  ...(ic.id === "cabin" && cabinAcOn && !cabinLightsOn
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#7ecbff,#2080c0)",
                        border: "2px solid rgba(120,200,255,0.8)",
                        boxShadow: "0 0 16px rgba(80,180,255,0.55)",
                        filter: "none",
                      }
                    : {}),
                }}
              >
                <span style={{ fontSize: 22 }}>{ic.icon}</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: ic.active ? "#fff" : "rgba(160,190,220,0.55)",
                  textShadow: ic.active ? "0 1px 4px rgba(0,0,0,0.8)" : "none",
                }}
              >
                {ic.label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
              display: "block",
              filter: "brightness(0.9) contrast(1.05)",
            }}
          />
          {status === "active" && cabinLightsOn && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 22,
                background:
                  "radial-gradient(ellipse 85% 50% at 50% 8%, rgba(255,248,210,0.4) 0%, rgba(255,235,180,0.12) 35%, transparent 65%)",
              }}
            />
          )}
          <VoiceCarAssistant
            enabled={status === "active"}
            requireWake
            onLightChange={setCabinLightsOn}
            onAcChange={setCabinAcOn}
            onYoutubeOpen={() => setYoutubeMockOpen(true)}
            onYoutubeClose={() => setYoutubeMockOpen(false)}
          />
          <OwnerVerifyGate
            enabled={status === "auth" || status === "active" || status === "locked"}
            carState={status === "active" ? "active" : status === "locked" ? "locked" : "auth"}
            videoRef={videoRef}
            driverId={driverId}
            apiBase={API_BASE}
            unlockStreakFrames={ID_AUTH_UNLOCK_FRAMES}
            lockStreakFrames={ID_AUTH_LOCK_INTRUDER_FRAMES}
            verifyIntervalMs={ID_AUTH_RETRY_INTERVAL_MS}
            decisionTimeoutSec={30}
            onUnlock={handleIdentityUnlock}
            onLock={handleIdentityLock}
            onUpdateIdentity={handleUpdateIdentity}
          />
          {status === "active" && (
            <FaceMeshOverlay
              landmarksRef={landmarksRef}
              eyeDataRef={eyeDataRef}
              videoRef={videoRef}
            />
          )}
          {status === "active" && (
            <PhoneFOMOOverlay
              phoneDetectionRef={phoneDetectionRef}
              landmarksRef={landmarksRef}
              videoRef={videoRef}
            />
          )}
          {status === "active" && SMOKING_ENABLED && (
            <SmokingFOMOOverlay
              smokingDetectionRef={smokingDetectionRef}
              landmarksRef={landmarksRef}
              videoRef={videoRef}
            />
          )}

          {/* HUD */}
          {status === "active" && (
            <div
              style={{
                position: "absolute",
                top: 82,
                left: 14,
                pointerEvents: "none",
                lineHeight: "1.9",
                zIndex: 6,
              }}
            >
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                FPS : 30
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Person ID : Tall
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                AOI : 0
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Eye Mode : {faceMeshRef.current ? "SACCADE" : "STANDBY"}
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Driver ID : {driverId}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color:
                    identityOwner === true
                      ? "#00e578"
                      : identityOwner === false
                        ? "#ff4560"
                        : "#ffc940",
                  fontWeight: 700,
                }}
              >
                Real Driver :{" "}
                {identityHasRegistered
                  ? identityOwner === true
                    ? "YES"
                    : identityOwner === false
                      ? "NO"
                      : "CHECKING"
                  : "NOT REGISTERED"}
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Face Match :{" "}
                {typeof identitySimilarity === "number"
                  ? `${(identitySimilarity * 100).toFixed(2)}%`
                  : "--"}{" "}
                ({identitySamples || 0} frames)
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: phoneIconActive ? "#ffaa40" : "#3b9eff",
                  fontWeight: 500,
                }}
              >
                Phone WS :{" "}
                {wsConnected
                  ? phoneIconActive
                    ? `⚠ YES (${((phoneDetectionRef.current?.prob || 0) * 100).toFixed(0)}%)`
                    : "NO"
                  : "⚠ disconnected"}
              </div>
              {identityError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}
                >
                  Identity: {identityError}
                </div>
              )}
              {phoneError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}
                >
                  {phoneError}
                </div>
              )}
              <div
                style={{
                  pointerEvents: "auto",
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(60,120,180,0.35)",
                  maxWidth: 280,
                }}
              >
                <div style={{ fontSize: 12, color: "#8ecae6", fontWeight: 600 }}>
                  Phiên lái #{drivingSessionId ?? "…"}
                  {drivingSessionStartedAt
                    ? ` · ${drivingSessionStartedAt}`
                    : ""}
                </div>
                <div style={{ fontSize: 11, color: "#a8d8ff", marginTop: 2 }}>
                  Cảnh báo (lần phát hiện): 📱 {sessionAlertCounts.phone} · 🚬{" "}
                  {sessionAlertCounts.smoking} · 😴 {sessionAlertCounts.drowsy}
                </div>
                <button
                  type="button"
                  onClick={() => setSessionLogOpen((o) => !o)}
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "1px solid rgba(100,180,255,0.5)",
                    background: "rgba(10,40,70,0.85)",
                    color: "#cfe8ff",
                    cursor: "pointer",
                  }}
                >
                  {sessionLogOpen ? "Ẩn lịch sử phiên" : "Lịch sử phiên (fleet demo)"}
                </button>
                {sessionLogOpen && (
                  <div
                    style={{
                      marginTop: 8,
                      maxHeight: 180,
                      overflow: "auto",
                      fontSize: 10,
                      color: "#9ecfff",
                      fontFamily: "monospace",
                      lineHeight: 1.45,
                      background: "rgba(0,20,40,0.5)",
                      padding: 8,
                      borderRadius: 4,
                    }}
                  >
                    {sessionLogLoading ? (
                      <span>Đang tải…</span>
                    ) : sessionLogItems.length === 0 ? (
                      <span>Chưa có phiên nào.</span>
                    ) : (
                      sessionLogItems.map((s) => (
                        <div key={s.session_id} style={{ marginBottom: 6 }}>
                          #{s.session_id}{" "}
                          {s.started_at} → {s.ended_at || "…"} ·{" "}
                          {Object.entries(s.alerts || {})
                            .map(([k, v]) => `${k}:${v}`)
                            .join(" ")}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              {SMOKING_ENABLED && (
                <div
                  style={{
                    fontSize: 13,
                    color: smokingIconActive ? "#ff6040" : "#3b9eff",
                    fontWeight: 500,
                  }}
                >
                  Smoking :{" "}
                  {smokingIconActive
                    ? `⚠ YES (${smokingSecRef.current.toFixed(0)}s)`
                    : smokingResult
                      ? "NO"
                      : "..."}
                </div>
              )}
              {SMOKING_ENABLED && smokingError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}
                >
                  Smoking API error
                </div>
              )}
            </div>
          )}

          {status === "active" && identityHasRegistered && (
            <div
              style={{
                position: "absolute",
                top: 88,
                right: 18,
                zIndex: 9,
                pointerEvents: "none",
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${identityOwner === true ? "rgba(0,229,120,0.6)" : identityOwner === false ? "rgba(255,69,96,0.7)" : "rgba(255,201,64,0.7)"}`,
                background:
                  identityOwner === true
                    ? "rgba(0,40,20,0.65)"
                    : identityOwner === false
                      ? "rgba(60,0,10,0.68)"
                      : "rgba(45,35,0,0.62)",
                color:
                  identityOwner === true
                    ? "#00e578"
                    : identityOwner === false
                      ? "#ff4560"
                      : "#ffc940",
                fontWeight: 700,
                letterSpacing: "0.08em",
                fontSize: 12,
              }}
            >
              {identityOwner === true
                ? "✓ OWNER VERIFIED"
                : identityOwner === false
                  ? "✕ INTRUDER DETECTED"
                  : "… VERIFYING OWNER"}
            </div>
          )}

          {/* Drowsy alert */}
          {drowsyAlert !== null && status === "active" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.75)",
                animation: "drowsyBg 0.5s ease-in-out infinite alternate",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  border: "5px solid #ff1a1a",
                  animation: "alarmBorder 0.4s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
              {[
                { top: 0, left: 0 },
                { top: 0, right: 0 },
                { bottom: 0, left: 0 },
                { bottom: 0, right: 0 },
              ].map((pos, i) =>
                React.createElement("div", {
                  key: i,
                  style: {
                    position: "absolute",
                    width: 40,
                    height: 40,
                    background: "rgba(255,30,30,0.35)",
                    animation: "cornerFlash 0.4s ease-in-out infinite",
                    animationDelay: i * 0.1 + "s",
                    pointerEvents: "none",
                    ...pos,
                  },
                }),
              )}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 16,
                  pointerEvents: "none",
                }}
              >
                {[
                  {
                    icon: "🔊",
                    text: "ÂM THANH BẬT",
                    bg: "rgba(255,50,50,0.2)",
                    border: "rgba(255,80,80,0.6)",
                    color: "#ff8080",
                    delay: "0s",
                  },
                  {
                    icon: "📳",
                    text: "RUNG",
                    bg: "rgba(255,140,0,0.18)",
                    border: "rgba(255,160,0,0.5)",
                    color: "#ffaa40",
                    delay: "0.45s",
                  },
                ].map((b) => (
                  <div
                    key={b.text}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: b.bg,
                      border: `1px solid ${b.border}`,
                      borderRadius: 20,
                      padding: "4px 14px",
                      animation: "badgePulse 0.9s ease-in-out infinite",
                      animationDelay: b.delay,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.icon}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: b.color,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  fontSize: 72,
                  marginBottom: 12,
                  animation: "iconBounce 0.7s ease-in-out infinite",
                  filter: "drop-shadow(0 0 24px rgba(255,40,40,0.95))",
                  pointerEvents: "none",
                }}
              >
                😴
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color: "#ff1a1a",
                  letterSpacing: "0.1em",
                  textShadow: "0 0 24px rgba(255,20,20,0.95)",
                  animation: "textFlash 0.5s ease-in-out infinite",
                  marginBottom: 6,
                  pointerEvents: "none",
                }}
              >
                ⚠ CẢNH BÁO BUỒN NGỦ
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#ffcc00",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  marginBottom: 20,
                  pointerEvents: "none",
                }}
              >
                Tài xế nhắm mắt quá lâu — Hãy dừng xe và nghỉ ngơi!
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(255,50,50,0.6)",
                    borderRadius: 8,
                    padding: "6px 20px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: "#ff8080",
                      letterSpacing: "0.14em",
                      marginBottom: 2,
                    }}
                  >
                    THỜI GIAN NHẮM MẮT
                  </span>
                  <span
                    style={{
                      fontSize: 34,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "#ff3030",
                      lineHeight: 1,
                    }}
                  >
                    {drowsyAlert.toFixed(1)}
                    <span style={{ fontSize: 16, color: "#ff6060" }}>s</span>
                  </span>
                </div>
              </div>
              <div
                style={{
                  width: "55%",
                  marginBottom: 20,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 9, color: "#ff6060" }}>3s</span>
                  <span
                    style={{ fontSize: 9, color: "#ff2020", fontWeight: 700 }}
                  >
                    MỨC ĐỘ NGUY HIỂM
                  </span>
                  <span style={{ fontSize: 9, color: "#ff6060" }}>
                    {Math.min(drowsyAlert, 10).toFixed(0)}s
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 8,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: Math.min(100, ((drowsyAlert - 3) / 7) * 100) + "%",
                      background: "linear-gradient(90deg,#ff6600,#ff0000)",
                      borderRadius: 4,
                      transition: "width 0.25s linear",
                    }}
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  stopAlarm();
                  setDrowsyAlert(null);
                  eyesClosedSinceRef.current = null;
                  eyesClosedSecRef.current = 0;
                }}
                style={{
                  padding: "8px 28px",
                  background: "rgba(255,255,255,0.12)",
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                }}
              >
                ✕ BỎ QUA CẢNH BÁO
              </button>
            </div>
          )}

          {/* ── SMOKING ALERT ── */}
          {SMOKING_ENABLED &&
            smokingAlert !== null &&
            status === "active" &&
            drowsyAlert === null &&
            phoneAlert === null && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 18,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.72)",
                  animation: "smokingBg 0.6s ease-in-out infinite alternate",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    border: "5px solid #ff3a00",
                    animation: "smokingBorder 0.45s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
                {[
                  { top: 0, left: 0 },
                  { top: 0, right: 0 },
                  { bottom: 0, left: 0 },
                  { bottom: 0, right: 0 },
                ].map((pos, i) =>
                  React.createElement("div", {
                    key: i,
                    style: {
                      position: "absolute",
                      width: 44,
                      height: 44,
                      background: "rgba(255,60,0,0.28)",
                      animation: "cornerFlash 0.45s ease-in-out infinite",
                      animationDelay: i * 0.1 + "s",
                      pointerEvents: "none",
                      ...pos,
                    },
                  }),
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  {[
                    {
                      icon: "🔊",
                      text: "ÂM THANH BẬT",
                      bg: "rgba(255,60,0,0.18)",
                      border: "rgba(255,80,20,0.6)",
                      color: "#ff7040",
                      delay: "0s",
                    },
                    {
                      icon: "📳",
                      text: "RUNG",
                      bg: "rgba(200,60,0,0.15)",
                      border: "rgba(220,80,0,0.5)",
                      color: "#ff6030",
                      delay: "0.4s",
                    },
                  ].map((b) => (
                    <div
                      key={b.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: b.bg,
                        border: `1px solid ${b.border}`,
                        borderRadius: 20,
                        padding: "4px 14px",
                        animation: "badgePulse 0.9s ease-in-out infinite",
                        animationDelay: b.delay,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{b.icon}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: b.color,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {b.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 72,
                    marginBottom: 12,
                    animation: "iconBounce 0.7s ease-in-out infinite",
                    filter: "drop-shadow(0 0 28px rgba(255,60,0,0.95))",
                    pointerEvents: "none",
                  }}
                >
                  🚬
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#ff4500",
                    letterSpacing: "0.1em",
                    textShadow: "0 0 24px rgba(255,60,0,0.95)",
                    animation: "textFlash 0.5s ease-in-out infinite",
                    marginBottom: 6,
                    pointerEvents: "none",
                  }}
                >
                  ⚠ CẢNH BÁO HÚT THUỐC
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#ffcc00",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  Tài xế đang hút thuốc khi lái xe — Nguy hiểm!
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(255,60,0,0.6)",
                      borderRadius: 8,
                      padding: "6px 24px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#ff7040",
                        letterSpacing: "0.14em",
                        marginBottom: 2,
                      }}
                    >
                      THỜI GIAN HÚT THUỐC
                    </span>
                    <span
                      style={{
                        fontSize: 34,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: "#ff4500",
                        lineHeight: 1,
                      }}
                    >
                      {smokingAlert.toFixed(1)}
                      <span style={{ fontSize: 16, color: "#ff7040" }}>s</span>
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    width: "55%",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#ff7040" }}>4s</span>
                    <span
                      style={{ fontSize: 9, color: "#ff4500", fontWeight: 700 }}
                    >
                      MỨC ĐỘ NGUY HIỂM
                    </span>
                    <span style={{ fontSize: 9, color: "#ff7040" }}>
                      {Math.min(smokingAlert, 30).toFixed(0)}s
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 8,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width:
                          Math.min(100, ((smokingAlert - 4) / 26) * 100) + "%",
                        background: "linear-gradient(90deg,#ff6000,#cc2200)",
                        borderRadius: 4,
                        transition: "width 0.25s linear",
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    stopAlarm();
                    setSmokingAlert(null);
                    smokingSinceRef.current = null;
                    smokingSecRef.current = 0;
                  }}
                  style={{
                    padding: "8px 28px",
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                  }}
                >
                  ✕ BỎ QUA CẢNH BÁO
                </button>
              </div>
            )}

          {/* ── PHONE ALERT ── */}
          {phoneAlert !== null &&
            status === "active" &&
            drowsyAlert === null && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 19,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.72)",
                  animation: "phoneBg 0.6s ease-in-out infinite alternate",
                }}
              >
                {/* border nhấp nháy màu cam */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    border: "5px solid #ff8c00",
                    animation: "phoneAlarmBorder 0.45s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
                {/* góc flash */}
                {[
                  { top: 0, left: 0 },
                  { top: 0, right: 0 },
                  { bottom: 0, left: 0 },
                  { bottom: 0, right: 0 },
                ].map((pos, i) =>
                  React.createElement("div", {
                    key: i,
                    style: {
                      position: "absolute",
                      width: 44,
                      height: 44,
                      background: "rgba(255,140,0,0.3)",
                      animation: "cornerFlash 0.45s ease-in-out infinite",
                      animationDelay: i * 0.1 + "s",
                      pointerEvents: "none",
                      ...pos,
                    },
                  }),
                )}
                {/* badges */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  {[
                    {
                      icon: "🔊",
                      text: "ÂM THANH BẬT",
                      bg: "rgba(255,140,0,0.18)",
                      border: "rgba(255,160,0,0.6)",
                      color: "#ffaa40",
                      delay: "0s",
                    },
                    {
                      icon: "📳",
                      text: "RUNG",
                      bg: "rgba(255,100,0,0.15)",
                      border: "rgba(255,120,0,0.5)",
                      color: "#ff8c40",
                      delay: "0.4s",
                    },
                  ].map((b) => (
                    <div
                      key={b.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: b.bg,
                        border: `1px solid ${b.border}`,
                        borderRadius: 20,
                        padding: "4px 14px",
                        animation: "badgePulse 0.9s ease-in-out infinite",
                        animationDelay: b.delay,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{b.icon}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: b.color,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {b.text}
                      </span>
                    </div>
                  ))}
                </div>
                {/* icon */}
                <div
                  style={{
                    fontSize: 72,
                    marginBottom: 12,
                    animation: "iconBounce 0.7s ease-in-out infinite",
                    filter: "drop-shadow(0 0 28px rgba(255,140,0,0.95))",
                    pointerEvents: "none",
                  }}
                >
                  📱
                </div>
                {/* tiêu đề */}
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#ff8c00",
                    letterSpacing: "0.1em",
                    textShadow: "0 0 24px rgba(255,140,0,0.95)",
                    animation: "textFlash 0.5s ease-in-out infinite",
                    marginBottom: 6,
                    pointerEvents: "none",
                  }}
                >
                  ⚠ CẢNH BÁO DÙNG ĐIỆN THOẠI
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#ffcc00",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  Tài xế đang sử dụng điện thoại — Tập trung vào lái xe!
                </div>
                {/* timer box */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(255,140,0,0.6)",
                      borderRadius: 8,
                      padding: "6px 24px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#ffaa40",
                        letterSpacing: "0.14em",
                        marginBottom: 2,
                      }}
                    >
                      THỜI GIAN DÙNG PHONE
                    </span>
                    <span
                      style={{
                        fontSize: 34,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: "#ff8c00",
                        lineHeight: 1,
                      }}
                    >
                      {phoneAlert.toFixed(1)}
                      <span style={{ fontSize: 16, color: "#ffaa40" }}>s</span>
                    </span>
                  </div>
                </div>
                {/* progress bar */}
                <div
                  style={{
                    width: "55%",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#ffaa40" }}>3s</span>
                    <span
                      style={{ fontSize: 9, color: "#ff8c00", fontWeight: 700 }}
                    >
                      MỨC ĐỘ NGUY HIỂM
                    </span>
                    <span style={{ fontSize: 9, color: "#ffaa40" }}>
                      {Math.min(phoneAlert, 30).toFixed(0)}s
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 8,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width:
                          Math.min(100, ((phoneAlert - 3) / 27) * 100) + "%",
                        background: "linear-gradient(90deg,#ff8c00,#ff4500)",
                        borderRadius: 4,
                        transition: "width 0.25s linear",
                      }}
                    />
                  </div>
                </div>
                {/* nút bỏ qua */}
                <button
                  onClick={() => {
                    stopAlarm();
                    setPhoneAlert(null);
                    phoneSinceRef.current = null;
                    phoneSecRef.current = 0;
                  }}
                  style={{
                    padding: "8px 28px",
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                  }}
                >
                  ✕ BỎ QUA CẢNH BÁO
                </button>
              </div>
            )}

          {isAlert && status === "active" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                border: "3px solid " + info.color,
                animation: "borderPulse 1.2s ease-in-out infinite",
                zIndex: 6,
              }}
            />
          )}

          {status === "active" && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                pointerEvents: "none",
                zIndex: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: info.color,
                  animation: "glow 1.5s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: info.color,
                  letterSpacing: "0.1em",
                }}
              >
                {info.vi}
              </span>
              {apiResult?.prob != null && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {(apiResult.prob * 100).toFixed(1)}%
                </span>
              )}
              {apiLoading && (
                <span style={{ fontSize: 10, color: "#ffc940" }}>⟳</span>
              )}
              {apiError && (
                <span style={{ fontSize: 10, color: "#ff4560" }}>⚠ API</span>
              )}
            </div>
          )}
          {status === "active" && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 14,
                fontSize: 11,
                color: "rgba(100,150,200,0.5)",
                pointerEvents: "none",
                zIndex: 6,
              }}
            >
              {time.toLocaleTimeString("en-US", { hour12: false })}
            </div>
          )}

          {status === "loading" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#3b9eff",
                  letterSpacing: "0.2em",
                  animation: "blink 1s infinite",
                }}
              >
                INITIALIZING CAMERA...
              </div>
              <div
                style={{
                  width: 200,
                  height: 2,
                  background: "rgba(60,150,255,0.12)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "#3b9eff",
                    animation: "loadBar 1.5s infinite",
                    width: "40%",
                  }}
                />
              </div>
            </div>
          )}
          {status === "error" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.9)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#ff4560",
                  letterSpacing: "0.1em",
                }}
              >
                ⚠ Camera Error
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#4a7a9a",
                  maxWidth: 280,
                  textAlign: "center",
                  lineHeight: "1.6",
                }}
              >
                {errorMsg}
              </div>
              <button
                onClick={startWebcam}
                style={{
                  padding: "6px 20px",
                  background: "rgba(60,150,255,0.1)",
                  border: "1px solid rgba(60,150,255,0.4)",
                  color: "#3b9eff",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Retry
              </button>
            </div>
          )}
          {status === "auth" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.82)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                zIndex: 30,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#ffc940",
                  letterSpacing: "0.15em",
                  fontWeight: 800,
                }}
              >
                CAR AUTH REQUIRED
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#9bd3ff",
                  maxWidth: 420,
                  lineHeight: 1.6,
                }}
              >
                Đang xác thực chủ xe bằng khuôn mặt cho <b>{driverId}</b>.
                <br />
                Nếu không phải chủ xe, hệ thống sẽ khóa về trạng thái chờ.
              </div>
              {identityError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 700 }}
                >
                  {identityError}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#7ab8d8" }}>
                {typeof identitySimilarity === "number"
                  ? `MATCH: ${(identitySimilarity * 100).toFixed(2)}%`
                  : "MATCH: --"}
              </div>
              <div
                style={{
                  width: 240,
                  height: 2,
                  background: "rgba(60,150,255,0.12)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "#3b9eff",
                    animation: "loadBar 1.5s infinite",
                    width: "40%",
                  }}
                />
              </div>
            </div>
          )}
          {status === "locked" && identityLockCause === "owner_reject" && (
            <TelegramOwnerRejectOverlay
              driverId={driverId}
              detail={identityError}
              timestamp={identityRejectLockedAt}
            />
          )}
          {status === "locked" && identityLockCause !== "owner_reject" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.88)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                zIndex: 35,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#ff4560",
                  letterSpacing: "0.15em",
                  fontWeight: 800,
                }}
              >
                {identityLockCause === "owner_timeout"
                  ? "ENGINE OFF - CHỦ XE KHÔNG PHẢN HỒI"
                  : "ENGINE OFF - UNAUTHORIZED DRIVER"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#ffd0d0",
                  maxWidth: 460,
                  lineHeight: 1.6,
                }}
              >
                {identityLockCause === "owner_timeout" ? (
                  <>
                    Hết thời gian chờ phản hồi trên Telegram.
                    <br />
                    Xe đang tắt máy / khóa điều khiển.
                  </>
                ) : (
                  <>
                    Xe hiện đang tắt máy vì bạn không phải chính chủ.
                    <br />
                    Hệ thống đã gửi yêu cầu xác nhận qua Telegram của chủ xe.
                  </>
                )}
              </div>
              {identityError && (
                <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 700 }}>
                  {identityError}
                </div>
              )}
            </div>
          )}
          {status === "idle" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div style={{ fontSize: 40, opacity: 0.08 }}>📷</div>
              <div
                style={{
                  fontSize: 11,
                  color: "#2a4a68",
                  letterSpacing: "0.18em",
                }}
              >
                CAMERA STANDBY
              </div>
              <button
                onClick={startWebcam}
                style={{
                  padding: "7px 24px",
                  background: "rgba(60,150,255,0.08)",
                  border: "1px solid rgba(60,150,255,0.3)",
                  color: "#3b9eff",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Activate Camera
              </button>
            </div>
          )}
          <DriverAuthenticatedWelcome
            profile={authWelcomeProfile}
            durationMs={5000}
            onDismiss={dismissAuthWelcome}
          />
        </div>

        {/* bottom bar */}
        <div
          style={{
            flexShrink: 0,
            height: 32,
            background: "#030810",
            borderTop: "1px solid #0d1e30",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 9,
              color: "#2a4a68",
              letterSpacing: "0.08em",
              alignItems: "center",
            }}
          >
            <span>
              ●{" "}
              {status === "active"
                ? "REC ACTIVE"
                : status === "auth"
                  ? "AUTH"
                  : status === "locked"
                    ? "ENGINE OFF"
                  : "STANDBY"}
            </span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>{frameCount} frames</span>
            {lastUpdated && <span>| Last: {lastUpdated}</span>}
            <span style={{ color: wsConnected ? "#00e578" : "#ff4560" }}>
              {wsConnected ? "● WS" : "○ WS"}
            </span>
            <span
              style={{
                color:
                  identityOwner === true
                    ? "#00e578"
                    : identityOwner === false
                      ? "#ff4560"
                      : "#ffc940",
              }}
            >
              ID:
              {identityHasRegistered
                ? identityOwner === true
                  ? "OWNER"
                  : identityOwner === false
                    ? "INTRUDER"
                    : "CHECK"
                : "NO_REG"}
            </span>
            {apiError && (
              <span style={{ color: "#ff4560" }}>
                ⚠ {apiError.slice(0, 28)}
              </span>
            )}
            {identityError && (
              <span style={{ color: "#ff4560" }}>
                ⚠ ID {identityError.slice(0, 24)}
              </span>
            )}
          </div>
          <div>
            {status === "active" || status === "auth" || status === "locked" ? (
              <button
                onClick={stopWebcam}
                style={{
                  padding: "2px 14px",
                  background: "rgba(255,69,96,0.07)",
                  border: "1px solid rgba(255,69,96,0.3)",
                  color: "#ff4560",
                  fontSize: 9,
                  cursor: "pointer",
                  borderRadius: 3,
                }}
              >
                ■ Stop
              </button>
            ) : (
              <button
                onClick={startWebcam}
                disabled={status === "loading"}
                style={{
                  padding: "2px 14px",
                  background: "rgba(60,200,100,0.07)",
                  border: "1px solid rgba(60,200,100,0.3)",
                  color: "#00e578",
                  fontSize: 9,
                  cursor: "pointer",
                  borderRadius: 3,
                  opacity: status === "loading" ? 0.5 : 1,
                }}
              >
                ▶ Start
              </button>
            )}
          </div>
        </div>
      </div>

      <FakeYouTubeLayout
        open={youtubeMockOpen}
        onClose={() => setYoutubeMockOpen(false)}
      />

      <style>{`
        @keyframes borderPulse{0%,100%{opacity:0.9}50%{opacity:0.15}}
        @keyframes alarmBorder{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,30,30,0)}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,30,30,0.4)}}
        @keyframes phoneAlarmBorder{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,140,0,0)}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,140,0,0.45)}}
        @keyframes phoneBg{0%{background:rgba(0,0,0,0.72)}100%{background:rgba(60,25,0,0.82)}}
        @keyframes smokingBorder{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,60,0,0)}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,60,0,0.45)}}
        @keyframes smokingBg{0%{background:rgba(0,0,0,0.72)}100%{background:rgba(50,10,0,0.85)}}
        @keyframes smokingBorder{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,60,0,0)}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,60,0,0.45)}}
        @keyframes smokingBg{0%{background:rgba(0,0,0,0.72)}100%{background:rgba(50,15,0,0.82)}}
        @keyframes glow{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes loadBar{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
        @keyframes drowsyBg{0%{background:rgba(0,0,0,0.75)}100%{background:rgba(90,0,0,0.85)}}
        @keyframes iconBounce{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.1)}}
        @keyframes textFlash{0%,100%{opacity:1;letter-spacing:0.1em}50%{opacity:0.75;letter-spacing:0.15em}}
        @keyframes badgePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:0.8}}
        @keyframes cornerFlash{0%,100%{opacity:0.35}50%{opacity:0.8}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#000}
        ::-webkit-scrollbar-thumb{background:#1a3a50;border-radius:2px}
      `}</style>
    </div>
  );
}
