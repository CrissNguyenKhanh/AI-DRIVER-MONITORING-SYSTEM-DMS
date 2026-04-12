/**
 * DriverMonitorDMS — main entry point (refactored).
 *
 * Architecture:
 *   Hooks   : useCamera · useDriverAI · useDriverAlerts · useDmsSocket
 *   Overlays: PhoneFOMOOverlay · SmokingFOMOOverlay · FaceMeshOverlay
 *   HUD     : DmsHudPanel · StatusBar · CameraStateOverlay
 *   Alerts  : DrowsyAlertOverlay · SmokingAlertOverlay · PhoneAlertOverlay
 *   Panels  : Head3D · EyeCanvas · WaveformCanvas
 */
import React, { useRef, useState, useEffect, useCallback } from "react";

// — hooks
import { useCamera }       from "./hooks/useCamera";
import { useDriverAI }     from "./hooks/useDriverAI";
import { useDriverAlerts } from "./hooks/useDriverAlerts";
import { useDmsSocket }    from "./hooks/useDmsSocket";

// — overlays
import { PhoneFOMOOverlay, SmokingFOMOOverlay, FaceMeshOverlay,
         EyeCanvas, WaveformCanvas, Head3D } from "./components/overlays";

// — alerts
import { DrowsyAlertOverlay, SmokingAlertOverlay, PhoneAlertOverlay }
  from "./components/alerts";

// — hud
import { DmsHudPanel, StatusBar, CameraStateOverlay } from "./components/hud";

// — context
import DmsContext from "./context/DmsContext";

// — constants
import {
  API_BASE, LABEL_MAP, STATUS_ICONS, SMOKING_ENABLED,
  DEFAULT_DRIVER_ID, DRIVER_ID_KEY,
  CONSISTENT_FRAMES, MIN_PROB_FOR_LABEL,
  ID_AUTH_UNLOCK_FRAMES, ID_AUTH_LOCK_INTRUDER_FRAMES, ID_AUTH_RETRY_INTERVAL_MS,
} from "./constants/dmsConfig";

// — utils
import { speakOwnerGreeting, warmSpeechVoices } from "../utils/speakOwnerGreeting";
import {
  startDrivingSession, endDrivingSession,
  recordDrivingAlert,
} from "../utils/drivingSessionApi";
import OwnerVerifyGate from "../systeamdetectface/OwnerVerifyGate";
import DriverAuthenticatedWelcome from "../systeamdetectface/DriverAuthenticatedWelcome";
import VoiceCarAssistant from "../voice/VoiceCarAssistant";
import FakeYouTubeLayout from "../voice/FakeYouTubeLayout";

