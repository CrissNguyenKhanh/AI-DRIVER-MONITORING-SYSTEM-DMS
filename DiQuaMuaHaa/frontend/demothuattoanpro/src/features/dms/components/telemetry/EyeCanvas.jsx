import React, { useEffect, useRef } from "react";

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

export default EyeCanvas;
