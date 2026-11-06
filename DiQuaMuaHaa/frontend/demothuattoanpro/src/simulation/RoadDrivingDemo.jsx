import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Download,
  Film,
  Gauge,
  MonitorCog,
  RotateCcw,
  ShieldAlert,
  Upload,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { createDmsMetricsChannel, DriverMonitoringAdapter } from "../utils/DriverMonitoringAdapter.js";
import { AudioAlertManager } from "./AudioAlertManager.js";
import { DMS_STATES, RUN_STATES } from "./constants.js";
import { DrivingEventTimeline } from "./DrivingEventTimeline.js";
import { eventsFromSimulationTransition, virtualRoadStatus } from "./RoadPerceptionAdapter.js";
import { SafetyAlertEngine } from "./SafetyAlertEngine.js";
import { SCENARIO_CATALOG, SCENARIO_IDS } from "./scenarios.js";
import { SimulationController } from "./roadSimulation.js";
import { SimulationSessionManager } from "./SimulationSessionManager.js";
import { buildSimulationReport, downloadTextFile, timelineToCsv } from "./SimulationReport.js";
import { SCENARIO_PRESENTATION, laneAvailability, syntheticDmsMetrics } from "./presentation.js";
import {
  MAX_LOCAL_RECORDING_BYTES,
  MAX_LOCAL_RECORDING_MS,
  disposeRecordingResources,
  drawRecordingComposite,
  recordingExtension,
  selectRecordingMimeType,
} from "./recording.js";
import { createSimulationLoop } from "./simulationLoop.js";
import VirtualRoadScene from "./VirtualRoadScene.jsx";
import "./RoadDrivingDemo.css";

const DEMO_SEED = 20261105;
const CAMERA_MODES = ["CHASE", "DRIVER", "REAR", "CINEMATIC"];
const VIEW_MODES = ["SPLIT", "VIRTUAL", "VIDEO"];
const INPUT_MODES = Object.freeze({ OFFLINE_DEMO: "OFFLINE_DEMO", LIVE_DMS: "LIVE_DMS" });

function createPausedController(scenarioId) {
  const controller = new SimulationController(scenarioId, { seed: DEMO_SEED });
  controller.pause();
  return controller;
}