export default function DriverMonitorDMS() {
  // ── Core video refs ────────────────────────────────────────────
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const faceMeshRef = useRef(null);
  const poseRef     = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const landmarksRef = useRef([]);
  const eyeDataRef  = useRef({
    left:  { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
    right: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
  });
  const earHistoryRef  = useRef({ left: [], right: [] });
  const blinkStateRef  = useRef({ left: false, right: false });
  const blinkTimesRef  = useRef([]);
  const blinkDurRef    = useRef({ start: null, dur: 0 });
  const eyesClosedSinceRef = useRef(null);
  const eyesClosedSecRef   = useRef(0);
  const audioCtxRef        = useRef(null);
  const alarmIntervalRef   = useRef(null);
  const vibrateIntervalRef = useRef(null);

  // ── Phone / smoking detection refs ────────────────────────────
  const phoneDetectionRef       = useRef({ active: false, prob: 0, bbox: null });
  const phoneActiveFilteredRef  = useRef(false);
  const phoneOnStreakRef         = useRef(0);
  const phoneOffStreakRef        = useRef(0);
  const phoneLastBoxRef         = useRef(null);
  const smokingDetectionRef     = useRef({ active: false, prob: 0, bbox: null });
  const smokingActiveRef        = useRef(false);
  const smokingSinceRef         = useRef(null);
  const smokingSecRef           = useRef(0);
  const phoneSinceRef           = useRef(null);
  const phoneSecRef             = useRef(0);

  // ── WebSocket refs ─────────────────────────────────────────────
  const socketRef        = useRef(null);
  const wsReadyRef       = useRef(false);
  const wsPendingRef     = useRef(false);
  const wsLastSentRef    = useRef(0);
  const wsSmokePendingRef  = useRef(false);
  const wsSmokLastSentRef  = useRef(0);

  // ── Session tracking refs ──────────────────────────────────────
  const drivingSessionIdRef    = useRef(null);
  const prevPhoneAlertRef      = useRef(null);
  const prevSmokingAlertRef    = useRef(null);
  const prevDrowsyAlertRef     = useRef(null);
  const apiLabelRef            = useRef("unknown");
  const apiLabelStreakRef       = useRef(0);

  // ── UI State ───────────────────────────────────────────────────
  const [status,        setStatus]        = useState("idle");
  const [errorMsg,      setErrorMsg]      = useState("");
  const [apiResult,     setApiResult]     = useState(null);
  const [apiError,      setApiError]      = useState("");
  const [apiLoading,    setApiLoading]    = useState(false);
  const [smokingResult, setSmokingResult] = useState(null);
  const [smokingError,  setSmokingError]  = useState("");
  const [smokingHistory,setSmokingHistory]= useState([]);
  const [phoneError,    setPhoneError]    = useState("");
  const [phoneHistory,  setPhoneHistory]  = useState([]);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [history,       setHistory]       = useState([]);
  const [time,          setTime]          = useState(new Date());
  const [frameCount,    setFrameCount]    = useState(0);
  const [wsConnected,   setWsConnected]   = useState(false);
  const [displayPose,   setDisplayPose]   = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [displayEye,    setDisplayEye]    = useState({
    blinkRate: 0, blinkDur: 0, pupilL: "33.5",
    lYaw: "-11.8", lPitch: "-21.6", rYaw: "-19.9", rPitch: "-25.1",
    lX: "61.4", lY: "3.9", lZ: "-2.7", rX: "63.2", rY: "9.7", rZ: "-3.3",
  });
  const [drowsyAlert,   setDrowsyAlert]   = useState(null);
  const [phoneActive,   setPhoneActive]   = useState(false);
  const [phoneAlert,    setPhoneAlert]    = useState(null);
  const [smokingActive, setSmokingActive] = useState(false);
  const [smokingAlert,  setSmokingAlert]  = useState(null);
  const [driverId,      setDriverId]      = useState(DEFAULT_DRIVER_ID);
  const [identityOwner,          setIdentityOwner]          = useState(null);
  const [identityHasRegistered,  setIdentityHasRegistered]  = useState(false);
  const [identitySimilarity,     setIdentitySimilarity]     = useState(null);
  const [identityThreshold,      setIdentityThreshold]      = useState(0.975);
  const [identityError,          setIdentityError]          = useState("");
  const [identitySamples,        setIdentitySamples]        = useState(0);
  const [identityLockCause,      setIdentityLockCause]      = useState(null);
  const [identityRejectLockedAt, setIdentityRejectLockedAt] = useState("");
  const [authWelcomeProfile,     setAuthWelcomeProfile]     = useState(null);
  const [cabinLightsOn,  setCabinLightsOn]  = useState(false);
  const [cabinAcOn,      setCabinAcOn]      = useState(false);
  const [youtubeMockOpen,setYoutubeMockOpen]= useState(false);
  const [drivingSessionId,       setDrivingSessionId]       = useState(null);
  const [drivingSessionStartedAt,setDrivingSessionStartedAt]= useState(null);
  const [sessionAlertCounts,     setSessionAlertCounts]     = useState({ phone:0, smoking:0, drowsy:0 });

  const dismissAuthWelcome = useCallback(() => setAuthWelcomeProfile(null), []);

  // ── Custom Hooks ───────────────────────────────────────────────
  const alertRefs = {
    eyesClosedSecRef, smokingDetectionRef, phoneDetectionRef,
    phoneSinceRef, phoneSecRef, smokingSinceRef, smokingSecRef,
    apiLabelRef, apiLabelStreakRef, alarmIntervalRef, vibrateIntervalRef,
    audioCtxRef, poseRef, eyeDataRef, blinkTimesRef, blinkDurRef,
  };

  const { startAlarm, stopAlarm } = useDriverAlerts(alertRefs, {
    setDisplayPose, setDisplayEye, setFrameCount: () => {},
    setSmokingAlert, setPhoneAlert, setDrowsyAlert,
  });

  const cameraRefs = {
    videoRef, streamRef, landmarksRef, poseRef,
    phoneDetectionRef, phoneActiveFilteredRef, phoneOnStreakRef,
    phoneOffStreakRef, phoneLastBoxRef, smokingDetectionRef,
    wsPendingRef, wsSmokePendingRef, phoneSinceRef, phoneSecRef,
    smokingActiveRef, smokingSinceRef, smokingSecRef,
    eyesClosedSinceRef, eyesClosedSecRef,
  };

  const { startWebcam, stopWebcam } = useCamera(cameraRefs, {
    setStatus, setErrorMsg, setPhoneActive, setPhoneAlert,
    setSmokingActive, setSmokingAlert, setIdentityOwner,
    setIdentitySimilarity, setIdentityError, setIdentitySamples,
    setIdentityLockCause, setIdentityRejectLockedAt, setDrowsyAlert,
  }, stopAlarm);

  useDriverAI({
    faceMeshRef, landmarksRef, poseRef, eyeDataRef, earHistoryRef,
    blinkStateRef, blinkTimesRef, blinkDurRef,
    eyesClosedSinceRef, eyesClosedSecRef, videoRef,
  }, status);

  useDmsSocket({
    socketRef, wsReadyRef, wsPendingRef, wsLastSentRef,
    wsSmokePendingRef, wsSmokLastSentRef,
    phoneDetectionRef, phoneActiveFilteredRef,
    phoneOnStreakRef, phoneOffStreakRef, phoneLastBoxRef,
    smokingDetectionRef, smokingActiveRef, videoRef,
  }, {
    setWsConnected, setPhoneError,
    setPhoneActive, setPhoneHistory,
    setSmokingActive, setSmokingHistory,
  }, status, driverId);

  // ── Session management ─────────────────────────────────────────
  useEffect(() => {
    if (status !== "active") {
      const sid = drivingSessionIdRef.current;
      drivingSessionIdRef.current = null;
      setDrivingSessionId(null); setDrivingSessionStartedAt(null);
      prevPhoneAlertRef.current = null; prevSmokingAlertRef.current = null;
      prevDrowsyAlertRef.current = null;
      setSessionAlertCounts({ phone: 0, smoking: 0, drowsy: 0 });
      if (sid) endDrivingSession(API_BASE, sid).catch(() => {});
      return;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await startDrivingSession(API_BASE, { driverId });
      if (cancelled) { if (ok && data?.session_id) await endDrivingSession(API_BASE, data.session_id).catch(() => {}); return; }
      if (ok && data?.session_id) {
        drivingSessionIdRef.current = data.session_id;
        setDrivingSessionId(data.session_id);
        setDrivingSessionStartedAt(data.started_at || "");
      }
    })();
    return () => { cancelled = true; };
  }, [status, driverId]);

  useEffect(() => {
    if (!drivingSessionId || status !== "active") return;
    prevPhoneAlertRef.current = phoneAlert;
    prevSmokingAlertRef.current = smokingAlert;
    prevDrowsyAlertRef.current = drowsyAlert;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivingSessionId, status]);

  useEffect(() => {
    const sid = drivingSessionIdRef.current;
    if (!sid || status !== "active") return;
    if (phoneAlert !== null && prevPhoneAlertRef.current === null)
      recordDrivingAlert(API_BASE, sid, "phone").then(r => r.ok && setSessionAlertCounts(c => ({ ...c, phone: c.phone+1 })));
    prevPhoneAlertRef.current = phoneAlert;
    if (smokingAlert !== null && prevSmokingAlertRef.current === null)
      recordDrivingAlert(API_BASE, sid, "smoking").then(r => r.ok && setSessionAlertCounts(c => ({ ...c, smoking: c.smoking+1 })));
    prevSmokingAlertRef.current = smokingAlert;
    if (drowsyAlert !== null && prevDrowsyAlertRef.current === null)
      recordDrivingAlert(API_BASE, sid, "drowsy").then(r => r.ok && setSessionAlertCounts(c => ({ ...c, drowsy: c.drowsy+1 })));
    prevDrowsyAlertRef.current = drowsyAlert;
  }, [phoneAlert, smokingAlert, drowsyAlert, status]);

  // ── Identity callbacks ────────────────────────────────────────
  const handleIdentityUnlock = useCallback(async (detail) => {
    setIdentityError(""); setIdentityLockCause(null); setIdentityRejectLockedAt("");
    setStatus(prev => prev === "active" ? prev : "active");
    const id = (detail && (detail.driver_id || detail.driverId)) || driverId;
    let merged = {
      driver_id: id,
      registered_name: (detail && (detail.registered_name || detail.name)) || "",
      profile_image_base64: detail?.profile_image_base64,
      registered_at: detail?.registered_at,
      similarity: typeof detail?.similarity === "number" ? detail.similarity : null,
      threshold: typeof detail?.threshold === "number" ? detail.threshold : null,
      samples_used: detail?.samples_used,
      source: (detail?.source) || "face",
    };
    if (!merged.profile_image_base64 && id) {
      try {
        const r = await fetch(`${API_BASE}/api/identity/driver_profile?driver_id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (r.ok && d.driver_id) {
          merged = { ...merged, registered_name: merged.registered_name || d.registered_name || id,
            profile_image_base64: merged.profile_image_base64 || d.profile_image_base64,
            registered_at: merged.registered_at || d.registered_at };
        }
      } catch (_) {}
    }
    if (!merged.registered_name) merged.registered_name = id;
    setAuthWelcomeProfile(merged);
    speakOwnerGreeting(merged.registered_name);
  }, [driverId]);

  const handleIdentityLock = useCallback((reason) => {
    stopAlarm(); setDrowsyAlert(null); setPhoneAlert(null); setSmokingAlert(null);
    const msg = String(reason || "ENGINE OFF: NOT OWNER");
    setIdentityError(msg);
    if (/reject/i.test(msg)) { setIdentityLockCause("owner_reject"); setIdentityRejectLockedAt(new Date().toLocaleString("vi-VN")); }
    else {
      setIdentityRejectLockedAt("");
      if (msg.includes("NO RESPONSE") || /expired/i.test(msg)) setIdentityLockCause("owner_timeout");
      else setIdentityLockCause("generic");
    }
    setStatus("locked");
  }, [stopAlarm]);

  const handleUpdateIdentity = useCallback((payload) => {
    const hasRegistered = Boolean(payload?.hasRegistered);
    setIdentityHasRegistered(hasRegistered);
    setIdentityOwner(hasRegistered ? Boolean(payload?.isOwner) : null);
    setIdentitySimilarity(typeof payload?.similarity === "number" ? payload.similarity : null);
    if (typeof payload?.threshold === "number") setIdentityThreshold(payload.threshold);
    setIdentitySamples(typeof payload?.samplesUsed === "number" ? payload.samplesUsed : 0);
    setIdentityError(payload?.error || "");
  }, []);

  // ── Misc effects ──────────────────────────────────────────────
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { warmSpeechVoices(); }, []);
  useEffect(() => {
    try { const savedId = window.localStorage.getItem(DRIVER_ID_KEY); if (savedId) setDriverId(savedId); } catch (_) {}
  }, []);

  // ── Derived display values ────────────────────────────────────
  const rel = history.filter(h => (h.prob || 0) >= MIN_PROB_FOR_LABEL && h.label && h.label !== "no_face");
  let smoothedLabel = "unknown";
  if (rel.length >= CONSISTENT_FRAMES) {
    const cnt = {};
    rel.forEach(h => { cnt[h.label] = (cnt[h.label] || 0) + 1; });
    const maj = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    const rec = rel.slice(-CONSISTENT_FRAMES);
    if (rec.length === CONSISTENT_FRAMES && rec.every(h => h.label === maj)) smoothedLabel = maj;
  }
  const currentLabel   = smoothedLabel;
  const info           = LABEL_MAP[currentLabel] || LABEL_MAP.unknown;
  const isAlert        = info.level === "risk" || info.level === "warning";
  const yDeg           = ((displayPose.yaw   * 180) / Math.PI).toFixed(1);
  const pDeg           = ((displayPose.pitch * 180) / Math.PI).toFixed(1);
  const rDeg           = ((displayPose.roll  * 180) / Math.PI).toFixed(1);
  const phoneIconActive   = status === "active" && phoneActive;
  const smokingIconActive = status === "active" && SMOKING_ENABLED && smokingActive;
  const blinkHL           = displayEye.blinkDur > 0.15;

  const activeIcons = STATUS_ICONS.map(ic => ({
    ...ic,
    active:
      ic.id === "camera"    ? status === "active"  :
      ic.id === "attentive" ? currentLabel === "safe" :
      ic.id === "awake"     ? status === "active" && currentLabel !== "drowsy" && currentLabel !== "yawning" && !drowsyAlert :
      ic.id === "seatbelt"  ? true :
      ic.id === "cabin"     ? (cabinLightsOn || cabinAcOn) :
      ic.id === "phone"     ? phoneIconActive :
      ic.id === "smoking"   ? smokingIconActive : false,
  }));

  // ── DmsContext value — chia sẻ state xuống HUD components ───────
  const dmsContextValue = {
    status, driverId, faceMeshRef,
    wsConnected, apiResult, apiLoading, apiError,
    identityOwner, identityHasRegistered, identitySimilarity,
    identitySamples, identityError,
    phoneIconActive, phoneDetectionRef, phoneError,
    smokingIconActive, smokingResult, smokingSecRef, smokingError,
    drivingSessionId, drivingSessionStartedAt, sessionAlertCounts,
    frameCount, lastUpdated,
  };

  // ── Render ────────────────────────────────────────────────────
  return (
  <DmsContext.Provider value={dmsContextValue}>
    <div style={{ width: "100vw", height: "100vh", background: "#000",
      fontFamily: "'Segoe UI',Arial,sans-serif", color: "#ccd8e8",
      display: "flex", overflow: "hidden", fontSize: 12 }}>

      {/* ══ LEFT panel ══ */}
      <div style={{ width: "35%", minWidth: 340, background: "#000",
        display: "flex", flexDirection: "column", overflow: "hidden",
        borderRight: "1px solid #0d1e30" }}>
        <div style={{ flex: "0 0 260px", background: "#000", position: "relative", overflow: "hidden" }}>
          <Head3D poseRef={poseRef} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column",
          background: "#000", overflow: "hidden", padding: "4px 8px", gap: 4 }}>

          {/* Yaw/Pitch/Roll */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div style={{ width:18, height:18, borderRadius:3, background:"#1e5fc0",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:10, fontWeight:700, color:"#fff", flexShrink:0 }}>i</div>
            {["Yaw","Pitch","Roll"].map((label, i) => (
              <React.Fragment key={label}>
                <div style={{ background:"#0a1828", border:"1px solid #1a3a58", borderRadius:3,
                  padding:"3px 6px", fontSize:11, fontFamily:"monospace", color:"#5a8ab0",
                  flex:1, textAlign:"center" }}>{label}</div>
                <div style={{ background:"#0a1828", border:"1px solid #1a3a58", borderRadius:3,
                  padding:"3px 6px", fontSize:11, fontFamily:"monospace", color:"#7ab8d8",
                  flex:1, textAlign:"center" }}>{[yDeg,pDeg,rDeg][i]}°</div>
              </React.Fragment>
            ))}
          </div>

          {/* Eye stats row */}
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            {[{label:"Pupil dilation",val:`${displayEye.pupilL}%`},{label:"Blink rate",val:`${displayEye.blinkRate}`}]
              .map(({label,val}) => (
                <div key={label} style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
                  <span style={{ fontSize:9, color:"#5a8ab0", textAlign:"center" }}>{label}</span>
                  <div style={{ background:"#0a1828", border:"1px solid #1a3a58", borderRadius:3,
                    padding:"3px 6px", fontSize:11, fontFamily:"monospace", color:"#7ab8d8", textAlign:"center" }}>{val}</div>
                </div>
              ))}
            <div style={{ flex:1.3, display:"flex", flexDirection:"column", gap:2 }}>
              <span style={{ fontSize:9, color:"#5a8ab0", textAlign:"center" }}>Blink duration</span>
              <div style={{ background: blinkHL?"#1e5fc0":"#0a1828",
                border: blinkHL?"1px solid #3b9eff":"1px solid #1a3a58", borderRadius:3,
                padding:"3px 6px", fontSize:11, fontFamily:"monospace",
                color: blinkHL?"#fff":"#7ab8d8", textAlign:"center" }}>
                {typeof displayEye.blinkDur==="number" ? displayEye.blinkDur.toFixed(2) : "0.00"} sec
              </div>
            </div>
          </div>

          {/* Eye canvas panels */}
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            {["Left_Eye","Right_Eye"].map(e => (
              <div key={e} style={{ flex:1, textAlign:"center", fontSize:11,
                color:"#7ab8d8", borderBottom:"1px solid #1a3a58", paddingBottom:3 }}>
                <span style={{ textDecoration:"underline", cursor:"pointer" }}>{e}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0, height:90 }}>
            {["left","right"].map(side => (
              <div key={side} style={{ flex:1, background:"#000",
                border:"1px solid #0d2a44", borderRadius:3, overflow:"hidden" }}>
                <EyeCanvas eyeDataRef={eyeDataRef} side={side} />
              </div>
            ))}
          </div>

          {/* EAR waveforms */}
          <div style={{ display:"flex", gap:8, flexShrink:0, height:50 }}>
            {[["left","#1e90ff"],["right","#00e5cc"]].map(([side,color]) => (
              <div key={side} style={{ flex:1, background:"#000",
                border:"1px solid #0d2a44", borderRadius:3, overflow:"hidden" }}>
                <WaveformCanvas earHistoryRef={earHistoryRef} side={side} color={color} />
              </div>
            ))}
          </div>

          {/* Status icon ring */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center",
            paddingTop:4, flexShrink:0 }}>
            {activeIcons.map(ic => (
              <div key={ic.id} title={ic.label}
                style={{ width:56, height:56, borderRadius:"50%", display:"flex",
                  alignItems:"center", justifyContent:"center", fontSize:22, cursor:"pointer",
                  background: ic.active ? "rgba(0,229,120,0.08)" : "rgba(20,35,55,0.6)",
                  border: ic.active ? "2px solid rgba(0,229,120,0.55)" : "1px solid #1a3050",
                  opacity: ic.active ? 1 : 0.45,
                  boxShadow: ic.active ? "0 0 10px rgba(0,229,120,0.25)" : "none",
                  transition: "all 0.3s ease",
                }}>
                {ic.icon}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ RIGHT (main video) ══ */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#000", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ flexShrink:0, height:40, background:"#020c18",
          borderBottom:"1px solid #0d1e30", display:"flex", alignItems:"center",
          justifyContent:"space-between", padding:"0 14px" }}>
          <span style={{ fontSize:11, color:"#3b6a9c", letterSpacing:"0.12em" }}>
            AI DRIVER MONITORING SYSTEM
          </span>
          <span style={{ fontSize:11, color:"rgba(100,150,200,0.5)" }}>
            {time.toLocaleTimeString("en-US",{hour12:false})}
          </span>
        </div>

        {/* Video area */}
        <div style={{ flex:1, position:"relative", background:"#000", overflow:"hidden" }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width:"100%", height:"100%", objectFit:"cover",
              transform:"scaleX(-1)", display: status==="active"||status==="auth" ? "block" : "none" }} />

          {/* Voice assistant — luôn mount khi active */}
          <VoiceCarAssistant
            enabled={status === "active"}
            requireWake
            onLightChange={setCabinLightsOn}
            onAcChange={setCabinAcOn}
            onYoutubeOpen={() => setYoutubeMockOpen(true)}
            onYoutubeClose={() => setYoutubeMockOpen(false)}
          />

          {/* Identity auth gate — chạy khi auth / active / locked */}
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

          {/* Canvas overlays */}
          {status === "active" && (
            <>
              <FaceMeshOverlay landmarksRef={landmarksRef} eyeDataRef={eyeDataRef} videoRef={videoRef} />
              <PhoneFOMOOverlay phoneDetectionRef={phoneDetectionRef} videoRef={videoRef} />
              {SMOKING_ENABLED && (
                <SmokingFOMOOverlay smokingDetectionRef={smokingDetectionRef} landmarksRef={landmarksRef} videoRef={videoRef} />
              )}
            </>
          )}

          {/* Camera state overlays (loading / error / auth / locked / idle) */}
          {status !== "active" && (
            <CameraStateOverlay status={status} errorMsg={errorMsg} driverId={driverId}
              identityError={identityError} identitySimilarity={identitySimilarity}
              identityLockCause={identityLockCause} identityRejectLockedAt={identityRejectLockedAt}
              startWebcam={startWebcam} />
          )}

          {/* HUD info overlay */}
          {status === "active" && (
            <DmsHudPanel />
          )}

          {/* Owner badge */}
          {status === "active" && identityHasRegistered && (
            <div style={{ position:"absolute", top:88, right:18, zIndex:9, pointerEvents:"none",
              padding:"8px 14px", borderRadius:8,
              border:`1px solid ${identityOwner===true?"rgba(0,229,120,0.6)":identityOwner===false?"rgba(255,69,96,0.7)":"rgba(255,201,64,0.7)"}`,
              background: identityOwner===true?"rgba(0,40,20,0.65)":identityOwner===false?"rgba(60,0,10,0.68)":"rgba(45,35,0,0.62)",
              color: identityOwner===true?"#00e578":identityOwner===false?"#ff4560":"#ffc940",
              fontWeight:700, letterSpacing:"0.08em", fontSize:12 }}>
              {identityOwner===true?"✓ OWNER VERIFIED":identityOwner===false?"✕ INTRUDER DETECTED":"… VERIFYING OWNER"}
            </div>
          )}

          {/* Alert label bottom-left */}
          {status === "active" && (
            <div style={{ position:"absolute", bottom:10, left:14, display:"flex",
              alignItems:"center", gap:8, pointerEvents:"none", zIndex:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:info.color,
                animation:"glow 1.5s ease-in-out infinite" }} />
              <span style={{ fontSize:13, fontWeight:700, color:info.color, letterSpacing:"0.1em" }}>
                {info.vi}
              </span>
              {apiResult?.prob != null && (
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>
                  {(apiResult.prob*100).toFixed(1)}%
                </span>
              )}
              {apiLoading && <span style={{ fontSize:10, color:"#ffc940" }}>⟳</span>}
              {apiError  && <span style={{ fontSize:10, color:"#ff4560" }}>⚠ API</span>}
            </div>
          )}

          {/* Alert border pulse */}
          {isAlert && status === "active" && (
            <div style={{ position:"absolute", inset:0, pointerEvents:"none",
              border:"3px solid "+info.color, animation:"borderPulse 1.2s ease-in-out infinite", zIndex:6 }} />
          )}

          {/* Full-screen alert overlays */}
          {drowsyAlert !== null && status === "active" && (
            <DrowsyAlertOverlay drowsyAlert={drowsyAlert} onDismiss={() => {
              stopAlarm(); setDrowsyAlert(null);
              eyesClosedSinceRef.current = null; eyesClosedSecRef.current = 0;
            }} />
          )}
          {SMOKING_ENABLED && smokingAlert !== null && status === "active" && drowsyAlert === null && (
            <SmokingAlertOverlay smokingAlert={smokingAlert} onDismiss={() => {
              stopAlarm(); setSmokingAlert(null);
              smokingSinceRef.current = null; smokingSecRef.current = 0;
            }} />
          )}
          {phoneAlert !== null && status === "active" && drowsyAlert === null && (
            <PhoneAlertOverlay phoneAlert={phoneAlert} onDismiss={() => {
              stopAlarm(); setPhoneAlert(null);
              phoneSinceRef.current = null; phoneSecRef.current = 0;
            }} />
          )}

          {/* Auth welcome popup */}
          <DriverAuthenticatedWelcome
            profile={authWelcomeProfile} durationMs={5000}
            onDismiss={dismissAuthWelcome}
          />
        </div>

        <StatusBar startWebcam={startWebcam} stopWebcam={stopWebcam} />
      </div>

      <FakeYouTubeLayout open={youtubeMockOpen} onClose={() => setYoutubeMockOpen(false)} />

      <style>{`
        @keyframes borderPulse{0%,100%{opacity:0.9}50%{opacity:0.15}}
        @keyframes alarmBorder{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,30,30,0)}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,30,30,0.4)}}
        @keyframes phoneAlarmBorder{0%,100%{opacity:1}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,140,0,0.45)}}
        @keyframes phoneBg{0%{background:rgba(0,0,0,0.72)}100%{background:rgba(60,25,0,0.82)}}
        @keyframes smokingBorder{0%,100%{opacity:1}50%{opacity:0.3;box-shadow:inset 0 0 40px rgba(255,60,0,0.45)}}
        @keyframes smokingBg{0%{background:rgba(0,0,0,0.72)}100%{background:rgba(50,10,0,0.85)}}
        @keyframes glow{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes loadBar{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
        @keyframes drowsyBg{0%{background:rgba(0,0,0,0.75)}100%{background:rgba(90,0,0,0.85)}}
        @keyframes iconBounce{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.1)}}
        @keyframes textFlash{0%,100%{opacity:1;letter-spacing:0.1em}50%{opacity:0.75;letter-spacing:0.15em}}
        @keyframes badgePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:0.8}}
        @keyframes cornerFlash{0%,100%{opacity:0.35}50%{opacity:0.8}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#000}
        ::-webkit-scrollbar-thumb{background:#1a3a50;border-radius:2px}
      `}</style>
    </div>
  </DmsContext.Provider>
  );
}
