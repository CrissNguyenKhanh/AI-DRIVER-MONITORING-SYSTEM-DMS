import React from "react";
import OwnerVerifyGate from "../OwnerVerifyGate";
import TelegramOwnerRejectOverlay from "../TelegramOwnerRejectOverlay";
import DriverAuthenticatedWelcome from "../DriverAuthenticatedWelcome";
import VoiceCarAssistant from "../../../../voice/VoiceCarAssistant";
import HandQuickAppsMenu from "../HandQuickAppsMenu";
import PhoneFOMOOverlay from "../overlays/PhoneFOMOOverlay";
import SmokingFOMOOverlay from "../overlays/SmokingFOMOOverlay";
import FaceMeshOverlay from "../overlays/FaceMeshOverlay";
import HandLandmarkOverlay from "../overlays/HandLandmarkOverlay";

function DmsCameraStage({
  // Refs
  videoRef,
  faceMeshRef,
  landmarksRef,
  eyeDataRef,
  handLandmarksRef,
  phoneDetectionRef,
  smokingDetectionRef,
  smokingSinceRef,
  smokingSecRef,
  phoneSinceRef,
  phoneSecRef,
  alarmIntervalRef,
  vibrateIntervalRef,
  eyesClosedSinceRef,
  eyesClosedSecRef,
  
  // Core state
  status,
  setStatus,
  errorMsg,
  apiResult,
  apiError,
  apiLoading,
  handApiResult,
  appMenuOpen,
  setAppMenuOpen,
  time,
  frameCount,
  wsConnected,
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
  phoneError,
  // Derived values
  isAlert,
  info,
  
  // Handlers
  startWebcam,
  stopWebcam,
  dismissAuthWelcome,
  handleIdentityUnlock,
  handleIdentityLock,
  handleUpdateIdentity,
  
  // Constants
  SMOKING_ENABLED,
  ID_AUTH_LOCK_INTRUDER_FRAMES,
  ID_AUTH_UNLOCK_FRAMES,
  ID_AUTH_RETRY_INTERVAL_MS,
  DRIVER_ID_KEY,
  API_BASE,
  EYES_CLOSED_WARN_MS,
  PHONE_WARN_MS,
  SMOKING_WARN_MS,
}) {
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

  // Status icons configuration
  const STATUS_ICONS = [
    { id: "camera", icon: "📷", label: "Camera", active: false },
    { id: "attentive", icon: "🎯", label: "Tập trung", active: false },
    { id: "awake", icon: "👀", label: "Tỉnh táo", active: false },
    { id: "seatbelt", icon: "🔒", label: "An toàn", active: true },
    { id: "cabin", icon: "🚗", label: "Cabin", active: false },
    { id: "phone", icon: "📵", label: "Điện thoại", active: false },
    { id: "smoking", icon: "🚭", label: "Thuốc lá", active: false },
  ];

  const phoneIconActive = status === "active" && phoneActive;
  const smokingIconActive = status === "active" && SMOKING_ENABLED && smokingActive;

  const activeIcons = STATUS_ICONS.map((ic) => {
    let active = false;
    if (ic.id === "camera") active = status === "active";
    if (ic.id === "phone") active = phoneIconActive;
    if (ic.id === "smoking") active = smokingIconActive;
    if (ic.id === "cabin") active = cabinLightsOn || cabinAcOn;
    return { ...ic, active };
  });

  return (
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
                  : "NO"}
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

        {/* Smoking Alert */}
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

        {/* Phone Alert */}
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
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  border: "5px solid #ff8c00",
                  animation: "phoneAlarmBorder 0.45s ease-in-out infinite",
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
                    background: "rgba(255,140,0,0.3)",
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
    </div>
  );
}

export default DmsCameraStage;
