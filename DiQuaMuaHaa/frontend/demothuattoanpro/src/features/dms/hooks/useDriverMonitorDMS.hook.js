import { useEffect, useRef, useState, useCallback } from "react";
import useDmsSocketStreams from "./useDmsSocketStreams.hook";
import useMediaPipeEngines from "./useMediaPipeEngines.hook";
import useDrivingSession from "./useDrivingSession.hook";
import useDmsAlerts from "./useDmsAlerts.hook";
import useIdentityGate from "./useIdentityGate.hook";
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
  HAND_LABEL_OPENS_MENU,
  HAND_LABEL_CLOSES_MENU,
} from "../constants/monitor.constants";
import {
  L_EYE,
  R_EYE,
  computeEAR,
  computePupilRadius,
  estimateHeadPose,
} from "../utils/visionMath.utils";
import { startAlarm, stopAlarm } from "../services/alarm.service";
import { captureFrame, captureBurstFrames } from "../services/frameCapture.service";
import { getSmoothedLabel } from "../utils/labelSmoothing.utils";
import { getWebcamSupportErrorMessage } from "../../../shared/utils/cameraContext";
import {
  handLabelToQuickAppKey,
  executeQuickAppAction,
} from "../components/HandQuickAppsMenu";

function useDriverMonitorDMS() {
  // ═════════════════════════════════════════════════════════
  // REFS (video, stream, engines)
  // ═════════════════════════════════════════════════════════
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

  // Phone/Smoking refs
  const phoneDetectionRef = useRef({ active: false, prob: 0, bbox: null });
  const phoneActiveFilteredRef = useRef(false);
  const phoneOnStreakRef = useRef(0);
  const phoneOffStreakRef = useRef(0);
  const phoneLastBoxRef = useRef(null);
  const smokingDetectionRef = useRef({ active: false, prob: 0, bbox: null });
  const smokingActiveRef = useRef(false);
  const smokingSinceRef = useRef(null);
  const smokingSecRef = useRef(0);
  const phoneSinceRef = useRef(null);
  const phoneSecRef = useRef(0);

  // WebSocket refs
  const socketRef = useRef(null);
  const wsReadyRef = useRef(false);
  const wsPendingRef = useRef(false);
  const wsLastSentRef = useRef(0);
  const wsSmokePendingRef = useRef(false);
  const wsSmokLastSentRef = useRef(0);

  // Hand gesture refs
  const prevHandOpenRef = useRef("");
  const prevHandCloseRef = useRef("");
  const prevHandQuickRef = useRef("");

  // ═════════════════════════════════════════════════════════
  // STATE
  // ═════════════════════════════════════════════════════════
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
  const [smokingActive, setSmokingActive] = useState(false);
  const [smokingAlert, setSmokingAlert] = useState(null);
  const [driverId, setDriverId] = useState(DEFAULT_DRIVER_ID);
  const [identityOwner, setIdentityOwner] = useState(null);
  const [identityHasRegistered, setIdentityHasRegistered] = useState(false);
  const [identitySimilarity, setIdentitySimilarity] = useState(null);
  const [identityThreshold, setIdentityThreshold] = useState(0.975);
  const [identityError, setIdentityError] = useState("");
  const [identitySamples, setIdentitySamples] = useState(0);
  const [identityLockCause, setIdentityLockCause] = useState(null);
  const [identityRejectLockedAt, setIdentityRejectLockedAt] = useState("");
  const [authWelcomeProfile, setAuthWelcomeProfile] = useState(null);
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

  // ═════════════════════════════════════════════════════════
  // SUB-HOOKS
  // ═════════════════════════════════════════════════════════
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

  // ═════════════════════════════════════════════════════════
  // WEBCAM CONTROL
  // ═════════════════════════════════════════════════════════
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

  // ═════════════════════════════════════════════════════════
  // REST API: landmark + smoking (1s interval)
  // ═════════════════════════════════════════════════════════
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

        const res = await fetch(`${API_BASE}/api/landmark/predict_from_frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "API failed");
        setApiResult(data);
        setLastUpdated(new Date().toLocaleTimeString());

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

  // ═════════════════════════════════════════════════════════
  // Hand API (train_hands labels: open, map, music, phonecall, no_sign)
  // ═════════════════════════════════════════════════════════
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

  // ═════════════════════════════════════════════════════════
  // Quick Apps: open -> menu; no_sign -> close; map/music/phonecall when menu open
  // ═════════════════════════════════════════════════════════
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

  // ═════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ═════════════════════════════════════════════════════════
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
  const blinkHL = displayEye.blinkDur > 0.15;

  // ═════════════════════════════════════════════════════════
  // RETURN
  // ═════════════════════════════════════════════════════════
  return {
    // Refs (for components that need direct access)
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
    alarmIntervalRef,
    vibrateIntervalRef,
    phoneDetectionRef,
    phoneActiveFilteredRef,
    phoneOnStreakRef,
    phoneOffStreakRef,
    phoneLastBoxRef,
    smokingDetectionRef,
    smokingActiveRef,
    smokingSinceRef,
    smokingSecRef,
    phoneSinceRef,
    phoneSecRef,
    socketRef,

    // Core state
    status,
    setStatus,
    errorMsg,
    apiResult,
    apiError,
    apiLoading,
    smokingResult,
    smokingError,
    smokingHistory,
    phoneError,
    phoneHistory,
    handApiResult,
    appMenuOpen,
    setAppMenuOpen,
    lastUpdated,
    history,
    time,
    frameCount,
    wsConnected,
    displayPose,
    displayEye,
    drowsyAlert,
    setDrowsyAlert,
    phoneActive,
    phoneAlert,
    setPhoneAlert,
    smokingActive,
    smokingAlert,
    setSmokingAlert,
    driverId,
    identityOwner,
    identityHasRegistered,
    identitySimilarity,
    identityThreshold,
    identityError,
    identitySamples,
    identityLockCause,
    identityRejectLockedAt,
    authWelcomeProfile,
    cabinLightsOn,
    setCabinLightsOn,
    cabinAcOn,
    setCabinAcOn,
    youtubeMockOpen,
    setYoutubeMockOpen,
    drivingSessionId,
    drivingSessionStartedAt,
    sessionAlertCounts,
    sessionLogOpen,
    setSessionLogOpen,
    sessionLogLoading,
    sessionLogItems,

    // Derived values
    smoothedLabel,
    currentLabel,
    info,
    isAlert,
    yDeg,
    pDeg,
    rDeg,
    phoneIconActive,
    smokingIconActive,
    activeIcons,
    blinkHL,

    // Handlers
    startWebcam,
    stopWebcam,
    dismissAuthWelcome,
    handleIdentityUnlock,
    handleIdentityLock,
    handleUpdateIdentity,

    // Constants needed by components
    SMOKING_ENABLED,
    LABEL_MAP,
    STATUS_ICONS,
    ID_AUTH_LOCK_INTRUDER_FRAMES,
    ID_AUTH_UNLOCK_FRAMES,
    ID_AUTH_RETRY_INTERVAL_MS,
    DRIVER_ID_KEY,
    API_BASE,
    EYES_CLOSED_WARN_MS,
    PHONE_WARN_MS,
    SMOKING_WARN_MS,
  };
}

export default useDriverMonitorDMS;
