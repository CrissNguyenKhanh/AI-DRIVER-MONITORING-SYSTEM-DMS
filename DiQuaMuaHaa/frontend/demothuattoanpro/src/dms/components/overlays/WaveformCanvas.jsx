import React, { useRef, useEffect } from "react";
import { EAR_BLINK_THRESH, EAR_HISTORY } from "../../constants/dmsConfig";

/**
 * Vẽ biểu đồ lịch sử EAR dưới dạng bar chart với ngưỡng blink.
 * Props: earHistoryRef, side ("left" | "right"), color
 */
export default function WaveformCanvas({ earHistoryRef, side, color = "#1e90ff" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;

    function draw() {
      rafId = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

      const hist = earHistoryRef.current[side] || [];
      if (hist.length < 2) return;

      const bW = Math.max(1, (W / EAR_HISTORY) * 0.8);
      for (let i = 0; i < hist.length; i++) {
        const v = hist[i], x = (i / (EAR_HISTORY - 1)) * (W - 4) + 2;
        const bH = Math.min(H-2, Math.max(2, (v/0.5)*H));
        ctx.fillStyle = color;
        ctx.fillRect(x - bW/2, H - bH, bW, bH);
      }

      const ty = H - (EAR_BLINK_THRESH / 0.5) * H;
      ctx.beginPath(); ctx.setLineDash([3, 3]);
      ctx.moveTo(0, ty); ctx.lineTo(W, ty);
      ctx.strokeStyle = "rgba(255,200,60,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);
    }

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [side, color]);

  return React.createElement("canvas", {
    ref: canvasRef,
    width: 280, height: 50,
    style: { width: "100%", height: "100%", display: "block" },
  });
}
