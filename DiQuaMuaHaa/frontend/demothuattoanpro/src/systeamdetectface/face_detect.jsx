import React, { useEffect, useRef, useState, useCallback } from "react";

const API_BASE = "http://localhost:8000";
const API_INTERVAL_MS = 1200;
const DRIVER_ID_KEY = "driver_owner_id_v1";
const DRIVER_IMAGE_KEY = "driver_owner_image_v1";
const DEFAULT_DRIVER_ID = "driver_001";

// Radar scan canvas overlay
function RadarScanOverlay({ scanning, onComplete }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (!scanning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = canvas.offsetWidth);
    const H = (canvas.height = canvas.offsetHeight);
    const cx = W / 2,
      cy = H / 2;
    const duration = 1800;
    startRef.current = performance.now();

    const draw = (now) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, W, H);

      // Dark overlay with hole
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);

      // Face oval cutout
      const rx = W * 0.28,
        ry = H * 0.42;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Oval border glow
      const phase = progress;
      const glowOpacity = 0.7 + 0.3 * Math.sin(phase * Math.PI * 6);
      ctx.save();
      ctx.strokeStyle = `rgba(0,255,160,${glowOpacity})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#00ffa0";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Corner brackets
      const corners = [
        [-rx * 0.85, -ry * 0.88],
        [rx * 0.85, -ry * 0.88],
        [-rx * 0.85, ry * 0.88],
        [rx * 0.85, ry * 0.88],
      ];
      corners.forEach(([bx, by]) => {
        ctx.save();
        ctx.strokeStyle = `rgba(0,255,160,${0.9})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = "#00ffa0";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        const sx = bx > 0 ? 1 : -1,
          sy = by > 0 ? 1 : -1;
        ctx.moveTo(cx + bx, cy + by - sy * 18);
        ctx.lineTo(cx + bx, cy + by);
        ctx.lineTo(cx + bx - sx * 18, cy + by);
        ctx.stroke();
        ctx.restore();
      });

      // Horizontal scan beam sweeping top → bottom
      const scanY = cy - ry + progress * 2 * ry;
      const gradH = ctx.createLinearGradient(
        cx - rx,
        scanY - 40,
        cx - rx,
        scanY + 10,
      );
      gradH.addColorStop(0, "rgba(0,255,160,0)");
      gradH.addColorStop(0.6, "rgba(0,255,160,0.18)");
      gradH.addColorStop(1, "rgba(0,255,160,0.72)");

      ctx.save();
      // Clip to ellipse
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = gradH;
      ctx.fillRect(cx - rx, scanY - 40, rx * 2, 50);

      // Scan line
      ctx.strokeStyle = `rgba(0,255,160,0.95)`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#00ffa0";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(cx - rx, scanY);
      ctx.lineTo(cx + rx, scanY);
      ctx.stroke();

      // Sparkles along scan line
      for (let i = 0; i < 6; i++) {
        const px = cx - rx + (rx * 2 * i) / 5 + Math.sin(now * 0.01 + i) * 12;
        const py = scanY + Math.cos(now * 0.015 + i) * 4;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,255,220,${0.6 + 0.4 * Math.sin(now * 0.02 + i)})`;
        ctx.fill();
      }

      ctx.restore();

      // Measurement grid lines
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(0,255,160,0.06)";
      ctx.lineWidth = 1;
      for (let y = cy - ry; y < cy + ry; y += 18) {
        ctx.beginPath();
        ctx.moveTo(cx - rx, y);
        ctx.lineTo(cx + rx, y);
        ctx.stroke();
      }
      for (let x = cx - rx; x < cx + rx; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, cy - ry);
        ctx.lineTo(x, cy + ry);
        ctx.stroke();
      }
      ctx.restore();

      // Data readout labels
      const labels = [
        { x: cx - rx - 8, y: cy - ry * 0.3, text: "IRIS", align: "right" },
        { x: cx - rx - 8, y: cy + ry * 0.2, text: "JAW", align: "right" },
        { x: cx + rx + 8, y: cy - ry * 0.3, text: "BROW", align: "left" },
        { x: cx + rx + 8, y: cy + ry * 0.2, text: "CHIN", align: "left" },
      ];
      labels.forEach(({ x, y, text, align }) => {
        const labelProgress = Math.min(elapsed / 800, 1);
        ctx.save();
        ctx.globalAlpha = labelProgress;
        ctx.font = "bold 10px 'Courier New', monospace";
        ctx.fillStyle = "#00ffa0";
        ctx.shadowColor = "#00ffa0";
        ctx.shadowBlur = 8;
        ctx.textAlign = align;
        ctx.fillText(text, x, y);
        const lineLen = 20;
        ctx.strokeStyle = "rgba(0,255,160,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (align === "right") {
          ctx.moveTo(x + 4, y - 2);
          ctx.lineTo(x + lineLen + 4, y - 2);
        } else {
          ctx.moveTo(x - 4, y - 2);
          ctx.lineTo(x - lineLen - 4, y - 2);
        }
        ctx.stroke();
        ctx.restore();
      });

      // Percent readout
      const pct = Math.floor(progress * 100);
      ctx.save();
      ctx.font = "bold 13px 'Courier New', monospace";
      ctx.fillStyle = "#00ffa0";
      ctx.shadowColor = "#00ffa0";
      ctx.shadowBlur = 12;
      ctx.textAlign = "center";
      ctx.fillText(`SCANNING ${pct}%`, cx, cy + ry + 28);
      ctx.restore();

      if (progress < 1) {
        animRef.current = requestAnimationFrame(draw);
      } else {
        // Flash complete
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "rgba(0,255,160,0.15)";
        ctx.fillRect(0, 0, W, H);
        setTimeout(() => {
          ctx.clearRect(0, 0, W, H);
          onComplete && onComplete();
        }, 200);
      }
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [scanning, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
}

// Animated similarity ring
function SimilarityRing({ value, threshold }) {
  const r = 38,
    stroke = 5;
  const circ = 2 * Math.PI * r;
  const pct = value ?? 0;
  const dash = circ * pct;
  const isOwner = pct >= threshold;
  const color = !value ? "#475569" : isOwner ? "#00ffa0" : "#ff4444";

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="drop-shadow-lg">
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#1e293b"
        strokeWidth={stroke + 2}
      />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#0f172a"
        strokeWidth={stroke}
      />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        style={{
          filter: `drop-shadow(0 0 6px ${color})`,
          transition: "stroke-dasharray 0.4s ease, stroke 0.4s ease",
        }}
      />
      <text
        x="48"
        y="44"
        textAnchor="middle"
        fill={color}
        fontSize="13"
        fontWeight="bold"
        fontFamily="'Courier New', monospace"
      >
        {value !== null ? `${(pct * 100).toFixed(0)}%` : "--"}
      </text>
      <text
        x="48"
        y="58"
        textAnchor="middle"
        fill="#64748b"
        fontSize="7"
        fontFamily="'Courier New', monospace"
      >
        MATCH
      </text>
    </svg>
  );
}

// Pulse dot
function PulseDot({ color = "#00ffa0" }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

export default function FaceDetect() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [apiResult, setApiResult] = useState(null); // predict_from_frame result
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Identity state (from /api/identity/verify)
  const [hasRegistered, setHasRegistered] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [similarity, setSimilarity] = useState(null);
  const [simThreshold, setSimThreshold] = useState(0.9);
  const [ownerFaceImage, setOwnerFaceImage] = useState(null);
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID);

  const [isScanning, setIsScanning] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Load saved driver image & id from localStorage (just UI, not the signature)
  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(DRIVER_ID_KEY);
      if (savedId) setDriverId(savedId);
      const savedImg = window.localStorage.getItem(DRIVER_IMAGE_KEY);
      if (savedImg) {
        setOwnerFaceImage(savedImg);
        setHasRegistered(true);
      }
    } catch {}
  }, []);

  const startWebcam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("Trình duyệt không hỗ trợ webcam");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("active");
    } catch (err) {
      setErrorMsg(err.message || "Không thể mở webcam");
      setStatus("error");
    }
  };

  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  };

  useEffect(() => {
    startWebcam();
    return () => stopWebcam();
  }, []);

  // Polling loop: predict_from_frame + identity/verify
  useEffect(() => {
    if (status !== "active") return;
    let cancelled = false,
      timeoutId;
    const loop = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        if (!cancelled) timeoutId = setTimeout(loop, API_INTERVAL_MS);
        return;
      }
      try {
        setApiLoading(true);
        setApiError("");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

        // 1) predict face state (drowsy/safe/yawning)
        const res = await fetch(`${API_BASE}/api/landmark/predict_from_frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageBase64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Gọi API predict thất bại");
        setApiResult(data);
        setLastUpdated(new Date().toLocaleTimeString());

        // 2) verify identity (only if registered)
        if (hasRegistered) {
          const vRes = await fetch(`${API_BASE}/api/identity/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driver_id: driverId, image: imageBase64 }),
          });
          const vData = await vRes.json();
          if (vRes.ok && !vData.error) {
            setHasRegistered(vData.has_registered);
            setIsOwner(vData.is_owner);
            setSimilarity(vData.similarity);
            if (vData.threshold != null) setSimThreshold(vData.threshold);
          }
        }
      } catch (err) {
        setApiError(err.message);
      } finally {
        setApiLoading(false);
      }
      if (!cancelled) timeoutId = setTimeout(loop, API_INTERVAL_MS);
    };
    loop();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [status, hasRegistered, driverId]);

  const handleRegisterOwner = () => {
    if (status !== "active") {
      setApiError("Hãy bật webcam trước.");
      return;
    }
    setIsScanning(true);
  };

  const handleScanComplete = useCallback(async () => {
    setIsScanning(false);
    const video = videoRef.current;
    if (!video) return;

    // Capture current frame
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 640;
    c.height = video.videoHeight || 360;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    const imageBase64 = c.toDataURL("image/jpeg", 0.9);

    setRegisterLoading(true);
    setApiError("");
    try {
      const res = await fetch(`${API_BASE}/api/identity/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: driverId,
          name: driverId,
          image: imageBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || "Đăng ký thất bại");

      setOwnerFaceImage(imageBase64);
      setHasRegistered(true);
      setIsOwner(true);
      setSimilarity(1);
      setRegistered(true);
      try {
        window.localStorage.setItem(DRIVER_ID_KEY, driverId);
        window.localStorage.setItem(DRIVER_IMAGE_KEY, imageBase64);
      } catch {}
      setTimeout(() => setRegistered(false), 3000);
    } catch (err) {
      setApiError(`Đăng ký thất bại: ${err.message}`);
    } finally {
      setRegisterLoading(false);
    }
  }, [driverId]);

  const handleClearOwner = () => {
    setHasRegistered(false);
    setIsOwner(false);
    setSimilarity(null);
    setOwnerFaceImage(null);
    try {
      window.localStorage.removeItem(DRIVER_ID_KEY);
      window.localStorage.removeItem(DRIVER_IMAGE_KEY);
    } catch {}
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #020817 0%, #0a1628 40%, #0d1f3c 100%)",
        fontFamily: "'Courier New', monospace",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background grid */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.04,
          backgroundImage:
            "linear-gradient(#00ffa0 1px, transparent 1px), linear-gradient(90deg, #00ffa0 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      {/* Glow orb */}
      <div
        style={{
          position: "fixed",
          top: "-20%",
          right: "-10%",
          width: "600px",
          height: "600px",
          background:
            "radial-gradient(circle, rgba(0,100,60,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "28px 20px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 32,
                  background: "#00ffa0",
                  borderRadius: 4,
                  boxShadow: "0 0 12px #00ffa0",
                }}
              />
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#e2f0e8",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                Driver Identity <span style={{ color: "#00ffa0" }}>Auth</span>
              </h1>
            </div>
            <p
              style={{
                color: "#334155",
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                marginLeft: 18,
              }}
            >
              FACE LANDMARK VERIFICATION SYSTEM v2.1
            </p>
          </div>
          {/* Live clock + driver id input */}
          <div
            style={{
              textAlign: "right",
              color: "#1e4d3a",
              fontSize: 10,
              letterSpacing: "0.1em",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "flex-end",
                marginBottom: 6,
              }}
            >
              <span style={{ color: "#1e3a2a", letterSpacing: "0.1em" }}>
                DRIVER ID:
              </span>
              <input
                value={driverId}
                onChange={(e) =>
                  setDriverId(e.target.value.trim() || DEFAULT_DRIVER_ID)
                }
                style={{
                  background: "#0a1628",
                  border: "1px solid #1e3a2a",
                  borderRadius: 6,
                  color: "#00ffa0",
                  fontSize: 10,
                  padding: "3px 8px",
                  width: 110,
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: "0.05em",
                  outline: "none",
                }}
              />
            </div>
            <div>
              {lastUpdated ? `LAST UPDATE: ${lastUpdated}` : "AWAITING FEED"}
            </div>
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "flex-end",
              }}
            >
              {status === "active" && (
                <>
                  <PulseDot color="#00ffa0" />
                  <span style={{ color: "#00ffa0" }}>LIVE</span>
                </>
              )}
              {status !== "active" && (
                <span style={{ color: "#475569" }}>OFFLINE</span>
              )}
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}
        >
          {/* LEFT: Video */}
          <div>
            <div
              style={{
                background: "#030a14",
                border: "1px solid #0f2a1a",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow:
                  "0 0 40px rgba(0,255,160,0.06), 0 20px 60px rgba(0,0,0,0.6)",
                position: "relative",
              }}
            >
              {/* Video area */}
              <div
                style={{
                  position: "relative",
                  aspectRatio: "16/9",
                  background: "#000",
                }}
              >
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
                  }}
                />

                {/* HUD corners */}
                {status === "active" && (
                  <>
                    {[
                      {
                        top: 12,
                        left: 12,
                        borderTop: "2px solid #00ffa0",
                        borderLeft: "2px solid #00ffa0",
                      },
                      {
                        top: 12,
                        right: 12,
                        borderTop: "2px solid #00ffa0",
                        borderRight: "2px solid #00ffa0",
                      },
                      {
                        bottom: 12,
                        left: 12,
                        borderBottom: "2px solid #00ffa0",
                        borderLeft: "2px solid #00ffa0",
                      },
                      {
                        bottom: 12,
                        right: 12,
                        borderBottom: "2px solid #00ffa0",
                        borderRight: "2px solid #00ffa0",
                      },
                    ].map((s, i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          width: 20,
                          height: 20,
                          boxShadow: "0 0 8px rgba(0,255,160,0.5)",
                          ...s,
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Radar scan overlay */}
                <RadarScanOverlay
                  scanning={isScanning}
                  onComplete={handleScanComplete}
                />

                {/* Success flash */}
                {registered && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,255,160,0.08)",
                      zIndex: 20,
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(0,20,12,0.92)",
                        border: "1px solid #00ffa0",
                        borderRadius: 12,
                        padding: "16px 32px",
                        textAlign: "center",
                        boxShadow: "0 0 40px rgba(0,255,160,0.4)",
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 4 }}>✓</div>
                      <div
                        style={{
                          color: "#00ffa0",
                          fontWeight: 900,
                          fontSize: 14,
                          letterSpacing: "0.12em",
                        }}
                      >
                        IDENTITY REGISTERED
                      </div>
                      <div
                        style={{ color: "#4ade80", fontSize: 10, marginTop: 4 }}
                      >
                        SIGNATURE STORED SECURELY
                      </div>
                    </div>
                  </div>
                )}

                {/* Status overlays */}
                {status === "loading" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.85)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        border: "3px solid #0f2a1a",
                        borderTop: "3px solid #00ffa0",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span
                      style={{
                        color: "#00ffa0",
                        fontSize: 11,
                        letterSpacing: "0.15em",
                      }}
                    >
                      INITIALIZING CAMERA...
                    </span>
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
                      padding: 20,
                    }}
                  >
                    <span
                      style={{
                        color: "#ff4444",
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                      }}
                    >
                      ⚠ CAMERA ACCESS DENIED
                    </span>
                    <span
                      style={{
                        color: "#7f1d1d",
                        fontSize: 10,
                        textAlign: "center",
                      }}
                    >
                      {errorMsg}
                    </span>
                    <button
                      onClick={startWebcam}
                      style={{
                        padding: "8px 20px",
                        background: "transparent",
                        border: "1px solid #ff4444",
                        color: "#ff4444",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 11,
                        letterSpacing: "0.1em",
                      }}
                    >
                      RETRY
                    </button>
                  </div>
                )}

                {/* Live indicator */}
                {status === "active" && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(0,0,0,0.7)",
                      border: "1px solid #0f2a1a",
                      borderRadius: 20,
                      padding: "4px 12px",
                    }}
                  >
                    <PulseDot color={apiLoading ? "#facc15" : "#00ffa0"} />
                    <span
                      style={{
                        color: "#00ffa0",
                        fontSize: 9,
                        letterSpacing: "0.15em",
                      }}
                    >
                      {apiLoading ? "ANALYZING..." : "FEED ACTIVE"}
                    </span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div
                style={{
                  padding: "14px 16px",
                  borderTop: "1px solid #0f2a1a",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={handleRegisterOwner}
                  disabled={
                    status !== "active" || isScanning || registerLoading
                  }
                  style={{
                    flex: 1,
                    padding: "10px 20px",
                    borderRadius: 10,
                    background:
                      status !== "active"
                        ? "transparent"
                        : "linear-gradient(135deg, #00ffa0 0%, #00cc7a 100%)",
                    border: status !== "active" ? "1px solid #1e3a2a" : "none",
                    color: status !== "active" ? "#1e4d3a" : "#001a0f",
                    fontWeight: 900,
                    fontSize: 12,
                    letterSpacing: "0.1em",
                    cursor: status !== "active" ? "not-allowed" : "pointer",
                    textTransform: "uppercase",
                    boxShadow:
                      status === "active"
                        ? "0 0 20px rgba(0,255,160,0.3)"
                        : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {isScanning
                    ? "⟳ SCANNING..."
                    : registerLoading
                      ? "⟳ REGISTERING..."
                      : "⊕ Register Owner Face"}
                </button>
                {hasRegistered && (
                  <button
                    onClick={handleClearOwner}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      background: "transparent",
                      border: "1px solid #3f1515",
                      color: "#7f1d1d",
                      cursor: "pointer",
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      fontWeight: 700,
                    }}
                  >
                    ✕ CLEAR
                  </button>
                )}
              </div>
            </div>

            {/* API error */}
            {apiError && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  background: "rgba(60,0,0,0.6)",
                  border: "1px solid #3f1515",
                  borderRadius: 10,
                  color: "#ff6666",
                  fontSize: 11,
                }}
              >
                ⚠ {apiError}
              </div>
            )}
          </div>

          {/* RIGHT PANEL */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Identity status card */}
            <div
              style={{
                background: "#030a14",
                border: `1px solid ${hasRegistered ? (isOwner ? "#00ff9030" : "#ff000030") : "#0f2a1a"}`,
                borderRadius: 16,
                padding: 20,
                boxShadow: hasRegistered
                  ? isOwner
                    ? "0 0 30px rgba(0,255,160,0.08)"
                    : "0 0 30px rgba(255,0,0,0.08)"
                  : "none",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.2em",
                  color: "#1e4d3a",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                IDENTITY STATUS
              </div>

              {/* Ring + avatar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  position: "relative",
                  marginBottom: 16,
                }}
              >
                <div style={{ position: "relative" }}>
                  <SimilarityRing value={similarity} threshold={simThreshold} />
                  {ownerFaceImage && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: `2px solid ${isOwner ? "#00ffa0" : "#ff4444"}`,
                        boxShadow: `0 0 16px ${isOwner ? "rgba(0,255,160,0.6)" : "rgba(255,68,68,0.6)"}`,
                      }}
                    >
                      <img
                        src={ownerFaceImage}
                        alt="owner"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  )}
                  {!ownerFaceImage && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        background: "#0a1628",
                        border: "1px solid #1e3a2a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#1e4d3a",
                        fontSize: 18,
                      }}
                    >
                      ?
                    </div>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 16px",
                    borderRadius: 8,
                    background: !hasRegistered
                      ? "rgba(30,50,40,0.4)"
                      : isOwner
                        ? "rgba(0,255,160,0.12)"
                        : "rgba(255,68,68,0.12)",
                    border: `1px solid ${!hasRegistered ? "#1e3a2a" : isOwner ? "#00ffa060" : "#ff444460"}`,
                    color: !hasRegistered
                      ? "#1e4d3a"
                      : isOwner
                        ? "#00ffa0"
                        : "#ff4444",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {!hasRegistered
                    ? "NO DATA"
                    : isOwner
                      ? "✓ OWNER"
                      : "✗ INTRUDER"}
                </div>

                {typeof similarity === "number" && hasRegistered && (
                  <div
                    style={{ marginTop: 10, fontSize: 10, color: "#334155" }}
                  >
                    THRESHOLD:{" "}
                    <span style={{ color: "#475569" }}>
                      {(simThreshold * 100).toFixed(0)}%
                    </span>
                    {" · "}SCORE:{" "}
                    <span style={{ color: isOwner ? "#00ffa0" : "#ff4444" }}>
                      {(similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              {!hasRegistered && (
                <p
                  style={{
                    marginTop: 14,
                    fontSize: 9,
                    color: "#1e3a2a",
                    textAlign: "center",
                    lineHeight: 1.6,
                    letterSpacing: "0.05em",
                  }}
                >
                  STAND IN FRONT OF CAMERA
                  <br />
                  THEN CLICK REGISTER BUTTON
                </p>
              )}
            </div>

            {/* Probability vector */}
            <div
              style={{
                background: "#030a14",
                border: "1px solid #0f2a1a",
                borderRadius: 16,
                padding: 18,
                flex: 1,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.2em",
                  color: "#1e4d3a",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                FACE STATE VECTOR
              </div>

              {apiResult?.scores && Object.keys(apiResult.scores).length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {Object.entries(apiResult.scores)
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, value]) => {
                      const pct = value * 100;
                      const isTop =
                        pct ===
                        Math.max(...Object.values(apiResult.scores)) * 100;
                      return (
                        <div key={key}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: 5,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 9,
                                color: isTop ? "#00ffa0" : "#334155",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                fontWeight: isTop ? 700 : 400,
                              }}
                            >
                              {key}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                color: isTop ? "#00ffa0" : "#475569",
                                fontWeight: 700,
                              }}
                            >
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <div
                            style={{
                              height: 3,
                              background: "#0a1628",
                              borderRadius: 2,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.min(100, pct)}%`,
                                background: isTop
                                  ? "linear-gradient(90deg, #00ffa0, #00cc7a)"
                                  : "linear-gradient(90deg, #1e3a2a, #0f2a1a)",
                                borderRadius: 2,
                                transition: "width 0.5s ease",
                                boxShadow: isTop
                                  ? "0 0 6px rgba(0,255,160,0.5)"
                                  : "none",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 10,
                    color: "#1e3a2a",
                    textAlign: "center",
                    padding: "20px 0",
                    letterSpacing: "0.1em",
                  }}
                >
                  AWAITING SIGNAL...
                </div>
              )}
            </div>

            {/* System info */}
            <div
              style={{
                background: "#030a14",
                border: "1px solid #0f2a1a",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "MODEL", value: "FaceMesh + Landmark" },
                  { label: "METHOD", value: "Cosine Similarity" },
                  { label: "DRIVER ID", value: driverId },
                  { label: "CAM STATUS", value: status.toUpperCase() },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 9,
                    }}
                  >
                    <span style={{ color: "#1e3a2a", letterSpacing: "0.12em" }}>
                      {label}
                    </span>
                    <span style={{ color: "#334155" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
