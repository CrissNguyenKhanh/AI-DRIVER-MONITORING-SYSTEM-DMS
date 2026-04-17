import React, { useEffect, useRef } from "react";

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

export default SmokingFOMOOverlay;
