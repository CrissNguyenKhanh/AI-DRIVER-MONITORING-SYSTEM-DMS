import React, { useEffect, useRef } from "react";

/**
 * PhoneFOMOOverlay - Overlay cảnh báo sử dụng điện thoại
 * @param {Object} props
 * @param {React.RefObject} props.phoneDetectionRef - Ref chứa trạng thái phát hiện điện thoại
 * @param {React.RefObject} props.landmarksRef - Ref landmarks để tính fallback box
 * @param {React.RefObject} props.videoRef - Ref video element để lấy kích thước
 */
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
          fallback: false,
        };
      }

      if (!tb) tb = getFallbackBox(landmarksRef.current, W, H);
      if (!tb) return;

      const LR = tb.fallback ? 0.05 : 0.2;
      if (!smoothBoxRef.current) {
        smoothBoxRef.current = { ...tb };
      } else {
        smoothBoxRef.current.x = lerp(smoothBoxRef.current.x, tb.x, LR);
        smoothBoxRef.current.y = lerp(smoothBoxRef.current.y, tb.y, LR);
        smoothBoxRef.current.w = lerp(smoothBoxRef.current.w, tb.w, LR);
        smoothBoxRef.current.h = lerp(smoothBoxRef.current.h, tb.h, LR);
      }

      const { x, y, w, h } = smoothBoxRef.current;

      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, `rgba(255,200,60,${0.1 + 0.08 * pulse})`);
      grad.addColorStop(1, `rgba(255,140,0,${0.15 + 0.1 * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

      ctx.strokeStyle = `rgba(255,200,60,${0.6 + 0.25 * pulse})`;
      ctx.lineWidth = 2 + pulse * 0.5;
      ctx.strokeRect(x, y, w, h);

      drawBrackets(ctx, x, y, w, h, "rgba(255,230,100,0.9)", 16, 2);

      ctx.font = "bold 11px monospace";
      const label = "PHONE";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,200,60,0.9)";
      if (ctx.roundRect) ctx.roundRect(x, y - 18, tw + 10, 16, 3);
      else ctx.rect(x, y - 18, tw + 10, 16);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.fillText(label, x + 5, y - 5);
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

export default PhoneFOMOOverlay;
