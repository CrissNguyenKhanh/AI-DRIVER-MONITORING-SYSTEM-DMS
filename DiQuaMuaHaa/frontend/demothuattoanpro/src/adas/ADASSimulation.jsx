import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CirclePause,
  CirclePlay,
  Gauge,
  RotateCcw,
  Upload,
} from "lucide-react";
import { getDmsApiBase } from "../config/apiEndpoints";
import {
  clearDmsAuthSession,
  dmsAuthHeaders,
  getDmsAuthToken,
} from "../utils/authApi";
import {
  ADAS_CAPTURE_MAX_WIDTH,
  decisionLabel,
  shouldSubmitAdasFrame,
} from "./adasFrameScheduler";
import "./ADASSimulation.css";

const API_BASE = getDmsApiBase();
const DEMO_VIDEO_PATH = "/samples/road_demo.mp4";

function containRect(video, canvasWidth, canvasHeight) {
  const sourceWidth = video?.videoWidth || 16;
  const sourceHeight = video?.videoHeight || 9;
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  };
}

function drawOverlay(canvas, video, analysis) {
  if (!canvas || !video) return;
  const cssWidth = Math.max(1, video.clientWidth);
  const cssHeight = Math.max(1, video.clientHeight);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, cssWidth, cssHeight);
  if (!analysis) return;

  const rect = containRect(video, cssWidth, cssHeight);
  const point = (value) => ({
    x: rect.x + value.x * rect.width,
    y: rect.y + value.y * rect.height,
  });
  const strokePath = (points, color, width = 3, dashed = false) => {
    if (!points || points.length < 2) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.shadowColor = color;
    context.shadowBlur = 8;
    context.setLineDash(dashed ? [10, 7] : []);
    context.beginPath();
    points.forEach((item, index) => {
      const mapped = point(item);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.stroke();
    context.restore();
  };

  const corridor = analysis.lane?.corridor || [];
  if (corridor.length === 4) {
    const riskColor =
      analysis.risk?.level === "HIGH"
        ? "rgba(255, 55, 85, 0.23)"
        : analysis.risk?.level === "MEDIUM"
          ? "rgba(255, 190, 55, 0.18)"
          : "rgba(29, 255, 178, 0.13)";
    context.save();
    context.fillStyle = riskColor;
    context.beginPath();
    corridor.forEach((item, index) => {
      const mapped = point(item);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.closePath();
    context.fill();
    context.restore();
  }

  strokePath(analysis.lane?.left_lane, "#2fffb6", 4);
  strokePath(analysis.lane?.right_lane, "#2fffb6", 4);
  strokePath(analysis.lane?.lane_center, "rgba(255,255,255,0.78)", 2, true);

  for (const item of analysis.detections || []) {
    const box = item.bbox;
    if (!box) continue;
    const x = rect.x + box.x * rect.width;
    const y = rect.y + box.y * rect.height;
    const width = box.width * rect.width;
    const height = box.height * rect.height;
    const danger = item.risk_level === "DANGER";
    const caution = item.risk_level === "CAUTION";
    const color = danger ? "#ff365f" : caution ? "#ffbf3f" : "#57d8ff";
    context.save();
    context.strokeStyle = color;
    context.lineWidth = danger ? 4 : 3;
    context.strokeRect(x, y, width, height);
    context.fillStyle = "rgba(3, 10, 18, 0.82)";
    context.fillRect(x, Math.max(rect.y, y - 24), Math.max(112, width), 24);
    context.fillStyle = color;
    context.font = "700 12px system-ui";
    context.fillText(
      `${String(item.class || "OBJECT").toUpperCase()} ${Math.round((item.confidence || 0) * 100)}%`,
      x + 6,
      Math.max(rect.y + 16, y - 7),
    );
    context.restore();
  }

  const path = analysis.planned_path?.points || [];
  const pathColor = analysis.decision === "STOP" ? "#ff365f" : "#43a5ff";
  strokePath(path, pathColor, 5);
  const stop = analysis.planned_path?.stop_marker;
  if (stop) {
    const marker = point(stop);
    context.save();
    context.fillStyle = "#ff365f";
    context.beginPath();
    context.arc(marker.x, marker.y, 14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "white";
    context.font = "800 10px system-ui";
    context.textAlign = "center";
    context.fillText("STOP", marker.x, marker.y + 3);
    context.restore();
  }

  const egoX = rect.x + rect.width / 2;
  const egoY = rect.y + rect.height * 0.94;
  context.save();
  context.fillStyle = "rgba(3, 10, 18, 0.9)";
  context.strokeStyle = "#43a5ff";
  context.lineWidth = 2;
  context.fillRect(egoX - 22, egoY - 16, 44, 28);
  context.strokeRect(egoX - 22, egoY - 16, 44, 28);
  context.fillStyle = "#d9efff";
  context.font = "700 10px system-ui";
  context.textAlign = "center";
  context.fillText("EGO", egoX, egoY + 2);
  context.restore();
}

function riskClass(level) {
  return `adas-risk adas-risk--${String(level || "uncertain").toLowerCase()}`;
}

export default function ADASSimulation() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const animationRef = useRef(null);
  const inFlightRef = useRef(false);
  const runningRef = useRef(false);
  const lastSubmittedAtRef = useRef(0);
  const resetNextFrameRef = useRef(true);
  const abortRef = useRef(null);
  const runIdRef = useRef(0);
  const objectUrlRef = useRef(null);
  const analysisRef = useRef(null);

  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("No road video selected");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("IDLE");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const hasAuth = Boolean(getDmsAuthToken());

  const stopLoop = useCallback(({ pauseVideo = true } = {}) => {
    runningRef.current = false;
    setRunning(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    if (pauseVideo) videoRef.current?.pause();
  }, []);

  const submitFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const canvas = captureCanvasRef.current || document.createElement("canvas");
    captureCanvasRef.current = canvas;
    const scale = Math.min(1, ADAS_CAPTURE_MAX_WIDTH / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const currentRun = runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    setStatus("PROCESSING");
    try {
      const response = await fetch(`${API_BASE}/api/adas/process-frame`, {
        method: "POST",
        headers: dmsAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          image: canvas.toDataURL("image/jpeg", 0.72),
          reset: resetNextFrameRef.current,
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (currentRun !== runIdRef.current) return;
      if (response.status === 401) {
        clearDmsAuthSession();
        setError("DMS authorization expired. Enroll again before running ADAS.");
        setStatus("AUTHORIZATION REQUIRED");
        stopLoop();
        return;
      }
      if (response.status === 429) {
        setStatus("FRAME DROPPED — PROCESSOR BUSY");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Road frame processing failed");
      resetNextFrameRef.current = false;
      analysisRef.current = data;
      setAnalysis(data);
      setError("");
      setStatus("RUNNING — SIMULATION ONLY");
    } catch (requestError) {
      if (requestError.name !== "AbortError" && currentRun === runIdRef.current) {
        setError(requestError.message || "Road frame processing failed");
        setStatus("PROCESSING ERROR");
      }
    } finally {
      if (currentRun === runIdRef.current) {
        inFlightRef.current = false;
        abortRef.current = null;
      }
    }
  }, [stopLoop]);

  const frameLoop = useCallback(
    (now) => {
      if (!runningRef.current) return;
      animationRef.current = requestAnimationFrame(frameLoop);
      if (
        !shouldSubmitAdasFrame({
          running: runningRef.current,
          inFlight: inFlightRef.current,
          now,
          lastSubmittedAt: lastSubmittedAtRef.current,
        })
      ) {
        return;
      }
      lastSubmittedAtRef.current = now;
      void submitFrame();
    },
    [submitFrame],
  );

  const startSimulation = useCallback(async () => {
    if (!hasAuth) {
      setError("Authenticate a DMS driver before starting the protected ADAS simulation.");
      return;
    }
    const video = videoRef.current;
    if (!video || !sourceUrl) {
      setError("Select a road video first.");
      return;
    }
    try {
      await video.play();
      runIdRef.current += 1;
      runningRef.current = true;
      inFlightRef.current = false;
      lastSubmittedAtRef.current = 0;
      setRunning(true);
      setError("");
      setStatus("RUNNING — SIMULATION ONLY");
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(frameLoop);
    } catch {
      setError("Browser could not play this video format.");
      setStatus("VIDEO ERROR");
    }
  }, [frameLoop, hasAuth, sourceUrl]);

  const resetSimulation = useCallback(() => {
    stopLoop();
    if (videoRef.current) videoRef.current.currentTime = 0;
    resetNextFrameRef.current = true;
    analysisRef.current = null;
    setAnalysis(null);
    setError("");
    setStatus(sourceUrl ? "READY" : "IDLE");
    drawOverlay(overlayRef.current, videoRef.current, null);
  }, [sourceUrl, stopLoop]);

  const selectSource = useCallback(
    (url, name, objectUrl = null) => {
      stopLoop();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = objectUrl;
      setSourceUrl(url);
      setSourceName(name);
      setAnalysis(null);
      analysisRef.current = null;
      resetNextFrameRef.current = true;
      setError("");
      setStatus("READY");
    },
    [stopLoop],
  );

  useEffect(() => {
    drawOverlay(overlayRef.current, videoRef.current, analysis);
  }, [analysis]);

  useEffect(() => {
    const redraw = () => drawOverlay(overlayRef.current, videoRef.current, analysisRef.current);
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, []);

  useEffect(
    () => () => {
      runningRef.current = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      abortRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const lane = analysis?.lane;
  const detector = analysis?.object_detector;
  const metrics = analysis?.metrics;
  const risk = analysis?.risk;

  return (
    <main className="adas-page">
      <header className="adas-header">
        <div>
          <div className="adas-kicker">ROAD-FACING DRIVER ASSISTANCE VISUALIZATION</div>
          <h1>ADAS Road Simulation</h1>
          <p>Lane geometry, image-space obstacle risk and simulated path visualization.</p>
        </div>
        <div className="adas-simulation-badge">
          <AlertTriangle size={18} /> SIMULATION ONLY — NO VEHICLE CONTROL
        </div>
      </header>

      {!hasAuth && (
        <section className="adas-auth-warning">
          Protected endpoint requires a DMS driver session. <Link to="/test5">Enroll or authenticate here</Link>.
        </section>
      )}

      <section className="adas-controls" aria-label="Road video controls">
        <label className="adas-file-button">
          <Upload size={18} /> Select road video
          <input
            type="file"
            accept="video/mp4,video/webm,video/x-msvideo,.mp4,.webm,.avi"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              selectSource(url, file.name, url);
            }}
          />
        </label>
        <button
          type="button"
          className="adas-control-button"
          onClick={() => selectSource(DEMO_VIDEO_PATH, "public/samples/road_demo.mp4")}
        >
          Load local demo source
        </button>
        <button type="button" className="adas-control-button adas-control-button--start" onClick={startSimulation} disabled={running}>
          <CirclePlay size={18} /> Start
        </button>
        <button type="button" className="adas-control-button" onClick={() => stopLoop()} disabled={!running}>
          <CirclePause size={18} /> Pause
        </button>
        <button type="button" className="adas-control-button" onClick={resetSimulation}>
          <RotateCcw size={18} /> Reset
        </button>
        <div className="adas-source-name" title={sourceName}>{sourceName}</div>
      </section>

      <section className="adas-layout">
        <div className="adas-view-card">
          <div className="adas-video-stage">
            {sourceUrl ? (
              <video
                ref={videoRef}
                src={sourceUrl}
                playsInline
                muted
                controls={false}
                preload="metadata"
                onLoadedMetadata={() => {
                  setStatus("READY");
                  drawOverlay(overlayRef.current, videoRef.current, analysisRef.current);
                }}
                onEnded={() => {
                  stopLoop({ pauseVideo: false });
                  setStatus("VIDEO COMPLETE");
                }}
                onError={() => {
                  stopLoop({ pauseVideo: false });
                  setError("Video could not be decoded. Check the browser-supported format or local demo path.");
                  setStatus("VIDEO ERROR");
                }}
              />
            ) : (
              <div className="adas-empty-video">
                <Gauge size={48} />
                <span>Select an MP4, WebM or browser-supported road video</span>
              </div>
            )}
            <canvas ref={overlayRef} className="adas-overlay" aria-label="ADAS simulation overlay" />
            <div className="adas-watermark">SIMULATION ONLY</div>
          </div>
          <div className="adas-status-line">
            <span className={running ? "adas-live-dot adas-live-dot--on" : "adas-live-dot"} />
            {status}
          </div>
          {error && <div className="adas-error">{error}</div>}
        </div>

        <aside className="adas-panel">
          <div className={riskClass(risk?.level)}>
            <span>ROAD RISK</span>
            <strong>{risk?.level || "UNCERTAIN"}</strong>
            <small>Image-space estimate — not physical distance</small>
          </div>
          <div className="adas-decision">
            <span>SIMULATED DECISION</span>
            <strong>{analysis?.decision || "UNKNOWN"}</strong>
            <small>{decisionLabel(analysis?.decision)}</small>
          </div>
          <dl className="adas-metrics">
            <div><dt>Lane status</dt><dd>{lane?.status || "not_detected"}</dd></div>
            <div><dt>Lane confidence</dt><dd>{lane ? `${Math.round((lane.confidence || 0) * 100)}%` : "--"}</dd></div>
            <div><dt>Objects</dt><dd>{analysis?.detections?.length ?? 0}</dd></div>
            <div><dt>Object detector</dt><dd>{detector?.available ? "available" : detector?.reason || "not loaded"}</dd></div>
            <div><dt>Processing FPS</dt><dd>{metrics?.processing_fps ?? "--"}</dd></div>
            <div><dt>Latency</dt><dd>{metrics?.latency_ms != null ? `${metrics.latency_ms} ms` : "--"}</dd></div>
          </dl>
          {!detector?.available && (
            <p className="adas-model-note">
              Object detection unavailable. Lane simulation remains active; no detections are fabricated.
            </p>
          )}
          <div className="adas-legend">
            <span><i className="adas-key adas-key--lane" /> Lane / corridor</span>
            <span><i className="adas-key adas-key--path" /> Simulated planned path</span>
            <span><i className="adas-key adas-key--danger" /> Image-space danger</span>
          </div>
          <Link className="adas-home-link" to="/">Back to application home</Link>
        </aside>
      </section>
    </main>
  );
}
