import React, { useEffect, useRef } from "react";

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

      const now = Date.now();
      pulseRef.current = (pulseRef.current + 0.08) % (Math.PI * 2);
      const pulse = (Math.sin(pulseRef.current) + 1) / 2;

      // target box từ YOLO
      let targetBox = null;
      if (det.bbox && det.bbox.x1 != null) {
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

export default PhoneFOMOOverlay;
