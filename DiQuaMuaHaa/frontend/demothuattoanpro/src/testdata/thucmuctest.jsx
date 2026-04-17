import React, { useEffect, useRef, useState, useCallback } from "react";
import OwnerVerifyGate from "../features/dms/components/OwnerVerifyGate";
import TelegramOwnerRejectOverlay from "../features/dms/components/TelegramOwnerRejectOverlay";
import DriverAuthenticatedWelcome from "../features/dms/components/DriverAuthenticatedWelcome";
import { getWebcamSupportErrorMessage } from "../shared/utils/cameraContext";
import VoiceCarAssistant from "../voice/VoiceCarAssistant";
import FakeYouTubeLayout from "../voice/FakeYouTubeLayout";
import HandQuickAppsMenu, {
  executeQuickAppAction,
  handLabelToQuickAppKey,
  HAND_LABEL_CLOSES_MENU,
  HAND_LABEL_OPENS_MENU,
} from "../features/dms/components/HandQuickAppsMenu";
import {
  API_BASE,
  API_INTERVAL_MS,
  HAND_API_INTERVAL_MS,
  HAND_QUICK_CONFIDENCE,
  IDENTITY_BURST_FRAMES,
  IDENTITY_BURST_GAP_MS,
  DRIVER_ID_KEY,
  DEFAULT_DRIVER_ID,
  HISTORY_SIZE,
  CONSISTENT_FRAMES,
  MIN_PROB_FOR_LABEL,
  EAR_BLINK_THRESH,
  EAR_HISTORY,
  EYES_CLOSED_WARN_MS,
  PHONE_WS_FPS,
  PHONE_YOLO_MIN_PROB,
  PHONE_HISTORY_LEN,
  PHONE_WARN_MS,
  PHONE_STABLE_FRAMES,
  PHONE_OFF_FRAMES,
  SMOKING_WS_FPS,
  SMOKING_MIN_PROB,
  SMOKING_HISTORY_LEN,
  SMOKING_STABLE_FRAMES,
  SMOKING_OFF_FRAMES,
  SMOKING_WARN_MS,
  SMOKING_ENABLED,
  ID_AUTH_LOCK_INTRUDER_FRAMES,
  ID_AUTH_UNLOCK_FRAMES,
  ID_AUTH_RETRY_INTERVAL_MS,
  LABEL_MAP,
  STATUS_ICONS,
} from "../features/dms/constants/monitor.constants";
import {
  L_EYE,
  R_EYE,
  computeEAR,
  computePupilRadius,
  estimateHeadPose,
} from "../features/dms/utils/visionMath.utils";
import { getSmoothedLabel } from "../features/dms/utils/labelSmoothing.utils";
import {
  captureFrame,
  captureBurstFrames,
} from "../features/dms/services/frameCapture.service";
import { startAlarm, stopAlarm } from "../features/dms/services/alarm.service";
import "../features/dms/styles/driver-monitor.animations.css";
import PhoneFOMOOverlay from "../features/dms/components/overlays/PhoneFOMOOverlay";
import SmokingFOMOOverlay from "../features/dms/components/overlays/SmokingFOMOOverlay";
import FaceMeshOverlay from "../features/dms/components/overlays/FaceMeshOverlay";
import HandLandmarkOverlay from "../features/dms/components/overlays/HandLandmarkOverlay";
import EyeCanvas from "../features/dms/components/telemetry/EyeCanvas";
import WaveformCanvas from "../features/dms/components/telemetry/WaveformCanvas";
import Head3D from "../features/dms/components/telemetry/Head3D";
import useDmsSocketStreams from "../features/dms/hooks/useDmsSocketStreams.hook";
import useMediaPipeEngines from "../features/dms/hooks/useMediaPipeEngines.hook";
import useDrivingSession from "../features/dms/hooks/useDrivingSession.hook";
import useDmsAlerts from "../features/dms/hooks/useDmsAlerts.hook";
import useIdentityGate from "../features/dms/hooks/useIdentityGate.hook";

