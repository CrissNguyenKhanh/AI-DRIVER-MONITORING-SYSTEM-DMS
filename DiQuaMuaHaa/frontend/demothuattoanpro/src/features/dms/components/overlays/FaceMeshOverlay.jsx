import React, { useEffect, useRef } from "react";
import { EAR_BLINK_THRESH } from "../../constants/monitor.constants";
import {
  L_EYE,
  R_EYE,
  LEFT_EYE_IDX,
  RIGHT_EYE_IDX,
  FACE_OVAL_IDX,
  LIPS_IDX,
} from "../../utils/visionMath.utils";

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

export default FaceMeshOverlay;
