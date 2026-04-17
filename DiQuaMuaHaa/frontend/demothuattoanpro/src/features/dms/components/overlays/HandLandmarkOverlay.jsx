import React, { useEffect, useRef } from "react";
import { HAND_CONNECTIONS } from "../../utils/visionMath.utils";

// HandLandmarkOverlay — MediaPipe Hands (mirror theo video scaleX(-1))
function HandLandmarkOverlay({ handLandmarksRef, videoRef }) {
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
  }, [videoRef]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    const lineColors = [
      "rgba(0, 255, 180, 0.88)",
      "rgba(255, 130, 220, 0.88)",
    ];
    const dotColors = [
      "rgba(220, 255, 245, 0.95)",
      "rgba(255, 230, 250, 0.95)",
    ];
    function draw() {
      rafId = requestAnimationFrame(draw);
      const vid = videoRef.current;
      if (!vid || !canvas) return;
      const W = canvas.width,
        H = canvas.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const hands = handLandmarksRef.current;
      if (!hands || !hands.length) return;
      const mx = (x) => W - x * W,
        my = (y) => y * H;
      hands.forEach((lm, hi) => {
        if (!lm || !lm.length) return;
        const lc = lineColors[hi % lineColors.length],
          dc = dotColors[hi % dotColors.length];
        ctx.strokeStyle = lc;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        HAND_CONNECTIONS.forEach(([a, b]) => {
          const pa = lm[a],
            pb = lm[b];
          if (!pa || !pb) return;
          ctx.beginPath();
          ctx.moveTo(mx(pa.x), my(pa.y));
          ctx.lineTo(mx(pb.x), my(pb.y));
          ctx.stroke();
        });
        lm.forEach((p) => {
          if (!p) return;
          ctx.beginPath();
          ctx.arc(mx(p.x), my(p.y), 2.4, 0, Math.PI * 2);
          ctx.fillStyle = dc;
          ctx.fill();
        });
      });
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, [handLandmarksRef, videoRef]);
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9,
      }}
    />
  );
}

export default HandLandmarkOverlay;