// ─────────────────────────────────────────────────────────
// PhoneFOMOOverlay — đọc từ phoneDetectionRef, vẽ RAF 60fps
// ─────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════
export default function DriverMonitorDMS() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceMeshRef = useRef(null);
  const handsRef = useRef(null);
  const handLandmarksRef = useRef([]);
  const poseRef = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const landmarksRef = useRef([]);
  const eyeDataRef = useRef({
    left: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
    right: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
  });
  const earHistoryRef = useRef({ left: [], right: [] });
  const blinkStateRef = useRef({ left: false, right: false });
  const blinkTimesRef = useRef([]);
  const blinkDurRef = useRef({ start: null, dur: 0 });
  const eyesClosedSinceRef = useRef(null);
  const eyesClosedSecRef = useRef(0);
  const audioCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const vibrateIntervalRef = useRef(null);

  const phoneDetectionRef = useRef({ active: false, prob: 0, bbox: null });
  const phoneActiveFilteredRef = useRef(false);
  const phoneOnStreakRef = useRef(0);
  const phoneOffStreakRef = useRef(0);
  const phoneLastBoxRef = useRef(null);
  const smokingDetectionRef = useRef({ active: false, prob: 0, bbox: null });

  // Smoking hysteresis — tránh nhấp nháy
  const smokingActiveRef = useRef(false); // trạng thái hiện tại (đã qua filter)
  const smokingSinceRef = useRef(null); // timestamp bắt đầu hút liên tục
  const smokingSecRef = useRef(0);

  // Phone continuous alert
  const phoneSinceRef = useRef(null);
  const phoneSecRef = useRef(0);

  // WebSocket refs — phone
  const socketRef = useRef(null);
  const wsReadyRef = useRef(false);
  const wsPendingRef = useRef(false);
  const wsLastSentRef = useRef(0);
  // WebSocket refs — smoking (dùng chung socket, event riêng)
  const wsSmokePendingRef = useRef(false);
  const wsSmokLastSentRef = useRef(0);

  const prevHandOpenRef = useRef("");
  const prevHandCloseRef = useRef("");
  const prevHandQuickRef = useRef("");

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [apiResult, setApiResult] = useState(null);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(false);
  const [smokingResult, setSmokingResult] = useState(null);
  const [smokingError, setSmokingError] = useState("");
  const [smokingHistory, setSmokingHistory] = useState([]);
  const [phoneError, setPhoneError] = useState("");
  const [phoneHistory, setPhoneHistory] = useState([]);
  const [handApiResult, setHandApiResult] = useState(null);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [history, setHistory] = useState([]);
  const [time, setTime] = useState(new Date());
  const [frameCount, setFrameCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [displayPose, setDisplayPose] = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [displayEye, setDisplayEye] = useState({
    blinkRate: 0,
    blinkDur: 0,
    pupilL: "33.5",
    lYaw: "-11.8",
    lPitch: "-21.6",
    rYaw: "-19.9",
    rPitch: "-25.1",
    lX: "61.4",
    lY: "3.9",
    lZ: "-2.7",
    rX: "63.2",
    rY: "9.7",
    rZ: "-3.3",
  });
  const [drowsyAlert, setDrowsyAlert] = useState(null);
  const [phoneActive, setPhoneActive] = useState(false);
  const [phoneAlert, setPhoneAlert] = useState(null);
  const [smokingActive, setSmokingActive] = useState(false); // state để trigger re-render icon
  const [smokingAlert, setSmokingAlert] = useState(null);
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID);
  const [identityOwner, setIdentityOwner] = useState(null);
  const [identityHasRegistered, setIdentityHasRegistered] = useState(false);
  const [identitySimilarity, setIdentitySimilarity] = useState(null);
  const [identityThreshold, setIdentityThreshold] = useState(0.975);
  const [identityError, setIdentityError] = useState("");
  const [identitySamples, setIdentitySamples] = useState(0);
  /** Khi locked: phân biệt màn hình Telegram Reject vs các lý do khác */
  const [identityLockCause, setIdentityLockCause] = useState(
    /** @type {"owner_reject" | "owner_timeout" | "generic" | null} */ (null),
  );
  const [identityRejectLockedAt, setIdentityRejectLockedAt] = useState("");
  /** Hồ sơ hiển thị popup chào mừng sau khi auth xong (~5s) */
  const [authWelcomeProfile, setAuthWelcomeProfile] = useState(null);
  /** Đèn cabin / điều hòa — điều khiển bằng giọng (Hey Car) */
  const [cabinLightsOn, setCabinLightsOn] = useState(false);
  const [cabinAcOn, setCabinAcOn] = useState(false);
  const [youtubeMockOpen, setYoutubeMockOpen] = useState(false);
  const [drivingSessionId, setDrivingSessionId] = useState(null);
  const [drivingSessionStartedAt, setDrivingSessionStartedAt] = useState(null);
  const [sessionAlertCounts, setSessionAlertCounts] = useState({
    phone: 0,
    smoking: 0,
    drowsy: 0,
  });
  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [sessionLogLoading, setSessionLogLoading] = useState(false);
  const [sessionLogItems, setSessionLogItems] = useState([]);

  const dismissAuthWelcome = useCallback(() => setAuthWelcomeProfile(null), []);

  const {
    handleIdentityUnlock,
    handleIdentityLock,
    handleUpdateIdentity,
  } = useIdentityGate({
    API_BASE,
    DRIVER_ID_KEY,
    driverId,
    setDriverId,
    setIdentityError,
    setIdentityLockCause,
    setIdentityRejectLockedAt,
    setStatus,
    setAuthWelcomeProfile,
    setDrowsyAlert,
    setPhoneAlert,
    setSmokingAlert,
    setIdentityHasRegistered,
    setIdentityOwner,
    setIdentitySimilarity,
    setIdentityThreshold,
    setIdentitySamples,
    stopAlarm,
    alarmIntervalRef,
    vibrateIntervalRef,
  });

  useDrivingSession({
    API_BASE,
    status,
    driverId,
    phoneAlert,
    smokingAlert,
    drowsyAlert,
    sessionLogOpen,
    setDrivingSessionId,
    setDrivingSessionStartedAt,
    setSessionAlertCounts,
    setSessionLogLoading,
    setSessionLogItems,
  });

  useDmsSocketStreams({
    API_BASE,
    status,
    videoRef,
    socketRef,
    wsReadyRef,
    wsPendingRef,
    wsLastSentRef,
    wsSmokePendingRef,
    wsSmokLastSentRef,
    phoneDetectionRef,
    smokingDetectionRef,
    smokingActiveRef,
    phoneActiveFilteredRef,
    phoneOnStreakRef,
    phoneOffStreakRef,
    phoneLastBoxRef,
    setWsConnected,
    setPhoneError,
    setPhoneHistory,
    setSmokingHistory,
    setPhoneActive,
    setSmokingActive,
    PHONE_YOLO_MIN_PROB,
    PHONE_HISTORY_LEN,
    PHONE_STABLE_FRAMES,
    PHONE_OFF_FRAMES,
    SMOKING_ENABLED,
    SMOKING_HISTORY_LEN,
    SMOKING_STABLE_FRAMES,
    SMOKING_OFF_FRAMES,
    SMOKING_MIN_PROB,
    PHONE_WS_FPS,
    SMOKING_WS_FPS,
  });

  useMediaPipeEngines({
    status,
    videoRef,
    faceMeshRef,
    handsRef,
    handLandmarksRef,
    poseRef,
    landmarksRef,
    eyeDataRef,
    earHistoryRef,
    blinkStateRef,
    blinkTimesRef,
    blinkDurRef,
    eyesClosedSinceRef,
    eyesClosedSecRef,
    L_EYE,
    R_EYE,
    computeEAR,
    computePupilRadius,
    estimateHeadPose,
    EAR_BLINK_THRESH,
    EAR_HISTORY,
    setFrameCount,
  });

  useDmsAlerts({
    setTime,
    poseRef,
    eyeDataRef,
    blinkTimesRef,
    blinkDurRef,
    smokingDetectionRef,
    smokingSinceRef,
    smokingSecRef,
    phoneDetectionRef,
    phoneSinceRef,
    phoneSecRef,
    eyesClosedSecRef,
    alarmIntervalRef,
    vibrateIntervalRef,
    audioCtxRef,
    setDisplayPose,
    setDisplayEye,
    setFrameCount,
    setSmokingAlert,
    setPhoneAlert,
    setDrowsyAlert,
    startAlarm,
    stopAlarm,
    SMOKING_WARN_MS,
    PHONE_WARN_MS,
    EYES_CLOSED_WARN_MS,
  });

  async function startWebcam() {
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
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("auth");
    } catch (err) {
      setErrorMsg(err.message || "Cannot access webcam");
      setStatus("error");
    }
  }
  function stopWebcam() {
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarksRef.current = [];
    handLandmarksRef.current = [];
    setStatus("idle");
    poseRef.current = { yaw: 0, pitch: 0, roll: 0 };
    stopAlarm(alarmIntervalRef, vibrateIntervalRef);
    setDrowsyAlert(null);
    eyesClosedSinceRef.current = null;
    eyesClosedSecRef.current = 0;
    phoneDetectionRef.current = { active: false, prob: 0, bbox: null };
    phoneActiveFilteredRef.current = false;
    phoneOnStreakRef.current = 0;
    phoneOffStreakRef.current = 0;
    phoneLastBoxRef.current = null;
    smokingDetectionRef.current = { active: false, prob: 0, bbox: null };
    wsPendingRef.current = false;
    wsSmokePendingRef.current = false;
    phoneSinceRef.current = null;
    phoneSecRef.current = 0;
    smokingActiveRef.current = false;
    smokingSinceRef.current = null;
    smokingSecRef.current = 0;
    setPhoneActive(false);
    setPhoneAlert(null);
    setSmokingActive(false);
    setSmokingAlert(null);
    setIdentityOwner(null);
    setIdentitySimilarity(null);
    setIdentityError("");
    setIdentitySamples(0);
    setIdentityLockCause(null);
    setIdentityRejectLockedAt("");
    setHandApiResult(null);
    setAppMenuOpen(false);
  }
  useEffect(() => {
    startWebcam();
    return () => stopWebcam();
  }, []);


  // ── REST API loop: landmark + smoking (giữ 1s) ──────────
  useEffect(() => {
    if (status !== "active") return;
    let cancelled = false,
      tid;
    async function loop() {
      if (cancelled) return;
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) {
        if (!cancelled) tid = setTimeout(loop, API_INTERVAL_MS);
        return;
      }
      try {
        setApiLoading(true);
        setApiError("");
        const frames = await captureBurstFrames(
          vid,
          IDENTITY_BURST_FRAMES,
          IDENTITY_BURST_GAP_MS,
        );
        const image = frames[0] || captureFrame(vid, 0.75);
        if (!image) {
          throw new Error("Không lấy được hình ảnh webcam");
        }

        // Chỉ gọi landmark REST — smoking đã chuyển sang WebSocket
        const res = await fetch(`${API_BASE}/api/landmark/predict_from_frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "API failed");
        setApiResult(data);
        setLastUpdated(new Date().toLocaleTimeString());

        // label history
        const scores = data?.scores || {};
        const entries = Object.entries(scores);
        let topLabel = data?.label || "unknown",
          topProb = typeof data?.prob === "number" ? data.prob : 0;
        if (entries.length) {
          const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
          topLabel = topLabel || sorted[0][0];
          if (!topProb || isNaN(topProb)) topProb = sorted[0][1] || 0;
        }
        setHistory((prev) => {
          const n = prev.concat([{ label: topLabel, prob: topProb }]);
          return n.length > HISTORY_SIZE ? n.slice(n.length - HISTORY_SIZE) : n;
        });
      } catch (err) {
        setApiError(err.message || "Cannot reach API");
      } finally {
        setApiLoading(false);
      }
      if (!cancelled) tid = setTimeout(loop, API_INTERVAL_MS);
    }
    loop();
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [status]);

  // ── Hand API (train_hands labels: open, map, music, phonecall, no_sign) ──
  useEffect(() => {
    if (status !== "active") {
      setHandApiResult(null);
      return;
    }
    let cancelled = false,
      tid;
    async function loop() {
      if (cancelled) return;
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) {
        tid = setTimeout(loop, HAND_API_INTERVAL_MS);
        return;
      }
      try {
        const image = captureFrame(vid, 0.82);
        if (!image) {
          tid = setTimeout(loop, HAND_API_INTERVAL_MS);
          return;
        }
        const res = await fetch(`${API_BASE}/api/hand/predict_from_frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "hand API failed");
        if (!cancelled) setHandApiResult(data);
      } catch {
        if (!cancelled) setHandApiResult(null);
      }
      if (!cancelled) tid = setTimeout(loop, HAND_API_INTERVAL_MS);
    }
    loop();
    return () => {
      cancelled = true;
      if (tid) clearTimeout(tid);
    };
  }, [status]);

  // ── Quick Apps: open -> menu; no_sign -> dong; map/music/phonecall khi menu mo ──
  useEffect(() => {
    if (status !== "active") {
      setAppMenuOpen(false);
      prevHandOpenRef.current = "";
      prevHandCloseRef.current = "";
      prevHandQuickRef.current = "";
      return;
    }
    const prob =
      typeof handApiResult?.prob === "number" ? handApiResult.prob : null;
    if (prob === null || prob < HAND_QUICK_CONFIDENCE) return;
    const label = (handApiResult?.label || "").toString().trim().toLowerCase();

    if (label === HAND_LABEL_OPENS_MENU) {
      if (prevHandOpenRef.current !== label) setAppMenuOpen(true);
      prevHandOpenRef.current = label;
    } else {
      prevHandOpenRef.current = "";
    }

    if (label === HAND_LABEL_CLOSES_MENU) {
      if (prevHandCloseRef.current !== label) setAppMenuOpen(false);
      prevHandCloseRef.current = label;
    } else {
      prevHandCloseRef.current = "";
    }

    const appKey = handLabelToQuickAppKey(label);
    if (appMenuOpen && appKey) {
      if (prevHandQuickRef.current !== label) {
        executeQuickAppAction(appKey);
      }
      prevHandQuickRef.current = label;
    } else {
      prevHandQuickRef.current = "";
    }
  }, [status, handApiResult, appMenuOpen]);

  // ── Smoothed label ──
  const smoothedLabel = getSmoothedLabel(
    apiResult,
    history,
    MIN_PROB_FOR_LABEL,
    CONSISTENT_FRAMES,
  );
  const currentLabel = smoothedLabel;
  const info = LABEL_MAP[currentLabel] || LABEL_MAP.unknown;
  const isAlert = info.level === "risk" || info.level === "warning";
  const yDeg = ((displayPose.yaw * 180) / Math.PI).toFixed(1);
  const pDeg = ((displayPose.pitch * 180) / Math.PI).toFixed(1);
  const rDeg = ((displayPose.roll * 180) / Math.PI).toFixed(1);
  const phoneIconActive = status === "active" && phoneActive;
  const smokingIconActive = status === "active" && SMOKING_ENABLED && smokingActive;
  const activeIcons = STATUS_ICONS.map((ic) => {
    let active = false;
    if (ic.id === "camera") active = status === "active";
    if (ic.id === "attentive") active = currentLabel === "safe";
    if (ic.id === "awake")
      active =
        status === "active" &&
        currentLabel !== "drowsy" &&
        currentLabel !== "yawning" &&
        !drowsyAlert;
    if (ic.id === "seatbelt") active = true;
    if (ic.id === "cabin") active = cabinLightsOn || cabinAcOn;
    if (ic.id === "phone") active = phoneIconActive;
    if (ic.id === "smoking") active = smokingIconActive;
    return { ...ic, active };
  });
  const iconCircleBase = {
    width: 56,
    height: 56,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    cursor: "pointer",
  };
  const blinkHL = displayEye.blinkDur > 0.15;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        fontFamily: "'Segoe UI',Arial,sans-serif",
        color: "#ccd8e8",
        display: "flex",
        overflow: "hidden",
        fontSize: 12,
      }}
    >
      {/* ══ LEFT ══ */}
      <div
        style={{
          width: "35%",
          minWidth: 340,
          background: "#000",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid #0d1e30",
        }}
      >
        <div
          style={{
            flex: "0 0 260px",
            background: "#000",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Head3D poseRef={poseRef} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#000",
            overflow: "hidden",
            padding: "4px 8px",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                background: "#1e5fc0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              i
            </div>
            {["Yaw", "Pitch", "Roll"].map((label, i) => (
              <React.Fragment key={label}>
                <div
                  style={{
                    background: "#0a1828",
                    border: "1px solid #1a3a58",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#5a8ab0",
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    background: "#0a1828",
                    border: "1px solid #1a3a58",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#7ab8d8",
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {[yDeg, pDeg, rDeg][i]}°
                </div>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {[
              { label: "Pupil dilation", val: `${displayEye.pupilL}%` },
              { label: "Blink rate", val: `${displayEye.blinkRate}` },
            ].map(({ label, val }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  style={{ fontSize: 9, color: "#5a8ab0", textAlign: "center" }}
                >
                  {label}
                </span>
                <div
                  style={{
                    background: "#0a1828",
                    border: "1px solid #1a3a58",
                    borderRadius: 3,
                    padding: "3px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#7ab8d8",
                    textAlign: "center",
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
            <div
              style={{
                flex: 1.3,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{ fontSize: 9, color: "#5a8ab0", textAlign: "center" }}
              >
                Blink duration
              </span>
              <div
                style={{
                  background: blinkHL ? "#1e5fc0" : "#0a1828",
                  border: blinkHL ? "1px solid #3b9eff" : "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: blinkHL ? "#fff" : "#7ab8d8",
                  textAlign: "center",
                }}
              >
                {typeof displayEye.blinkDur === "number"
                  ? displayEye.blinkDur.toFixed(2)
                  : "0.00"}{" "}
                sec
              </div>
            </div>
            <div
              style={{
                flex: 0.8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 9, color: "#5a8ab0" }}>Glasses</span>
              <div
                style={{
                  background: "#0a1828",
                  border: "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "2px 6px",
                  fontSize: 18,
                  textAlign: "center",
                }}
              >
                🕶️
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {["Left_Eye", "Right_Eye"].map((e) => (
              <div
                key={e}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 11,
                  color: "#7ab8d8",
                  borderBottom: "1px solid #1a3a58",
                  paddingBottom: 3,
                }}
              >
                <span
                  style={{ textDecoration: "underline", cursor: "pointer" }}
                >
                  {e}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, height: 90 }}>
            {["left", "right"].map((side) => (
              <div
                key={side}
                style={{
                  flex: 1,
                  background: "#000",
                  border: "1px solid #0d2a44",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <EyeCanvas eyeDataRef={eyeDataRef} side={side} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              [displayEye.lYaw, displayEye.lPitch],
              [displayEye.rYaw, displayEye.rPitch],
            ].map((vals, i) => (
              <div key={i} style={{ flex: 1, display: "flex", gap: 3 }}>
                {["Yaw", "Pitch"].map((lbl, j) => (
                  <div
                    key={lbl}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      flex: 1,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#5a8ab0" }}>{lbl}</span>
                    <div
                      style={{
                        background: "#0a1828",
                        border: "1px solid #1a3a58",
                        borderRadius: 3,
                        padding: "3px 4px",
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "#7ab8d8",
                        textAlign: "center",
                      }}
                    >
                      {vals[j]}°
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              [displayEye.lX, displayEye.lY, displayEye.lZ],
              [displayEye.rX, displayEye.rY, displayEye.rZ],
            ].map((vals, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  gap: 2,
                  alignItems: "center",
                }}
              >
                {["X", "Y", "Z"].map((lbl, j) => (
                  <React.Fragment key={lbl}>
                    <span
                      style={{ fontSize: 9, color: "#3a6a88", flexShrink: 0 }}
                    >
                      {lbl}
                    </span>
                    <div
                      style={{
                        background: "#0a1828",
                        border: "1px solid #1a3a58",
                        borderRadius: 3,
                        padding: "2px 4px",
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "#7ab8d8",
                        textAlign: "center",
                        flex: 1,
                      }}
                    >
                      {vals[j]}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              gap: 5,
              minHeight: 0,
              overflow: "hidden",
              paddingBottom: 4,
            }}
          >
            {[
              ["left", 2],
              ["right", 0.7],
              ["left", 2],
              ["right", 0.7],
            ].map(([side, flex], i) => (
              <div
                key={i}
                style={{
                  flex,
                  background: "#000",
                  border: "1px solid #0a1e30",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <WaveformCanvas
                  earHistoryRef={earHistoryRef}
                  side={side}
                  color="#1e90ff"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ RIGHT ══ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#000",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* icons */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            gap: 16,
            paddingTop: 10,
            paddingBottom: 8,
            background:
              "linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 100%)",
            pointerEvents: "none",
          }}
        >
          {activeIcons.map((ic) => (
            <div
              key={ic.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
              }}
            >
              <div
                style={{
                  ...iconCircleBase,
                  background: ic.active
                    ? "radial-gradient(circle at 35% 35%,#5ab0ff,#1e70e0)"
                    : "radial-gradient(circle at 35% 35%,#3a5070,#1a2840)",
                  border: ic.active
                    ? "2px solid rgba(100,180,255,0.6)"
                    : "2px solid rgba(40,80,120,0.5)",
                  boxShadow: ic.active
                    ? "0 0 14px rgba(60,150,255,0.5),inset 0 1px 0 rgba(255,255,255,0.2)"
                    : "inset 0 1px 0 rgba(255,255,255,0.05)",
                  filter: ic.active ? "none" : "grayscale(0.6) opacity(0.55)",
                  pointerEvents: "auto",
                  ...(ic.id === "phone" && ic.active
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#ffaa40,#ff6b00)",
                        border: "2px solid rgba(255,160,50,0.8)",
                        boxShadow: "0 0 18px rgba(255,140,0,0.7)",
                      }
                    : {}),
                  ...(ic.id === "smoking" && ic.active
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#ff6060,#cc2020)",
                        border: "2px solid rgba(255,80,40,0.8)",
                        boxShadow: "0 0 18px rgba(255,60,20,0.7)",
                      }
                    : {}),
                  ...(ic.id === "cabin" && cabinLightsOn
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#ffe08a,#d4a017)",
                        border: "2px solid rgba(255,220,120,0.85)",
                        boxShadow: "0 0 20px rgba(255,210,80,0.65)",
                        filter: "none",
                      }
                    : {}),
                  ...(ic.id === "cabin" && cabinAcOn && !cabinLightsOn
                    ? {
                        background:
                          "radial-gradient(circle at 35% 35%,#7ecbff,#2080c0)",
                        border: "2px solid rgba(120,200,255,0.8)",
                        boxShadow: "0 0 16px rgba(80,180,255,0.55)",
                        filter: "none",
                      }
                    : {}),
                }}
              >
                <span style={{ fontSize: 22 }}>{ic.icon}</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: ic.active ? "#fff" : "rgba(160,190,220,0.55)",
                  textShadow: ic.active ? "0 1px 4px rgba(0,0,0,0.8)" : "none",
                }}
              >
                {ic.label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
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
              filter: "brightness(0.9) contrast(1.05)",
            }}
          />
          {status === "active" && cabinLightsOn && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 22,
                background:
                  "radial-gradient(ellipse 85% 50% at 50% 8%, rgba(255,248,210,0.4) 0%, rgba(255,235,180,0.12) 35%, transparent 65%)",
              }}
            />
          )}
          <VoiceCarAssistant
            enabled={status === "active"}
            requireWake
            onLightChange={setCabinLightsOn}
            onAcChange={setCabinAcOn}
            onYoutubeOpen={() => setYoutubeMockOpen(true)}
            onYoutubeClose={() => setYoutubeMockOpen(false)}
          />
          <OwnerVerifyGate
            enabled={status === "auth" || status === "active" || status === "locked"}
            carState={status === "active" ? "active" : status === "locked" ? "locked" : "auth"}
            videoRef={videoRef}
            driverId={driverId}
            apiBase={API_BASE}
            unlockStreakFrames={ID_AUTH_UNLOCK_FRAMES}
            lockStreakFrames={ID_AUTH_LOCK_INTRUDER_FRAMES}
            verifyIntervalMs={ID_AUTH_RETRY_INTERVAL_MS}
            decisionTimeoutSec={30}
            onUnlock={handleIdentityUnlock}
            onLock={handleIdentityLock}
            onUpdateIdentity={handleUpdateIdentity}
          />
          {status === "active" && (
            <FaceMeshOverlay
              landmarksRef={landmarksRef}
              eyeDataRef={eyeDataRef}
              videoRef={videoRef}
            />
          )}
          {status === "active" && (
            <HandLandmarkOverlay
              handLandmarksRef={handLandmarksRef}
              videoRef={videoRef}
            />
          )}
          {status === "active" && (
            <HandQuickAppsMenu
              open={appMenuOpen}
              onRequestClose={() => setAppMenuOpen(false)}
            />
          )}
          {status === "active" && (
            <PhoneFOMOOverlay
              phoneDetectionRef={phoneDetectionRef}
              landmarksRef={landmarksRef}
              videoRef={videoRef}
            />
          )}
          {status === "active" && SMOKING_ENABLED && (
            <SmokingFOMOOverlay
              smokingDetectionRef={smokingDetectionRef}
              landmarksRef={landmarksRef}
              videoRef={videoRef}
            />
          )}

          {/* HUD */}
          {status === "active" && (
            <div
              style={{
                position: "absolute",
                top: 82,
                left: 14,
                pointerEvents: "none",
                lineHeight: "1.9",
                zIndex: 6,
              }}
            >
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                FPS : 30
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Person ID : Tall
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                AOI : 0
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Eye Mode : {faceMeshRef.current ? "SACCADE" : "STANDBY"}
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Driver ID : {driverId}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color:
                    identityOwner === true
                      ? "#00e578"
                      : identityOwner === false
                        ? "#ff4560"
                        : "#ffc940",
                  fontWeight: 700,
                }}
              >
                Real Driver :{" "}
                {identityHasRegistered
                  ? identityOwner === true
                    ? "YES"
                    : identityOwner === false
                      ? "NO"
                      : "CHECKING"
                  : "NOT REGISTERED"}
              </div>
              <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
                Face Match :{" "}
                {typeof identitySimilarity === "number"
                  ? `${(identitySimilarity * 100).toFixed(2)}%`
                  : "--"}{" "}
                ({identitySamples || 0} frames)
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: phoneIconActive ? "#ffaa40" : "#3b9eff",
                  fontWeight: 500,
                }}
              >
                Phone WS :{" "}
                {wsConnected
                  ? phoneIconActive
                    ? `⚠ YES (${((phoneDetectionRef.current?.prob || 0) * 100).toFixed(0)}%)`
                    : "NO"
                  : "⚠ disconnected"}
              </div>
              <div style={{ fontSize: 13, color: "#7ee787", fontWeight: 500 }}>
                Hand API :{" "}
                {handApiResult?.label
                  ? `${handApiResult.label} (${((handApiResult.prob || 0) * 100).toFixed(0)}%)`
                  : "--"}
                {appMenuOpen ? " | QuickApps ON" : ""}
              </div>
              {identityError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}
                >
                  Identity: {identityError}
                </div>
              )}
              {phoneError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}
                >
                  {phoneError}
                </div>
              )}
              <div
                style={{
                  pointerEvents: "auto",
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(60,120,180,0.35)",
                  maxWidth: 280,
                }}
              >
                <div style={{ fontSize: 12, color: "#8ecae6", fontWeight: 600 }}>
                  Phiên lái #{drivingSessionId ?? "…"}
                  {drivingSessionStartedAt
                    ? ` · ${drivingSessionStartedAt}`
                    : ""}
                </div>
                <div style={{ fontSize: 11, color: "#a8d8ff", marginTop: 2 }}>
                  Cảnh báo (lần phát hiện): 📱 {sessionAlertCounts.phone} · 🚬{" "}
                  {sessionAlertCounts.smoking} · 😴 {sessionAlertCounts.drowsy}
                </div>
                <button
                  type="button"
                  onClick={() => setSessionLogOpen((o) => !o)}
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "1px solid rgba(100,180,255,0.5)",
                    background: "rgba(10,40,70,0.85)",
                    color: "#cfe8ff",
                    cursor: "pointer",
                  }}
                >
                  {sessionLogOpen ? "Ẩn lịch sử phiên" : "Lịch sử phiên (fleet demo)"}
                </button>
                {sessionLogOpen && (
                  <div
                    style={{
                      marginTop: 8,
                      maxHeight: 180,
                      overflow: "auto",
                      fontSize: 10,
                      color: "#9ecfff",
                      fontFamily: "monospace",
                      lineHeight: 1.45,
                      background: "rgba(0,20,40,0.5)",
                      padding: 8,
                      borderRadius: 4,
                    }}
                  >
                    {sessionLogLoading ? (
                      <span>Đang tải…</span>
                    ) : sessionLogItems.length === 0 ? (
                      <span>Chưa có phiên nào.</span>
                    ) : (
                      sessionLogItems.map((s) => (
                        <div key={s.session_id} style={{ marginBottom: 6 }}>
                          #{s.session_id}{" "}
                          {s.started_at} → {s.ended_at || "…"} ·{" "}
                          {Object.entries(s.alerts || {})
                            .map(([k, v]) => `${k}:${v}`)
                            .join(" ")}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              {SMOKING_ENABLED && (
                <div
                  style={{
                    fontSize: 13,
                    color: smokingIconActive ? "#ff6040" : "#3b9eff",
                    fontWeight: 500,
                  }}
                >
                  Smoking :{" "}
                  {smokingIconActive
                    ? `⚠ YES (${smokingSecRef.current.toFixed(0)}s)`
                    : smokingResult
                      ? "NO"
                      : "..."}
                </div>
              )}
              {SMOKING_ENABLED && smokingError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}
                >
                  Smoking API error
                </div>
              )}
            </div>
          )}

          {status === "active" && identityHasRegistered && (
            <div
              style={{
                position: "absolute",
                top: 88,
                right: 18,
                zIndex: 9,
                pointerEvents: "none",
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${identityOwner === true ? "rgba(0,229,120,0.6)" : identityOwner === false ? "rgba(255,69,96,0.7)" : "rgba(255,201,64,0.7)"}`,
                background:
                  identityOwner === true
                    ? "rgba(0,40,20,0.65)"
                    : identityOwner === false
                      ? "rgba(60,0,10,0.68)"
                      : "rgba(45,35,0,0.62)",
                color:
                  identityOwner === true
                    ? "#00e578"
                    : identityOwner === false
                      ? "#ff4560"
                      : "#ffc940",
                fontWeight: 700,
                letterSpacing: "0.08em",
                fontSize: 12,
              }}
            >
              {identityOwner === true
                ? "✓ OWNER VERIFIED"
                : identityOwner === false
                  ? "✕ INTRUDER DETECTED"
                  : "… VERIFYING OWNER"}
            </div>
          )}

          {/* Drowsy alert */}
          {drowsyAlert !== null && status === "active" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.75)",
                animation: "drowsyBg 0.5s ease-in-out infinite alternate",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  border: "5px solid #ff1a1a",
                  animation: "alarmBorder 0.4s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
              {[
                { top: 0, left: 0 },
                { top: 0, right: 0 },
                { bottom: 0, left: 0 },
                { bottom: 0, right: 0 },
              ].map((pos, i) =>
                React.createElement("div", {
                  key: i,
                  style: {
                    position: "absolute",
                    width: 40,
                    height: 40,
                    background: "rgba(255,30,30,0.35)",
                    animation: "cornerFlash 0.4s ease-in-out infinite",
                    animationDelay: i * 0.1 + "s",
                    pointerEvents: "none",
                    ...pos,
                  },
                }),
              )}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 16,
                  pointerEvents: "none",
                }}
              >
                {[
                  {
                    icon: "🔊",
                    text: "ÂM THANH BẬT",
                    bg: "rgba(255,50,50,0.2)",
                    border: "rgba(255,80,80,0.6)",
                    color: "#ff8080",
                    delay: "0s",
                  },
                  {
                    icon: "📳",
                    text: "RUNG",
                    bg: "rgba(255,140,0,0.18)",
                    border: "rgba(255,160,0,0.5)",
                    color: "#ffaa40",
                    delay: "0.45s",
                  },
                ].map((b) => (
                  <div
                    key={b.text}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: b.bg,
                      border: `1px solid ${b.border}`,
                      borderRadius: 20,
                      padding: "4px 14px",
                      animation: "badgePulse 0.9s ease-in-out infinite",
                      animationDelay: b.delay,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.icon}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: b.color,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  fontSize: 72,
                  marginBottom: 12,
                  animation: "iconBounce 0.7s ease-in-out infinite",
                  filter: "drop-shadow(0 0 24px rgba(255,40,40,0.95))",
                  pointerEvents: "none",
                }}
              >
                😴
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color: "#ff1a1a",
                  letterSpacing: "0.1em",
                  textShadow: "0 0 24px rgba(255,20,20,0.95)",
                  animation: "textFlash 0.5s ease-in-out infinite",
                  marginBottom: 6,
                  pointerEvents: "none",
                }}
              >
                ⚠ CẢNH BÁO BUỒN NGỦ
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#ffcc00",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  marginBottom: 20,
                  pointerEvents: "none",
                }}
              >
                Tài xế nhắm mắt quá lâu — Hãy dừng xe và nghỉ ngơi!
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(255,50,50,0.6)",
                    borderRadius: 8,
                    padding: "6px 20px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: "#ff8080",
                      letterSpacing: "0.14em",
                      marginBottom: 2,
                    }}
                  >
                    THỜI GIAN NHẮM MẮT
                  </span>
                  <span
                    style={{
                      fontSize: 34,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "#ff3030",
                      lineHeight: 1,
                    }}
                  >
                    {drowsyAlert.toFixed(1)}
                    <span style={{ fontSize: 16, color: "#ff6060" }}>s</span>
                  </span>
                </div>
              </div>
              <div
                style={{
                  width: "55%",
                  marginBottom: 20,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 9, color: "#ff6060" }}>3s</span>
                  <span
                    style={{ fontSize: 9, color: "#ff2020", fontWeight: 700 }}
                  >
                    MỨC ĐỘ NGUY HIỂM
                  </span>
                  <span style={{ fontSize: 9, color: "#ff6060" }}>
                    {Math.min(drowsyAlert, 10).toFixed(0)}s
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 8,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: Math.min(100, ((drowsyAlert - 3) / 7) * 100) + "%",
                      background: "linear-gradient(90deg,#ff6600,#ff0000)",
                      borderRadius: 4,
                      transition: "width 0.25s linear",
                    }}
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  stopAlarm(alarmIntervalRef, vibrateIntervalRef);
                  setDrowsyAlert(null);
                  eyesClosedSinceRef.current = null;
                  eyesClosedSecRef.current = 0;
                }}
                style={{
                  padding: "8px 28px",
                  background: "rgba(255,255,255,0.12)",
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                }}
              >
                ✕ BỎ QUA CẢNH BÁO
              </button>
            </div>
          )}

          {/* ── SMOKING ALERT ── */}
          {SMOKING_ENABLED &&
            smokingAlert !== null &&
            status === "active" &&
            drowsyAlert === null &&
            phoneAlert === null && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 18,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.72)",
                  animation: "smokingBg 0.6s ease-in-out infinite alternate",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    border: "5px solid #ff3a00",
                    animation: "smokingBorder 0.45s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
                {[
                  { top: 0, left: 0 },
                  { top: 0, right: 0 },
                  { bottom: 0, left: 0 },
                  { bottom: 0, right: 0 },
                ].map((pos, i) =>
                  React.createElement("div", {
                    key: i,
                    style: {
                      position: "absolute",
                      width: 44,
                      height: 44,
                      background: "rgba(255,60,0,0.28)",
                      animation: "cornerFlash 0.45s ease-in-out infinite",
                      animationDelay: i * 0.1 + "s",
                      pointerEvents: "none",
                      ...pos,
                    },
                  }),
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  {[
                    {
                      icon: "🔊",
                      text: "ÂM THANH BẬT",
                      bg: "rgba(255,60,0,0.18)",
                      border: "rgba(255,80,20,0.6)",
                      color: "#ff7040",
                      delay: "0s",
                    },
                    {
                      icon: "📳",
                      text: "RUNG",
                      bg: "rgba(200,60,0,0.15)",
                      border: "rgba(220,80,0,0.5)",
                      color: "#ff6030",
                      delay: "0.4s",
                    },
                  ].map((b) => (
                    <div
                      key={b.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: b.bg,
                        border: `1px solid ${b.border}`,
                        borderRadius: 20,
                        padding: "4px 14px",
                        animation: "badgePulse 0.9s ease-in-out infinite",
                        animationDelay: b.delay,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{b.icon}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: b.color,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {b.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 72,
                    marginBottom: 12,
                    animation: "iconBounce 0.7s ease-in-out infinite",
                    filter: "drop-shadow(0 0 28px rgba(255,60,0,0.95))",
                    pointerEvents: "none",
                  }}
                >
                  🚬
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#ff4500",
                    letterSpacing: "0.1em",
                    textShadow: "0 0 24px rgba(255,60,0,0.95)",
                    animation: "textFlash 0.5s ease-in-out infinite",
                    marginBottom: 6,
                    pointerEvents: "none",
                  }}
                >
                  ⚠ CẢNH BÁO HÚT THUỐC
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#ffcc00",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  Tài xế đang hút thuốc khi lái xe — Nguy hiểm!
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(255,60,0,0.6)",
                      borderRadius: 8,
                      padding: "6px 24px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#ff7040",
                        letterSpacing: "0.14em",
                        marginBottom: 2,
                      }}
                    >
                      THỜI GIAN HÚT THUỐC
                    </span>
                    <span
                      style={{
                        fontSize: 34,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: "#ff4500",
                        lineHeight: 1,
                      }}
                    >
                      {smokingAlert.toFixed(1)}
                      <span style={{ fontSize: 16, color: "#ff7040" }}>s</span>
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    width: "55%",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#ff7040" }}>4s</span>
                    <span
                      style={{ fontSize: 9, color: "#ff4500", fontWeight: 700 }}
                    >
                      MỨC ĐỘ NGUY HIỂM
                    </span>
                    <span style={{ fontSize: 9, color: "#ff7040" }}>
                      {Math.min(smokingAlert, 30).toFixed(0)}s
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 8,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width:
                          Math.min(100, ((smokingAlert - 4) / 26) * 100) + "%",
                        background: "linear-gradient(90deg,#ff6000,#cc2200)",
                        borderRadius: 4,
                        transition: "width 0.25s linear",
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    stopAlarm(alarmIntervalRef, vibrateIntervalRef);
                    setSmokingAlert(null);
                    smokingSinceRef.current = null;
                    smokingSecRef.current = 0;
                  }}
                  style={{
                    padding: "8px 28px",
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                  }}
                >
                  ✕ BỎ QUA CẢNH BÁO
                </button>
              </div>
            )}

          {/* ── PHONE ALERT ── */}
          {phoneAlert !== null &&
            status === "active" &&
            drowsyAlert === null && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 19,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.72)",
                  animation: "phoneBg 0.6s ease-in-out infinite alternate",
                }}
              >
                {/* border nhấp nháy màu cam */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    border: "5px solid #ff8c00",
                    animation: "phoneAlarmBorder 0.45s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
                {/* góc flash */}
                {[
                  { top: 0, left: 0 },
                  { top: 0, right: 0 },
                  { bottom: 0, left: 0 },
                  { bottom: 0, right: 0 },
                ].map((pos, i) =>
                  React.createElement("div", {
                    key: i,
                    style: {
                      position: "absolute",
                      width: 44,
                      height: 44,
                      background: "rgba(255,140,0,0.3)",
                      animation: "cornerFlash 0.45s ease-in-out infinite",
                      animationDelay: i * 0.1 + "s",
                      pointerEvents: "none",
                      ...pos,
                    },
                  }),
                )}
                {/* badges */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  {[
                    {
                      icon: "🔊",
                      text: "ÂM THANH BẬT",
                      bg: "rgba(255,140,0,0.18)",
                      border: "rgba(255,160,0,0.6)",
                      color: "#ffaa40",
                      delay: "0s",
                    },
                    {
                      icon: "📳",
                      text: "RUNG",
                      bg: "rgba(255,100,0,0.15)",
                      border: "rgba(255,120,0,0.5)",
                      color: "#ff8c40",
                      delay: "0.4s",
                    },
                  ].map((b) => (
                    <div
                      key={b.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: b.bg,
                        border: `1px solid ${b.border}`,
                        borderRadius: 20,
                        padding: "4px 14px",
                        animation: "badgePulse 0.9s ease-in-out infinite",
                        animationDelay: b.delay,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{b.icon}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: b.color,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {b.text}
                      </span>
                    </div>
                  ))}
                </div>
                {/* icon */}
                <div
                  style={{
                    fontSize: 72,
                    marginBottom: 12,
                    animation: "iconBounce 0.7s ease-in-out infinite",
                    filter: "drop-shadow(0 0 28px rgba(255,140,0,0.95))",
                    pointerEvents: "none",
                  }}
                >
                  📱
                </div>
                {/* tiêu đề */}
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#ff8c00",
                    letterSpacing: "0.1em",
                    textShadow: "0 0 24px rgba(255,140,0,0.95)",
                    animation: "textFlash 0.5s ease-in-out infinite",
                    marginBottom: 6,
                    pointerEvents: "none",
                  }}
                >
                  ⚠ CẢNH BÁO DÙNG ĐIỆN THOẠI
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#ffcc00",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  Tài xế đang sử dụng điện thoại — Tập trung vào lái xe!
                </div>
                {/* timer box */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 18,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(255,140,0,0.6)",
                      borderRadius: 8,
                      padding: "6px 24px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#ffaa40",
                        letterSpacing: "0.14em",
                        marginBottom: 2,
                      }}
                    >
                      THỜI GIAN DÙNG PHONE
                    </span>
                    <span
                      style={{
                        fontSize: 34,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: "#ff8c00",
                        lineHeight: 1,
                      }}
                    >
                      {phoneAlert.toFixed(1)}
                      <span style={{ fontSize: 16, color: "#ffaa40" }}>s</span>
                    </span>
                  </div>
                </div>
                {/* progress bar */}
                <div
                  style={{
                    width: "55%",
                    marginBottom: 22,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 9, color: "#ffaa40" }}>3s</span>
                    <span
                      style={{ fontSize: 9, color: "#ff8c00", fontWeight: 700 }}
                    >
                      MỨC ĐỘ NGUY HIỂM
                    </span>
                    <span style={{ fontSize: 9, color: "#ffaa40" }}>
                      {Math.min(phoneAlert, 30).toFixed(0)}s
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 8,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width:
                          Math.min(100, ((phoneAlert - 3) / 27) * 100) + "%",
                        background: "linear-gradient(90deg,#ff8c00,#ff4500)",
                        borderRadius: 4,
                        transition: "width 0.25s linear",
                      }}
                    />
                  </div>
                </div>
                {/* nút bỏ qua */}
                <button
                  onClick={() => {
                    stopAlarm(alarmIntervalRef, vibrateIntervalRef);
                    setPhoneAlert(null);
                    phoneSinceRef.current = null;
                    phoneSecRef.current = 0;
                  }}
                  style={{
                    padding: "8px 28px",
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                  }}
                >
                  ✕ BỎ QUA CẢNH BÁO
                </button>
              </div>
            )}

          {isAlert && status === "active" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                border: "3px solid " + info.color,
                animation: "borderPulse 1.2s ease-in-out infinite",
                zIndex: 6,
              }}
            />
          )}

          {status === "active" && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                pointerEvents: "none",
                zIndex: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: info.color,
                  animation: "glow 1.5s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: info.color,
                  letterSpacing: "0.1em",
                }}
              >
                {info.vi}
              </span>
              {apiResult?.prob != null && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {(apiResult.prob * 100).toFixed(1)}%
                </span>
              )}
              {apiLoading && (
                <span style={{ fontSize: 10, color: "#ffc940" }}>⟳</span>
              )}
              {apiError && (
                <span style={{ fontSize: 10, color: "#ff4560" }}>⚠ API</span>
              )}
            </div>
          )}
          {status === "active" && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 14,
                fontSize: 11,
                color: "rgba(100,150,200,0.5)",
                pointerEvents: "none",
                zIndex: 6,
              }}
            >
              {time.toLocaleTimeString("en-US", { hour12: false })}
            </div>
          )}

          {status === "loading" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#3b9eff",
                  letterSpacing: "0.2em",
                  animation: "blink 1s infinite",
                }}
              >
                INITIALIZING CAMERA...
              </div>
              <div
                style={{
                  width: 200,
                  height: 2,
                  background: "rgba(60,150,255,0.12)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "#3b9eff",
                    animation: "loadBar 1.5s infinite",
                    width: "40%",
                  }}
                />
              </div>
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
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#ff4560",
                  letterSpacing: "0.1em",
                }}
              >
                ⚠ Camera Error
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#4a7a9a",
                  maxWidth: 280,
                  textAlign: "center",
                  lineHeight: "1.6",
                }}
              >
                {errorMsg}
              </div>
              <button
                onClick={startWebcam}
                style={{
                  padding: "6px 20px",
                  background: "rgba(60,150,255,0.1)",
                  border: "1px solid rgba(60,150,255,0.4)",
                  color: "#3b9eff",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Retry
              </button>
            </div>
          )}
          {status === "auth" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.82)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                zIndex: 30,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#ffc940",
                  letterSpacing: "0.15em",
                  fontWeight: 800,
                }}
              >
                CAR AUTH REQUIRED
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#9bd3ff",
                  maxWidth: 420,
                  lineHeight: 1.6,
                }}
              >
                Đang xác thực chủ xe bằng khuôn mặt cho <b>{driverId}</b>.
                <br />
                Nếu không phải chủ xe, hệ thống sẽ khóa về trạng thái chờ.
              </div>
              {identityError && (
                <div
                  style={{ fontSize: 12, color: "#ff8080", fontWeight: 700 }}
                >
                  {identityError}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#7ab8d8" }}>
                {typeof identitySimilarity === "number"
                  ? `MATCH: ${(identitySimilarity * 100).toFixed(2)}%`
                  : "MATCH: --"}
              </div>
              <div
                style={{
                  width: 240,
                  height: 2,
                  background: "rgba(60,150,255,0.12)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "#3b9eff",
                    animation: "loadBar 1.5s infinite",
                    width: "40%",
                  }}
                />
              </div>
            </div>
          )}
          {status === "locked" && identityLockCause === "owner_reject" && (
            <TelegramOwnerRejectOverlay
              driverId={driverId}
              detail={identityError}
              timestamp={identityRejectLockedAt}
            />
          )}
          {status === "locked" && identityLockCause !== "owner_reject" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.88)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                zIndex: 35,
                padding: 20,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#ff4560",
                  letterSpacing: "0.15em",
                  fontWeight: 800,
                }}
              >
                {identityLockCause === "owner_timeout"
                  ? "ENGINE OFF - CHỦ XE KHÔNG PHẢN HỒI"
                  : "ENGINE OFF - UNAUTHORIZED DRIVER"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#ffd0d0",
                  maxWidth: 460,
                  lineHeight: 1.6,
                }}
              >
                {identityLockCause === "owner_timeout" ? (
                  <>
                    Hết thời gian chờ phản hồi trên Telegram.
                    <br />
                    Xe đang tắt máy / khóa điều khiển.
                  </>
                ) : (
                  <>
                    Xe hiện đang tắt máy vì bạn không phải chính chủ.
                    <br />
                    Hệ thống đã gửi yêu cầu xác nhận qua Telegram của chủ xe.
                  </>
                )}
              </div>
              {identityError && (
                <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 700 }}>
                  {identityError}
                </div>
              )}
            </div>
          )}
          {status === "idle" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div style={{ fontSize: 40, opacity: 0.08 }}>📷</div>
              <div
                style={{
                  fontSize: 11,
                  color: "#2a4a68",
                  letterSpacing: "0.18em",
                }}
              >
                CAMERA STANDBY
              </div>
              <button
                onClick={startWebcam}
                style={{
                  padding: "7px 24px",
                  background: "rgba(60,150,255,0.08)",
                  border: "1px solid rgba(60,150,255,0.3)",
                  color: "#3b9eff",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Activate Camera
              </button>
            </div>
          )}
          <DriverAuthenticatedWelcome
            profile={authWelcomeProfile}
            durationMs={5000}
            onDismiss={dismissAuthWelcome}
          />
        </div>

        {/* bottom bar */}
        <div
          style={{
            flexShrink: 0,
            height: 32,
            background: "#030810",
            borderTop: "1px solid #0d1e30",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 9,
              color: "#2a4a68",
              letterSpacing: "0.08em",
              alignItems: "center",
            }}
          >
            <span>
              ●{" "}
              {status === "active"
                ? "REC ACTIVE"
                : status === "auth"
                  ? "AUTH"
                  : status === "locked"
                    ? "ENGINE OFF"
                  : "STANDBY"}
            </span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>{frameCount} frames</span>
            {lastUpdated && <span>| Last: {lastUpdated}</span>}
            <span style={{ color: wsConnected ? "#00e578" : "#ff4560" }}>
              {wsConnected ? "● WS" : "○ WS"}
            </span>
            <span
              style={{
                color:
                  identityOwner === true
                    ? "#00e578"
                    : identityOwner === false
                      ? "#ff4560"
                      : "#ffc940",
              }}
            >
              ID:
              {identityHasRegistered
                ? identityOwner === true
                  ? "OWNER"
                  : identityOwner === false
                    ? "INTRUDER"
                    : "CHECK"
                : "NO_REG"}
            </span>
            {apiError && (
              <span style={{ color: "#ff4560" }}>
                ⚠ {apiError.slice(0, 28)}
              </span>
            )}
            {identityError && (
              <span style={{ color: "#ff4560" }}>
                ⚠ ID {identityError.slice(0, 24)}
              </span>
            )}
          </div>
          <div>
            {status === "active" || status === "auth" || status === "locked" ? (
              <button
                onClick={stopWebcam}
                style={{
                  padding: "2px 14px",
                  background: "rgba(255,69,96,0.07)",
                  border: "1px solid rgba(255,69,96,0.3)",
                  color: "#ff4560",
                  fontSize: 9,
                  cursor: "pointer",
                  borderRadius: 3,
                }}
              >
                ■ Stop
              </button>
            ) : (
              <button
                onClick={startWebcam}
                disabled={status === "loading"}
                style={{
                  padding: "2px 14px",
                  background: "rgba(60,200,100,0.07)",
                  border: "1px solid rgba(60,200,100,0.3)",
                  color: "#00e578",
                  fontSize: 9,
                  cursor: "pointer",
                  borderRadius: 3,
                  opacity: status === "loading" ? 0.5 : 1,
                }}
              >
                ▶ Start
              </button>
            )}
          </div>
        </div>
      </div>

      <FakeYouTubeLayout
        open={youtubeMockOpen}
        onClose={() => setYoutubeMockOpen(false)}
      />
    </div>
  );
}