function numberOrDash(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function statusClass(status) {
  return `health-${String(status).toLowerCase()}`;
}

function eventTime(event) {
  return Number.isFinite(event.occurredAt)
    ? `${Number(event.occurredAt).toFixed(2)}s`
    : new Date(event.occurredAt).toLocaleTimeString("vi-VN");
}

export default function RoadDrivingDemo() {
  const controllerRef = useRef(createPausedController("S01"));
  const loopRef = useRef(null);
  const videoRef = useRef(null);
  const videoObjectUrlRef = useRef(null);
  const sceneCanvasRef = useRef(null);
  const recordingRef = useRef(null);
  const snapshotRef = useRef(controllerRef.current.getState());
  const inputModeRef = useRef(INPUT_MODES.OFFLINE_DEMO);
  const liveDmsStateRef = useRef(DMS_STATES.UNKNOWN);
  const alertEngineRef = useRef(null);
  const audioManagerRef = useRef(null);
  const timelineRef = useRef(null);
  const sessionRef = useRef(null);
  const dmsAdapterRef = useRef(null);
  if (!alertEngineRef.current) alertEngineRef.current = new SafetyAlertEngine();
  if (!audioManagerRef.current) audioManagerRef.current = new AudioAlertManager();
  if (!timelineRef.current) timelineRef.current = new DrivingEventTimeline();
  if (!sessionRef.current) sessionRef.current = new SimulationSessionManager();
  if (!dmsAdapterRef.current) dmsAdapterRef.current = new DriverMonitoringAdapter();

  const [snapshot, setSnapshot] = useState(snapshotRef.current);
  const [scenarioId, setScenarioId] = useState("S01");
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [cameraMode, setCameraMode] = useState("CHASE");
  const [viewMode, setViewMode] = useState("VIRTUAL");
  const [inputMode, setInputMode] = useState(INPUT_MODES.OFFLINE_DEMO);
  const [videoSource, setVideoSource] = useState("");
  const [videoName, setVideoName] = useState("Chưa chọn video đường đi");
  const [recording, setRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [primaryAlert, setPrimaryAlert] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [report, setReport] = useState(null);
  const [liveDmsEvent, setLiveDmsEvent] = useState(null);
  const [rendererStatus, setRendererStatus] = useState("STARTING");
  const [dmsBridgeStatus, setDmsBridgeStatus] = useState("UNAVAILABLE");

  const processNormalizedEvent = useCallback((event, currentSnapshot) => {
    timelineRef.current.append(event, {
      dmsState: currentSnapshot.driver.attention,
      roadEvent: currentSnapshot.risk?.level || event.eventType,
      adasDecision: currentSnapshot.orchestrator.decision,
      vehicleResponse: currentSnapshot.maneuver.phase,
    });
    const result = alertEngineRef.current.ingest(event);
    if (result.accepted && result.alert?.shouldPlayAudio) audioManagerRef.current.play(result.alert);
  }, []);

  const processSnapshot = useCallback((next) => {
    const previous = snapshotRef.current;
    let events = eventsFromSimulationTransition(previous, next);
    if (inputModeRef.current === INPUT_MODES.LIVE_DMS) {
      events = events.filter((event) => !event.eventType.startsWith("DRIVER_") && event.eventType !== "CAMERA_UNAVAILABLE");
    }
    events.forEach((event) => processNormalizedEvent(event, next));
    snapshotRef.current = next;
    setSnapshot(next);
    if (events.length > 0) {
      setTimeline(timelineRef.current.list());
      setPrimaryAlert(alertEngineRef.current.getPrimary());
    }
    if (next.runState === RUN_STATES.COMPLETE && previous.runState !== RUN_STATES.COMPLETE) {
      sessionRef.current.end(next);
      setReport(buildSimulationReport(next, timelineRef.current.list(), {
        inputMode: inputModeRef.current,
        alertHistory: alertEngineRef.current.history,
        availability: {
          renderer: rendererStatus,
          dmsBridge: dmsBridgeStatus,
          roadObjectDetector: "UNAVAILABLE",
        },
      }));
    }
  }, [dmsBridgeStatus, processNormalizedEvent, rendererStatus]);

  const installSnapshot = useCallback((next) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  useEffect(() => {
    const loop = createSimulationLoop({
      onFrame: (elapsedSeconds) => {
        let next = controllerRef.current.advance(elapsedSeconds);
        if (inputModeRef.current === INPUT_MODES.LIVE_DMS && next.driver.attention !== liveDmsStateRef.current) {
          next = controllerRef.current.setDriverState(liveDmsStateRef.current);
        }
        processSnapshot(next);
        if (next.runState === RUN_STATES.COMPLETE) setPlaying(false);
      },
    });
    loopRef.current = loop;
    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [processSnapshot]);

  useEffect(() => {
    if (playing) {
      controllerRef.current.resume();
      loopRef.current?.start();
    } else {
      controllerRef.current.pause();
      loopRef.current?.stop();
      videoRef.current?.pause();
    }
  }, [playing]);

  useEffect(() => {
    const channel = createDmsMetricsChannel({
      onResult: (raw) => {
        const result = dmsAdapterRef.current.ingest(raw);
        if (!result.accepted) return;
        const event = result.event;
        setDmsBridgeStatus("RUNNING");
        setLiveDmsEvent(event);
        liveDmsStateRef.current = event.payload.state;
        if (inputModeRef.current !== INPUT_MODES.LIVE_DMS) return;
        result.events.forEach((normalized) => processNormalizedEvent(normalized, snapshotRef.current));
        setTimeline(timelineRef.current.list());
        setPrimaryAlert(alertEngineRef.current.getPrimary());
        if (snapshotRef.current.driver.attention !== event.payload.state) {
          processSnapshot(controllerRef.current.setDriverState(event.payload.state));
        }
      },
    });
    setDmsBridgeStatus(channel.available ? "READY" : "UNAVAILABLE");
    return () => channel.close();
  }, [processNormalizedEvent, processSnapshot]);

  useEffect(() => () => {
    if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current);
    const active = recordingRef.current;
    if (active) {
      active.downloadOnStop = false;
      disposeRecordingResources(active);
      if (active.recorder.state !== "inactive") active.recorder.stop();
    }
    audioManagerRef.current.dispose();
  }, []);

  const scenarioCopy = SCENARIO_PRESENTATION[scenarioId];
  const syntheticMetrics = syntheticDmsMetrics(snapshot.driver.attention);
  const dmsMetrics = inputMode === INPUT_MODES.LIVE_DMS
    ? {
        ear: liveDmsEvent?.payload?.ear?.average ?? null,
        perclos: liveDmsEvent?.payload?.perclos ?? null,
        headPose: liveDmsEvent?.payload?.headPose
          ? JSON.stringify(liveDmsEvent.payload.headPose)
          : "UNKNOWN",
      }
    : syntheticMetrics;
  const lanes = useMemo(() => laneAvailability(snapshot), [snapshot]);
  const roadStatus = useMemo(() => virtualRoadStatus(snapshot), [snapshot]);
  const speedKph = Math.round(snapshot.ego.speed * 3.6);
  const recentTimeline = timeline.slice(-12).reverse();
  const health = [
    ["Renderer", rendererStatus],
    ["Mô phỏng", playing ? "RUNNING" : "READY"],
    ["DMS inference", inputMode === INPUT_MODES.LIVE_DMS ? (dmsBridgeStatus === "RUNNING" ? "RUNNING" : "DEGRADED") : "UNAVAILABLE"],
    ["Camera DMS", inputMode === INPUT_MODES.LIVE_DMS && dmsBridgeStatus === "RUNNING" ? "RUNNING" : "UNAVAILABLE"],
    ["Recording", typeof MediaRecorder === "undefined" ? "UNAVAILABLE" : "READY"],
    ["Video ADAS", videoSource ? "READY" : "DEGRADED"],
    ["Lane detector", "UNAVAILABLE"],
    ["Object model", "UNAVAILABLE"],
    ["Phone model", liveDmsEvent?.payload?.modelStatus?.phone ? "READY" : "UNAVAILABLE"],
    ["Hand model", "UNAVAILABLE"],
    ["Smoking model", "UNAVAILABLE"],
    ["Virtual planner", "READY"],
    ["Protected session", "BLOCKED"],
  ];

  const handleSceneCanvas = useCallback((canvas) => { sceneCanvasRef.current = canvas; }, []);

  const clearSessionArtifacts = useCallback(() => {
    alertEngineRef.current.reset();
    timelineRef.current.reset();
    sessionRef.current.reset();
    setPrimaryAlert(null);
    setTimeline([]);
    setReport(null);
  }, []);

  const start = useCallback(async () => {
    if (snapshotRef.current.runState === RUN_STATES.COMPLETE) {
      controllerRef.current.reset();
      controllerRef.current.setPlaybackRate(playbackRate);
      clearSessionArtifacts();
      installSnapshot(controllerRef.current.pause());
    }
    if (!sessionRef.current.session) sessionRef.current.start(snapshotRef.current, inputModeRef.current);
    setPlaying(true);
    if (videoRef.current && videoSource) {
      videoRef.current.playbackRate = playbackRate;
      try {
        await videoRef.current.play();
      } catch {
        setRecordingMessage("Trình duyệt không phát được video; thế giới ảo vẫn chạy độc lập.");
      }
    }
  }, [clearSessionArtifacts, installSnapshot, playbackRate, videoSource]);

  const reset = useCallback(() => {
    setPlaying(false);
    clearSessionArtifacts();
    controllerRef.current.reset();
    controllerRef.current.setPlaybackRate(playbackRate);
    installSnapshot(controllerRef.current.pause());
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [clearSessionArtifacts, installSnapshot, playbackRate]);

  const selectScenario = useCallback((nextScenarioId) => {
    setPlaying(false);
    setScenarioId(nextScenarioId);
    clearSessionArtifacts();
    controllerRef.current.loadScenario(nextScenarioId, { seed: DEMO_SEED });
    controllerRef.current.setPlaybackRate(playbackRate);
    installSnapshot(controllerRef.current.pause());
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [clearSessionArtifacts, installSnapshot, playbackRate]);

  const switchInputMode = useCallback((mode) => {
    setPlaying(false);
    setInputMode(mode);
    inputModeRef.current = mode;
    clearSessionArtifacts();
    if (mode === INPUT_MODES.LIVE_DMS) {
      liveDmsStateRef.current = DMS_STATES.UNKNOWN;
      dmsAdapterRef.current.reset();
      const unavailable = dmsAdapterRef.current.unavailable("WAITING_FOR_LIVE_DMS_SOURCE");
      setLiveDmsEvent(unavailable.event);
      unavailable.events?.forEach((event) => processNormalizedEvent(event, snapshotRef.current));
      setTimeline(timelineRef.current.list());
      setPrimaryAlert(alertEngineRef.current.getPrimary());
      processSnapshot(controllerRef.current.setDriverState(DMS_STATES.UNKNOWN));
    } else {
      dmsAdapterRef.current.reset();
      setLiveDmsEvent(null);
      controllerRef.current.loadScenario(scenarioId, { seed: DEMO_SEED });
      installSnapshot(controllerRef.current.pause());
    }
  }, [clearSessionArtifacts, installSnapshot, processNormalizedEvent, processSnapshot, scenarioId]);

  const changePlaybackRate = useCallback((value) => {
    const rate = Number(value);
    setPlaybackRate(rate);
    processSnapshot(controllerRef.current.setPlaybackRate(rate));
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [processSnapshot]);

  const setSyntheticDriverState = useCallback((driverState) => {
    if (inputModeRef.current !== INPUT_MODES.OFFLINE_DEMO) return;
    processSnapshot(controllerRef.current.setDriverState(driverState));
  }, [processSnapshot]);

  const toggleAudio = useCallback(async () => {
    if (audioEnabled) {
      audioManagerRef.current.setEnabled(false);
      setAudioEnabled(false);
      return;
    }
    const unlocked = await audioManagerRef.current.unlock();
    setAudioEnabled(unlocked);
    setRecordingMessage(unlocked ? "Đã bật âm thanh cảnh báo." : "Web Audio không khả dụng trên trình duyệt này.");
  }, [audioEnabled]);

  const changeVoice = useCallback((enabled) => {
    audioManagerRef.current.setVoiceEnabled(enabled);
    setVoiceEnabled(enabled);
  }, []);

  const changeVolume = useCallback((value) => {
    const next = Number(value);
    audioManagerRef.current.setVolume(next);
    setVolume(next);
  }, []);

  const acknowledgePrimary = useCallback(() => {
    if (!primaryAlert) return;
    alertEngineRef.current.acknowledge(primaryAlert.alertId);
    setPrimaryAlert(alertEngineRef.current.getPrimary());
  }, [primaryAlert]);

  const selectRoadVideo = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    videoObjectUrlRef.current = url;
    setVideoSource(url);
    setVideoName(file.name);
    setRecordingMessage("");
  }, []);

  const stopRecording = useCallback((download = true) => {
    const active = recordingRef.current;
    if (!active) return;
    active.downloadOnStop = download;
    disposeRecordingResources(active);
    if (active.recorder.state !== "inactive") active.recorder.stop();
    recordingRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (recordingRef.current) return;
    const sourceCanvas = sceneCanvasRef.current;
    if (!sourceCanvas?.captureStream || typeof MediaRecorder === "undefined") {
      setRecordingMessage("Trình duyệt không hỗ trợ ghi canvas bằng MediaRecorder.");
      return;
    }
    const composite = document.createElement("canvas");
    composite.width = Math.max(960, sourceCanvas.width || 1280);
    composite.height = Math.max(540, sourceCanvas.height || 720);
    const context = composite.getContext("2d");
    if (!context) return;
    const stream = composite.captureStream(30);
    const mimeType = selectRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })
        : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setRecordingMessage("Không thể tạo bộ mã hóa video cục bộ.");
      return;
    }
    const chunks = [];
    let recordedBytes = 0;
    const active = {
      recorder,
      stream,
      frameHandle: null,
      cancelFrame: cancelAnimationFrame,
      stopTimer: null,
      clearTimer: clearTimeout,
      stopReason: null,
      downloadOnStop: true,
    };
    const draw = () => {
      const current = snapshotRef.current;
      drawRecordingComposite({
        context,
        sourceCanvas,
        width: composite.width,
        height: composite.height,
        overlay: {
          scenarioLabel: SCENARIO_PRESENTATION[current.scenarioId]?.label || current.scenarioId,
          driverState: current.driver.attention,
          assistanceMode: current.orchestrator.mode,
          decision: current.orchestrator.decision,
          speedKph: Math.round(current.ego.speed * 3.6),
          roadRisk: current.risk?.level,
          warningText: alertEngineRef.current.getPrimary()?.message || "",
        },
      });
      active.frameHandle = requestAnimationFrame(draw);
    };
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      if (recordedBytes + event.data.size > MAX_LOCAL_RECORDING_BYTES) {
        active.stopReason = "SIZE_LIMIT";
        stopRecording(true);
        return;
      }
      recordedBytes += event.data.size;
      chunks.push(event.data);
    };
    recorder.onerror = () => {
      active.downloadOnStop = false;
      disposeRecordingResources(active);
      recordingRef.current = null;
      setRecording(false);
      setRecordingMessage("Ghi hình lỗi; không có dữ liệu nào được tải lên cloud.");
    };
    recorder.onstop = () => {
      disposeRecordingResources(active);
      if (recordingRef.current === active) recordingRef.current = null;
      setRecording(false);
      if (active.downloadOnStop && chunks.length) {
        const finalMime = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunks, { type: finalMime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `dms-road-${snapshotRef.current.scenarioId}.${recordingExtension(finalMime)}`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setRecordingMessage("Đã tạo video scene ảo cục bộ; webcam, microphone và sinh trắc học không được ghi.");
      }
    };
    recordingRef.current = active;
    recorder.start(500);
    draw();
    active.stopTimer = setTimeout(() => {
      active.stopReason = "TIME_LIMIT";
      stopRecording(true);
    }, MAX_LOCAL_RECORDING_MS);
    setRecording(true);
    setRecordingMessage(`Đang ghi ${mimeType || "định dạng mặc định"}.`);
  }, [stopRecording]);

  const exportReport = useCallback(() => {
    const currentReport = report || buildSimulationReport(snapshotRef.current, timelineRef.current.list(), {
      inputMode: inputModeRef.current,
      alertHistory: alertEngineRef.current.history,
    });
    downloadTextFile(`dms-v2-${snapshotRef.current.scenarioId}-report.json`, JSON.stringify(currentReport, null, 2), "application/json");
  }, [report]);

  const exportTimeline = useCallback(() => {
    downloadTextFile(`dms-v2-${snapshotRef.current.scenarioId}-timeline.csv`, timelineToCsv(timelineRef.current.list()), "text/csv");
  }, []);

  return (
    <main className="road-sim-page">
      <header className="road-sim-header">
        <div>
          <div className="road-sim-eyebrow">AI DRIVER SAFETY MONITORING & ASSISTANCE SIMULATOR</div>
          <h1>DMS + ADAS Integrated Cockpit V2</h1>
          <p>DMS quan sát tài xế; ADAS và mọi phản ứng xe chỉ chạy trong thế giới ảo deterministic.</p>
        </div>
        <div className="road-sim-header-state">
          <span className={`driver-state driver-state--${snapshot.driver.attention.toLowerCase()}`}>{snapshot.driver.attention}</span>
          <strong>{speedKph} km/h</strong>
          <div className="road-sim-safety-badge"><ShieldAlert size={18} /> SIMULATION ONLY</div>
        </div>
      </header>

      <section className="road-sim-gate">
        <AlertTriangle size={18} />
        <span>Phiên bảo vệ: <strong>BLOCKED</strong> — chưa có grant xác minh phía server từ PR B. Không có bearer-only fallback và không có lệnh điều khiển xe thật.</span>
      </section>

      <section className="road-sim-modebar" aria-label="Chế độ đầu vào">
        <div className="road-sim-segmented">
          <button type="button" className={inputMode === INPUT_MODES.OFFLINE_DEMO ? "is-active" : ""} onClick={() => switchInputMode(INPUT_MODES.OFFLINE_DEMO)}>OFFLINE DEMO</button>
          <button type="button" className={inputMode === INPUT_MODES.LIVE_DMS ? "is-active" : ""} onClick={() => switchInputMode(INPUT_MODES.LIVE_DMS)}>LIVE DMS + VIRTUAL ROAD</button>
        </div>
        <div className="road-sim-health-strip">
          {health.slice(0, 4).map(([label, status]) => <span key={label} className={statusClass(status)}><i />{label}: {status}</span>)}
        </div>
      </section>

      {primaryAlert && (
        <section className={`road-alert road-alert--${primaryAlert.severity.toLowerCase()}`} role="alert">
          <AlertTriangle size={26} />
          <div><span>{primaryAlert.severity} · {primaryAlert.source}</span><strong>{primaryAlert.message}</strong><small>{primaryAlert.reason}</small></div>
          <button type="button" onClick={acknowledgePrimary}>Đã nhận</button>
        </section>
      )}

      <section className="road-cockpit-grid">
        <aside className="road-dms-panel">
          <div className="panel-title"><Camera size={18} /><span>DRIVER MONITORING</span></div>
          {inputMode === INPUT_MODES.LIVE_DMS ? (
            <div className="live-dms-bridge">
              <div className="camera-placeholder"><Camera size={42} /><strong>Webcam thuộc DMS surface</strong><span>Không nhân đôi camera track hoặc chuyển frame sinh trắc học sang recorder.</span></div>
              <Link className="road-link-button" to="/test3" target="_blank">Mở DMS thật trong tab mới</Link>
              <small>Metrics được truyền nội bộ qua BroadcastChannel; token, landmark và ảnh không được gửi.</small>
            </div>
          ) : (
            <div className="camera-placeholder synthetic"><MonitorCog size={42} /><strong>SYNTHETIC FIXTURE</strong><span>Không dùng webcam, backend hoặc dữ liệu khuôn mặt.</span></div>
          )}
          <label className="road-sim-field">Trạng thái DMS
            <select value={snapshot.driver.attention} disabled={inputMode !== INPUT_MODES.OFFLINE_DEMO} onChange={(event) => setSyntheticDriverState(event.target.value)}>
              {Object.values(DMS_STATES).map((state) => <option key={state}>{state}</option>)}
            </select>
          </label>
          <dl className="dms-metrics">
            <div><dt>Eye state</dt><dd>{liveDmsEvent?.payload?.eyeState || (inputMode === INPUT_MODES.OFFLINE_DEMO ? "SYNTHETIC" : "UNKNOWN")}</dd></div>
            <div><dt>EAR</dt><dd>{numberOrDash(dmsMetrics.ear, 2)}</dd></div>
            <div><dt>PERCLOS</dt><dd>{dmsMetrics.perclos == null ? "—" : `${Math.round(dmsMetrics.perclos * 100)}%`}</dd></div>
            <div><dt>Head pose</dt><dd>{dmsMetrics.headPose}</dd></div>
            <div><dt>Điện thoại</dt><dd>{snapshot.driver.phoneUsage ? "DETECTED" : inputMode === INPUT_MODES.LIVE_DMS ? (liveDmsEvent?.payload?.phoneUsage ? "DETECTED" : "NOT REPORTED") : "CLEAR"}</dd></div>
            <div><dt>Hand model</dt><dd>UNAVAILABLE</dd></div>
            <div><dt>Face match</dt><dd>EXPERIMENTAL / NOT AUTH</dd></div>
            <div><dt>Smoking</dt><dd>UNAVAILABLE</dd></div>
          </dl>
        </aside>

        <section className="road-center-stack">
          <div className={`road-sim-stage road-sim-stage--${viewMode.toLowerCase()}`}>
            <div className={viewMode === "VIDEO" ? "road-sim-pane is-hidden" : "road-sim-pane"}>
              <VirtualRoadScene snapshot={snapshot} cameraMode={cameraMode} onCanvasReady={handleSceneCanvas} onRendererStatus={setRendererStatus} />
              <div className="road-sim-stage-overlay"><span>VIRTUAL WORLD · {snapshot.config.fixedTimeStep}s STEP</span><strong>{snapshot.maneuver.phase}</strong></div>
              <div className={`virtual-risk virtual-risk--${roadStatus.riskLevel.toLowerCase()}`}><span>ROAD RISK</span><strong>{roadStatus.riskLevel}</strong></div>
              <div className="virtual-cluster"><Gauge /><strong>{speedKph}</strong><span>km/h</span><i className={snapshot.ego.acceleration < -0.25 ? "brake-on" : ""}>BRAKE</i><i className={snapshot.ego.targetLane != null ? "signal-on" : ""}>SIGNAL</i></div>
              <div className="road-sim-camera-switch"><Camera size={15} />{CAMERA_MODES.map((mode) => <button type="button" key={mode} className={cameraMode === mode ? "is-active" : ""} onClick={() => setCameraMode(mode)}>{mode}</button>)}</div>
            </div>
            <div className={viewMode === "VIRTUAL" ? "road-sim-pane is-hidden" : "road-sim-pane road-sim-video-pane"}>
              {videoSource ? <video ref={videoRef} src={videoSource} muted playsInline preload="metadata" onEnded={() => setPlaying(false)} /> : <div className="road-sim-video-empty"><Video size={48} /><strong>ROAD VIDEO TÙY CHỌN</strong><span>Ảnh/video dùng tọa độ pixel; không đổi sang mét hoặc TTC thật.</span></div>}
              <label className="road-sim-upload"><Upload size={16} /> Chọn road video<input type="file" accept="video/mp4,video/webm,.mp4,.webm" onChange={selectRoadVideo} /></label>
              <div className="road-sim-video-warning"><strong>OBJECT DETECTION UNAVAILABLE</strong><span>Không bịa detection. Video không trực tiếp điều khiển quỹ đạo xe ảo.</span><Link to="/adas-simulation">Mở ADAS video analysis</Link></div>
              <div className="road-sim-video-name">{videoName}</div>
            </div>
          </div>

          <div className="road-sim-toolbar">
            <button type="button" onClick={start} disabled={playing}><CirclePlay size={18} /> Chạy</button>
            <button type="button" onClick={() => setPlaying(false)} disabled={!playing}><CirclePause size={18} /> Tạm dừng</button>
            <button type="button" onClick={reset}><RotateCcw size={18} /> Reset</button>
            <label>Tốc độ<select value={playbackRate} onChange={(event) => changePlaybackRate(event.target.value)}>{[0.5, 1, 2, 4].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
            <div className="road-sim-segmented">{VIEW_MODES.map((mode) => <button type="button" key={mode} className={viewMode === mode ? "is-active" : ""} onClick={() => setViewMode(mode)}>{mode}</button>)}</div>
            <button type="button" onClick={toggleAudio}>{audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}{audioEnabled ? "Âm thanh bật" : "Bật âm thanh"}</button>
            <button type="button" disabled={!audioEnabled} onClick={() => audioManagerRef.current.test()}>Test âm</button>
            <button type="button" onClick={recording ? () => stopRecording(true) : startRecording} className={recording ? "is-recording" : ""}><Film size={18} />{recording ? "Dừng & tải" : "Ghi demo"}</button>
          </div>
          <div className="audio-settings">
            <label>Âm lượng <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => changeVolume(event.target.value)} /></label>
            <label><input type="checkbox" checked={voiceEnabled} disabled={!audioEnabled} onChange={(event) => changeVoice(event.target.checked)} /> Giọng nói tiếng Việt (speechSynthesis)</label>
          </div>
        </section>

        <aside className="road-sim-side">
          <div className="panel-title"><ShieldAlert size={18} /><span>ADAS / VIRTUAL RESPONSE</span></div>
          <label className="road-sim-field">Kịch bản deterministic<select value={scenarioId} onChange={(event) => selectScenario(event.target.value)}>{SCENARIO_IDS.map((id) => <option key={id} value={id}>{SCENARIO_PRESENTATION[id].label}</option>)}</select></label>
          <p className="road-sim-scenario-description">{scenarioCopy.description}</p>
          <div className="road-sim-expected"><span>Kết quả mong đợi</span><strong>{SCENARIO_CATALOG[scenarioId].expected}</strong></div>
          <div className="road-sim-status-card"><span>Risk / vật cản trước</span><strong>{snapshot.risk.level}</strong><small>{snapshot.risk.frontHazard?.obstacleId || "Không có"}</small></div>
          <div className="road-sim-status-card"><span>Assistance mode</span><strong>{snapshot.orchestrator.mode}</strong><small>{snapshot.orchestrator.reason}</small></div>
          <div className="road-sim-status-card"><span>Quyết định mô phỏng</span><strong>{snapshot.orchestrator.decision}</strong><small>productionControlOutput: null</small></div>
          <div className="road-sim-status-card"><span>Phản ứng xe ảo</span><strong>{snapshot.maneuver.phase}</strong><small>Tiến độ {Math.round(snapshot.maneuver.progress * 100)}%</small></div>
          <div className="road-sim-lanes">{lanes.map((lane) => <div key={lane.lane} className={lane.available ? "is-clear" : "is-blocked"}><span>Làn {lane.lane + 1}</span><strong>{lane.available ? "ĐỦ KHOẢNG HỞ" : "BỊ CHIẾM"}</strong></div>)}</div>
          <div className="compact-timeline"><h2>Event timeline</h2>{recentTimeline.length ? <ol>{recentTimeline.map((event) => <li key={event.eventId}><time>{eventTime(event)}</time><div><strong>{event.eventType}</strong><span>{event.severity} · {event.sourceMode}</span><small>{event.adasDecision} → {event.vehicleResponse}</small></div></li>)}</ol> : <p>Chưa có chuyển trạng thái đáng kể.</p>}</div>
        </aside>
      </section>

      <section className="road-sim-readouts">
        <article><Gauge /><span>Tốc độ ảo</span><strong>{speedKph} km/h</strong></article>
        <article><span>Thời gian</span><strong>{snapshot.time.toFixed(2)} s</strong></article>
        <article><span>Làn hiện tại / đích</span><strong>{snapshot.ego.currentLane + 1} / {snapshot.ego.targetLane == null ? "—" : snapshot.ego.targetLane + 1}</strong></article>
        <article><span>Va chạm ảo</span><strong>{snapshot.metrics.collisionCount}</strong></article>
        <article><span>Khoảng hở nhỏ nhất</span><strong>{numberOrDash(snapshot.metrics.minimumVirtualClearance, 2)} m ảo</strong></article>
        <article><span>Phanh cực đại</span><strong>{numberOrDash(snapshot.metrics.maximumBraking, 1)} m/s²</strong></article>
        <article><span>Thời gian dừng</span><strong>{numberOrDash(snapshot.metrics.timeToVirtualStop, 2)} s</strong></article>
        <article><span>Nguồn DMS</span><strong>{inputMode}</strong></article>
      </section>

      <section className="road-sim-bottom">
        <div className="system-health-panel"><h2><MonitorCog size={19} /> System health</h2><div>{health.map(([label, status]) => <span key={label} className={statusClass(status)}><i />{label}<strong>{status}</strong></span>)}</div><p>UNKNOWN/UNAVAILABLE không bao giờ được hiển thị như trạng thái an toàn.</p></div>
        <div className="session-report"><h2><CheckCircle2 size={19} /> Báo cáo phiên</h2>{report ? <><p>Kịch bản đã kết thúc. {report.counters.warnings} warning, {report.counters.critical} critical, {report.counters.virtualLaneChanges} lần chuyển làn ảo.</p><strong>Va chạm ảo: {report.counters.virtualCollisions}</strong></> : <p>Báo cáo xuất hiện khi hoàn tất; có thể xuất snapshot hiện tại bất kỳ lúc nào.</p>}<div><button type="button" onClick={exportReport}><Download size={16} /> JSON report</button><button type="button" onClick={exportTimeline}><Download size={16} /> CSV timeline</button><button type="button" onClick={() => window.print()}>In báo cáo</button></div></div>
      </section>

      {recordingMessage && <div className="road-sim-toast" role="status">{recordingMessage}</div>}
      <footer className="road-sim-footer"><span>Seed: {snapshot.seed} · {snapshot.perception.source} · simulation-only</span><span>Không ghi webcam / microphone / token / biometric image</span><Link to="/">Về trang chính</Link></footer>
    </main>
  );
}
