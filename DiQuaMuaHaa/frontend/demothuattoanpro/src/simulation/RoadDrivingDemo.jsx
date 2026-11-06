import {
  AlertTriangle,
  Camera,
  CirclePause,
  CirclePlay,
  Film,
  Gauge,
  RotateCcw,
  ShieldAlert,
  Upload,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { DMS_STATES, RUN_STATES } from "./constants.js";
import { SCENARIO_CATALOG, SCENARIO_IDS } from "./scenarios.js";
import { SimulationController } from "./roadSimulation.js";
import {
  SCENARIO_PRESENTATION,
  eventText,
  laneAvailability,
  syntheticDmsMetrics,
} from "./presentation.js";
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
const CAMERA_MODES = ["CHASE", "DRIVER", "REAR"];
const VIEW_MODES = ["SPLIT", "VIRTUAL", "VIDEO"];

function createPausedController(scenarioId) {
  const controller = new SimulationController(scenarioId, { seed: DEMO_SEED });
  controller.pause();
  return controller;
}

function numberOrDash(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function timelineKey(event, index) {
  return `${event.at}-${event.type}-${index}`;
}

export default function RoadDrivingDemo() {
  const controllerRef = useRef(createPausedController("S01"));
  const loopRef = useRef(null);
  const videoRef = useRef(null);
  const videoObjectUrlRef = useRef(null);
  const sceneCanvasRef = useRef(null);
  const recordingRef = useRef(null);
  const snapshotRef = useRef(controllerRef.current.getState());

  const [snapshot, setSnapshot] = useState(snapshotRef.current);
  const [scenarioId, setScenarioId] = useState("S01");
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [cameraMode, setCameraMode] = useState("CHASE");
  const [viewMode, setViewMode] = useState("SPLIT");
  const [videoSource, setVideoSource] = useState("");
  const [videoName, setVideoName] = useState("Chưa chọn video đường đi");
  const [recording, setRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const loop = createSimulationLoop({
      onFrame: (elapsedSeconds) => {
        const next = controllerRef.current.advance(elapsedSeconds);
        snapshotRef.current = next;
        setSnapshot(next);
        if (next.runState === RUN_STATES.COMPLETE) setPlaying(false);
      },
    });
    loopRef.current = loop;
    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, []);

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

  useEffect(
    () => () => {
      if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current);
      const active = recordingRef.current;
      if (active) {
        active.downloadOnStop = false;
        disposeRecordingResources(active);
        if (active.recorder.state !== "inactive") active.recorder.stop();
      }
    },
    [],
  );

  const scenarioCopy = SCENARIO_PRESENTATION[scenarioId];
  const dmsMetrics = syntheticDmsMetrics(snapshot.driver.attention);
  const lanes = useMemo(() => laneAvailability(snapshot), [snapshot]);
  const speedKph = Math.round(snapshot.ego.speed * 3.6);
  const recentTimeline = snapshot.timeline.slice(-10).reverse();

  const handleSceneCanvas = useCallback((canvas) => {
    sceneCanvasRef.current = canvas;
  }, []);

  const start = useCallback(async () => {
    if (snapshotRef.current.runState === RUN_STATES.COMPLETE) {
      controllerRef.current.reset();
      const next = controllerRef.current.setPlaybackRate(playbackRate);
      snapshotRef.current = next;
      setSnapshot(next);
    }
    setPlaying(true);
    if (videoRef.current && videoSource) {
      videoRef.current.playbackRate = playbackRate;
      try {
        await videoRef.current.play();
      } catch {
        setRecordingMessage("Trình duyệt không thể phát video này; mô phỏng ảo vẫn chạy độc lập.");
      }
    }
  }, [playbackRate, videoSource]);

  const pause = useCallback(() => setPlaying(false), []);

  const reset = useCallback(() => {
    setPlaying(false);
    controllerRef.current.reset();
    controllerRef.current.setPlaybackRate(playbackRate);
    const next = controllerRef.current.pause();
    snapshotRef.current = next;
    setSnapshot(next);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [playbackRate]);

  const selectScenario = useCallback(
    (nextScenarioId) => {
      setPlaying(false);
      setScenarioId(nextScenarioId);
      controllerRef.current.loadScenario(nextScenarioId, { seed: DEMO_SEED });
      controllerRef.current.setPlaybackRate(playbackRate);
      const next = controllerRef.current.pause();
      snapshotRef.current = next;
      setSnapshot(next);
      if (videoRef.current) videoRef.current.currentTime = 0;
    },
    [playbackRate],
  );

  const changePlaybackRate = useCallback((value) => {
    const rate = Number(value);
    setPlaybackRate(rate);
    const next = controllerRef.current.setPlaybackRate(rate);
    snapshotRef.current = next;
    setSnapshot(next);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, []);

  const setSyntheticDriverState = useCallback((driverState) => {
    const next = controllerRef.current.setDriverState(driverState);
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

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
    if (!sourceCanvas || typeof sourceCanvas.captureStream !== "function") {
      setRecordingMessage("Trình duyệt không hỗ trợ canvas.captureStream cho scene này.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setRecordingMessage("MediaRecorder không khả dụng trên trình duyệt này.");
      return;
    }

    const composite = document.createElement("canvas");
    composite.width = Math.max(960, sourceCanvas.width || 1280);
    composite.height = Math.max(540, sourceCanvas.height || 720);
    const context = composite.getContext("2d");
    if (!context) {
      setRecordingMessage("Không thể tạo canvas ghi hình.");
      return;
    }

    const stream = composite.captureStream(30);
    const mimeType = selectRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })
        : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setRecordingMessage("Trình duyệt không tạo được bộ mã hóa video cục bộ.");
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
        },
      });
      active.frameHandle = requestAnimationFrame(draw);
    };
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      if (recordedBytes + event.data.size > MAX_LOCAL_RECORDING_BYTES) {
        active.stopReason = "SIZE_LIMIT";
        setRecordingMessage("Đã đạt giới hạn ghi cục bộ 250 MiB; đang kết thúc và tạo file.");
        stopRecording(true);
        return;
      }
      recordedBytes += event.data.size;
      chunks.push(event.data);
    };
    recorder.onerror = () => {
      active.downloadOnStop = false;
      disposeRecordingResources(active);
      if (recordingRef.current === active) recordingRef.current = null;
      if (recorder.state !== "inactive") recorder.stop();
      setRecordingMessage("Ghi hình bị lỗi; không có dữ liệu nào được tải lên cloud.");
      setRecording(false);
    };
    recorder.onstop = () => {
      disposeRecordingResources(active);
      if (recordingRef.current === active) recordingRef.current = null;
      setRecording(false);
      if (active.downloadOnStop && chunks.length > 0) {
        const finalMime = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunks, { type: finalMime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `dms-road-${snapshotRef.current.scenarioId}.${recordingExtension(finalMime)}`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setRecordingMessage(
          active.stopReason
            ? "Đã tự dừng ở giới hạn an toàn và tạo video cục bộ; không có cloud upload."
            : "Đã tạo video cục bộ. Không có camera sinh trắc học hay cloud upload.",
        );
      }
    };
    recordingRef.current = active;
    try {
      recorder.start(500);
      draw();
      active.stopTimer = setTimeout(() => {
        active.stopReason = "TIME_LIMIT";
        setRecordingMessage("Đã đạt giới hạn ghi cục bộ 10 phút; đang kết thúc và tạo file.");
        stopRecording(true);
      }, MAX_LOCAL_RECORDING_MS);
    } catch {
      active.downloadOnStop = false;
      disposeRecordingResources(active);
      recordingRef.current = null;
      if (recorder.state !== "inactive") recorder.stop();
      setRecordingMessage("Không thể bắt đầu ghi video cục bộ trên trình duyệt này.");
      return;
    }
    setRecording(true);
    setRecordingMessage(`Đang ghi ${mimeType || "định dạng mặc định của trình duyệt"}.`);
  }, [stopRecording]);

  return (
    <main className="road-sim-page">
      <header className="road-sim-header">
        <div>
          <div className="road-sim-eyebrow">DETERMINISTIC VIRTUAL WORLD</div>
          <h1>DMS + ADAS — Mô phỏng đường đi và né vật cản</h1>
          <p>
            Xe ảo phanh, chuyển làn và dừng trong tọa độ mô phỏng. Không điều khiển xe thật,
            không suy ra khoảng cách vật lý từ video.
          </p>
        </div>
        <div className="road-sim-safety-badge">
          <ShieldAlert size={20} aria-hidden="true" /> SIMULATION ONLY
        </div>
      </header>

      <section className="road-sim-gate" aria-label="Trạng thái tích hợp bảo mật">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>
          PR B chưa có và PR C đang BLOCKED. Đây là simulator offline; không cấp quyền phiên lái,
          không ghi DB/history. S10 chỉ là timeline cục bộ.
        </span>
      </section>

      <section className="road-sim-toolbar" aria-label="Điều khiển mô phỏng">
        <button type="button" onClick={start} disabled={playing}>
          <CirclePlay size={18} aria-hidden="true" /> Chạy
        </button>
        <button type="button" onClick={pause} disabled={!playing}>
          <CirclePause size={18} aria-hidden="true" /> Tạm dừng
        </button>
        <button type="button" onClick={reset}>
          <RotateCcw size={18} aria-hidden="true" /> Khởi động lại
        </button>
        <label>
          Tốc độ phát
          <select value={playbackRate} onChange={(event) => changePlaybackRate(event.target.value)}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <div className="road-sim-segmented" aria-label="Chế độ hiển thị">
          {VIEW_MODES.map((mode) => (
            <button
              type="button"
              key={mode}
              className={viewMode === mode ? "is-active" : ""}
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
            >
              {mode}
            </button>
          ))}
        </div>
        {!recording ? (
          <button type="button" onClick={startRecording}>
            <Film size={18} aria-hidden="true" /> Ghi demo
          </button>
        ) : (
          <button type="button" className="is-recording" onClick={() => stopRecording(true)}>
            <Film size={18} aria-hidden="true" /> Dừng & tải video
          </button>
        )}
      </section>

      <section className="road-sim-grid">
        <div className={`road-sim-stage road-sim-stage--${viewMode.toLowerCase()}`}>
          <div className={viewMode === "VIDEO" ? "road-sim-pane is-hidden" : "road-sim-pane"}>
            <VirtualRoadScene
              snapshot={snapshot}
              cameraMode={cameraMode}
              onCanvasReady={handleSceneCanvas}
            />
            <div className="road-sim-stage-overlay">
              <span>XE ẢO · FIXED STEP {snapshot.config.fixedTimeStep}s</span>
              <strong>{snapshot.maneuver.phase}</strong>
            </div>
            <div className="road-sim-camera-switch" aria-label="Góc camera ảo">
              <Camera size={16} aria-hidden="true" />
              {CAMERA_MODES.map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={cameraMode === mode ? "is-active" : ""}
                  onClick={() => setCameraMode(mode)}
                  aria-pressed={cameraMode === mode}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className={viewMode === "VIRTUAL" ? "road-sim-pane is-hidden" : "road-sim-pane road-sim-video-pane"}>
            {videoSource ? (
              <video
                ref={videoRef}
                src={videoSource}
                muted
                playsInline
                preload="metadata"
                onEnded={() => setPlaying(false)}
                aria-label="Video đường đi đã ghi, không bị thay đổi quỹ đạo"
              />
            ) : (
              <div className="road-sim-video-empty">
                <Video size={52} aria-hidden="true" />
                <strong>ROAD VIDEO — tùy chọn</strong>
                <span>Chọn video có sẵn trong máy. Simulator không dùng webcam.</span>
              </div>
            )}
            <label className="road-sim-upload">
              <Upload size={16} aria-hidden="true" /> Chọn road video
              <input type="file" accept="video/mp4,video/webm,.mp4,.webm" onChange={selectRoadVideo} />
            </label>
            <div className="road-sim-video-warning">
              <strong>OBJECT DETECTION UNAVAILABLE</strong>
              <span>
                Offline route không bịa lane/object detection. Video là bất biến; chuyển làn xe ảo
                không đổi quỹ đạo video.
              </span>
              <Link to="/adas-simulation">Mở luồng phân tích video ADAS dùng API có bearer</Link>
            </div>
            <div className="road-sim-video-name" title={videoName}>{videoName}</div>
          </div>
        </div>

        <aside className="road-sim-side">
          <label className="road-sim-field">
            Kịch bản deterministic
            <select value={scenarioId} onChange={(event) => selectScenario(event.target.value)}>
              {SCENARIO_IDS.map((id) => (
                <option key={id} value={id}>{SCENARIO_PRESENTATION[id].label}</option>
              ))}
            </select>
          </label>
          <p className="road-sim-scenario-description">{scenarioCopy.description}</p>
          <div className="road-sim-expected">
            <span>Kết quả fixture mong đợi</span>
            <strong>{SCENARIO_CATALOG[scenarioId].expected}</strong>
          </div>

          <label className="road-sim-field">
            DMS input tổng hợp
            <select
              value={snapshot.driver.attention}
              onChange={(event) => setSyntheticDriverState(event.target.value)}
            >
              {Object.values(DMS_STATES).map((state) => <option key={state}>{state}</option>)}
            </select>
          </label>

          <div className="road-sim-status-card">
            <span>Driver attention</span>
            <strong>{snapshot.driver.attention}</strong>
            <small>Synthetic fixture — không phải kết quả camera thật</small>
          </div>
          <div className="road-sim-status-card">
            <span>Driving mode</span>
            <strong>{snapshot.orchestrator.mode}</strong>
            <small>{snapshot.orchestrator.reason}</small>
          </div>
          <div className="road-sim-status-card">
            <span>Simulated decision</span>
            <strong>{snapshot.orchestrator.decision}</strong>
            <small>Intent mô phỏng, không phải actuator command</small>
          </div>

          <div className="road-sim-lanes" aria-label="Trạng thái các làn ảo">
            {lanes.map((lane) => (
              <div key={lane.lane} className={lane.available ? "is-clear" : "is-blocked"}>
                <span>Làn {lane.lane + 1}</span>
                <strong>{lane.available ? "ĐỦ KHOẢNG HỞ" : "BỊ CHIẾM"}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="road-sim-readouts" aria-label="Chỉ số thế giới ảo">
        <article><Gauge aria-hidden="true" /><span>Tốc độ xe ảo</span><strong>{speedKph} km/h</strong></article>
        <article><span>Thời gian mô phỏng</span><strong>{snapshot.time.toFixed(2)} s</strong></article>
        <article><span>Làn hiện tại / đích</span><strong>{snapshot.ego.currentLane + 1} / {snapshot.ego.targetLane == null ? "—" : snapshot.ego.targetLane + 1}</strong></article>
        <article><span>Va chạm ảo</span><strong>{snapshot.metrics.collisionCount}</strong></article>
        <article><span>Độ hở ảo nhỏ nhất</span><strong>{numberOrDash(snapshot.metrics.minimumVirtualClearance, 2)} m</strong></article>
        <article><span>Thời gian dừng ảo</span><strong>{numberOrDash(snapshot.metrics.timeToVirtualStop, 2)} s</strong></article>
        <article><span>EAR tổng hợp</span><strong>{numberOrDash(dmsMetrics.ear, 2)}</strong></article>
        <article><span>PERCLOS tổng hợp</span><strong>{dmsMetrics.perclos == null ? "—" : `${Math.round(dmsMetrics.perclos * 100)}%`}</strong></article>
        <article><span>Head pose tổng hợp</span><strong>{dmsMetrics.headPose}</strong></article>
        <article><span>Alert cục bộ</span><strong>{snapshot.localSession.alertCount}</strong></article>
      </section>

      <section className="road-sim-bottom">
        <div className="road-sim-explanation">
          <h2>Giải thích từng bước</h2>
          <ol>
            <li>Trạng thái tài xế: <strong>{snapshot.driver.attention}</strong>.</li>
            <li>Perception tổng hợp: <strong>{snapshot.perception.available ? "AVAILABLE" : "UNKNOWN"}</strong>.</li>
            <li>Engine đánh giá: <strong>{snapshot.orchestrator.reason}</strong>.</li>
            <li>Maneuver thực tế: <strong>{snapshot.maneuver.phase}</strong>, tiến độ {Math.round(snapshot.maneuver.progress * 100)}%.</li>
            <li>Kết quả hiện tại: <strong>{snapshot.metrics.collisionCount === 0 ? "CHƯA CÓ VA CHẠM ẢO" : "ĐÃ GHI NHẬN VA CHẠM ẢO"}</strong>.</li>
          </ol>
          <p>
            Các khoảng cách và thời gian chỉ thuộc thế giới ảo deterministic. Không bảo đảm tránh
            tai nạn và không phản ánh TTC/khoảng cách đo từ video thật.
          </p>
        </div>
        <div className="road-sim-timeline">
          <h2>Timeline sự kiện cục bộ</h2>
          {recentTimeline.length === 0 ? (
            <p>Chưa có sự kiện.</p>
          ) : (
            <ol>
              {recentTimeline.map((event, index) => (
                <li key={timelineKey(event, index)}>
                  <time>{Number(event.at).toFixed(2)}s</time>
                  <span>{eventText(event)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {recordingMessage && <div className="road-sim-toast" role="status">{recordingMessage}</div>}
      <footer className="road-sim-footer">
        <span>Seed: {snapshot.seed} · {snapshot.perception.source}</span>
        <span>productionControlOutput: null</span>
        <Link to="/">Về trang chính</Link>
      </footer>
    </main>
  );
}
