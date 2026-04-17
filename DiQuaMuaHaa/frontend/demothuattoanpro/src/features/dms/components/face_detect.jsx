import React, { useEffect, useRef, useState, useCallback } from "react";
import { getDmsApiBase } from "../../../shared/constants/apiEndpoints";
import { getWebcamSupportErrorMessage } from "../../../shared/utils/cameraContext";
import { speakOwnerGreeting, warmSpeechVoices } from "../../../shared/utils/speakOwnerGreeting";

const API_BASE = getDmsApiBase();
const API_INTERVAL_MS = 900;
const BURST_GAP_MS = 120;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const [apiError, setApiError] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [faceVisible, setFaceVisible] = useState(true);
  const [verifyStatus, setVerifyStatus] = useState("IDLE");

  // Identity state (from /api/identity/verify)
  const [hasRegistered, setHasRegistered] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [similarity, setSimilarity] = useState(null);
  const [simThreshold, setSimThreshold] = useState(0.9);
  const [smoothSimilarity, setSmoothSimilarity] = useState(null);
  const [ownerFaceImage, setOwnerFaceImage] = useState(null);
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID);

  const [isScanning, setIsScanning] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const similarityBufferRef = useRef([]);
  const lastDecisionRef = useRef(null);
  const ownerWelcomeSpokenRef = useRef(false);

  // Load saved driver image & id from localStorage (just UI, not the signature)
  useEffect(() => {
    warmSpeechVoices();
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

  useEffect(() => {
    ownerWelcomeSpokenRef.current = false;
  }, [driverId]);

  const startWebcam = async () => {
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

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    // Downscale ảnh để giảm size base64, tránh lỗi payload quá lớn
    const maxW = 480;
    const scale = Math.min(1, maxW / video.videoWidth);
    const targetW = Math.max(1, Math.round(video.videoWidth * scale));
    const targetH = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    return canvas.toDataURL("image/jpeg", 0.75);
  }, []);

  const captureBurstFrames = useCallback(
    async (count = 2) => {
      const frames = [];
      for (let i = 0; i < count; i += 1) {
        const frame = captureCurrentFrame();
        if (frame) frames.push(frame);
        if (i < count - 1) await sleep(BURST_GAP_MS);
      }
      return frames;
    },
    [captureCurrentFrame],
  );

  // Polling loop: only identity verification
  useEffect(() => {
    if (status !== "active") return;
    let cancelled = false,
      timeoutId;
    const loop = async () => {
      if (cancelled) return;

      if (!hasRegistered) {
        setVerifyStatus("WAIT_REGISTER");
        if (!cancelled) timeoutId = setTimeout(loop, API_INTERVAL_MS);
        return;
      }

      const frames = await captureBurstFrames(2);
      if (frames.length === 0) {
        if (!cancelled) timeoutId = setTimeout(loop, API_INTERVAL_MS);
        return;
      }

      try {
        setVerifyLoading(true);
        setApiError("");
        setVerifyStatus("VERIFYING");
        setLastUpdated(new Date().toLocaleTimeString());

        const vRes = await fetch(`${API_BASE}/api/identity/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driver_id: driverId,
            images: frames,
          }),
        });
        const vData = await vRes.json();

        if (!vRes.ok) {
          const msg = String(vData?.error || "Xác thực thất bại");
          if (msg.toLowerCase().includes("không detect được khuôn mặt")) {
            setFaceVisible(false);
            setVerifyStatus("NO_FACE");
          } else {
            setApiError(msg);
            setVerifyStatus("ERROR");
          }
        } else if (vData.error) {
          setApiError(vData.error);
          setVerifyStatus("ERROR");
        } else {
          setFaceVisible(true);
          setHasRegistered(Boolean(vData.has_registered));

          if (!vData.has_registered) {
            setVerifyStatus("WAIT_REGISTER");
            setSimilarity(null);
            setSmoothSimilarity(null);
            similarityBufferRef.current = [];
          } else {
            if (vData.threshold != null) setSimThreshold(vData.threshold);
            const simValue =
              typeof vData.similarity === "number" ? vData.similarity : null;
            setSimilarity(simValue);

            if (simValue !== null) {
              const buf = similarityBufferRef.current.slice(-11);
              buf.push(simValue);
              similarityBufferRef.current = buf;
              const avg = buf.reduce((acc, v) => acc + v, 0) / buf.length;
              setSmoothSimilarity(avg);

              const baseThreshold = vData.threshold ?? simThreshold;
              const highThresh = baseThreshold + 0.02;
              const lowThresh = baseThreshold - 0.03;
              const prev = lastDecisionRef.current ?? Boolean(vData.is_owner);

              let nextDecision = prev;
              if (avg >= highThresh) nextDecision = true;
              else if (avg <= lowThresh) nextDecision = false;

              lastDecisionRef.current = nextDecision;
              setIsOwner(nextDecision);
              setVerifyStatus(nextDecision ? "OWNER" : "INTRUDER");

              if (nextDecision && !prev && !ownerWelcomeSpokenRef.current) {
                ownerWelcomeSpokenRef.current = true;
                speakOwnerGreeting(
                  vData.registered_name || driverId,
                );
              }
              if (!nextDecision) ownerWelcomeSpokenRef.current = false;
            }
          }
        }
      } catch (err) {
        setApiError(err.message || "Lỗi kết nối API");
        setVerifyStatus("ERROR");
      } finally {
        setVerifyLoading(false);
      }
      if (!cancelled) timeoutId = setTimeout(loop, API_INTERVAL_MS);
    };
    loop();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [status, hasRegistered, driverId, captureBurstFrames, simThreshold]);

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

    const frames = await captureBurstFrames(3);
    const imageBase64 = frames[0];
    if (!imageBase64) {
      setApiError("Không lấy được khung hình từ webcam.");
      return;
    }

    setRegisterLoading(true);
    setApiError("");
    try {
      const res = await fetch(`${API_BASE}/api/identity/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: driverId,
          name: driverId,
          images: frames,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || "Đăng ký thất bại");

      setOwnerFaceImage(imageBase64);
      setHasRegistered(true);
      setIsOwner(true);
      setSimilarity(1);
      setSmoothSimilarity(1);
      setFaceVisible(true);
      setVerifyStatus("OWNER");
      similarityBufferRef.current = [1];
      lastDecisionRef.current = true;
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
  }, [driverId, captureBurstFrames]);

  const handleClearOwner = () => {
    setHasRegistered(false);
    setIsOwner(false);
    setSimilarity(null);
    setSmoothSimilarity(null);
    setFaceVisible(true);
    setVerifyStatus("WAIT_REGISTER");
    similarityBufferRef.current = [];
    lastDecisionRef.current = null;
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
                    <PulseDot color={verifyLoading ? "#facc15" : "#00ffa0"} />
                    <span
                      style={{
                        color: "#00ffa0",
                        fontSize: 9,
                        letterSpacing: "0.15em",
                      }}
                    >
                      {verifyLoading ? "VERIFYING..." : "FEED ACTIVE"}
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

            {/* Verification telemetry */}
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
                VERIFICATION TELEMETRY
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "VERIFY STATUS", value: verifyStatus },
                  {
                    label: "FACE IN FRAME",
                    value: faceVisible ? "YES" : "NO",
                    color: faceVisible ? "#22c55e" : "#f97316",
                  },
                  {
                    label: "RAW SIMILARITY",
                    value:
                      typeof similarity === "number"
                        ? `${(similarity * 100).toFixed(2)}%`
                        : "--",
                  },
                  {
                    label: "SMOOTHED SIMILARITY",
                    value:
                      typeof smoothSimilarity === "number"
                        ? `${(smoothSimilarity * 100).toFixed(2)}%`
                        : "--",
                  },
                  {
                    label: "DECISION",
                    value: hasRegistered ? (isOwner ? "OWNER" : "INTRUDER") : "NO DATA",
                    color: !hasRegistered ? "#64748b" : isOwner ? "#00ffa0" : "#ff4444",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#07101f",
                      border: "1px solid #12233a",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#1e4d3a",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: color || "#cbd5e1",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
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
                  { label: "MODEL", value: "Face Identity Verification" },
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
