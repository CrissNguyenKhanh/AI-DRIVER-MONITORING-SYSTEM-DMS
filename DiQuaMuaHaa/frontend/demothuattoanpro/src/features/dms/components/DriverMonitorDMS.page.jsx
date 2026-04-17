import React from "react";
import FakeYouTubeLayout from "../../../voice/FakeYouTubeLayout";
import useDriverMonitorDMS from "../hooks/useDriverMonitorDMS.hook";
import DmsLeftPanel from "./layout/DmsLeftPanel";
import DmsCameraStage from "./layout/DmsCameraStage";
import DmsBottomBar from "./layout/DmsBottomBar";
import "../styles/driver-monitor.animations.css";

// ═════════════════════════════════════════════════════════
// Driver Monitor DMS - Main Component
// ═════════════════════════════════════════════════════════
export default function DriverMonitorDMS() {
  const dms = useDriverMonitorDMS();

  const {
    videoRef,
    faceMeshRef,
    landmarksRef,
    eyeDataRef,
    handLandmarksRef,
    earHistoryRef,
    poseRef,
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
    status,
    setStatus,
    setDrowsyAlert,
    setPhoneAlert,
    setSmokingAlert,
    setAppMenuOpen,
    setCabinLightsOn,
    setCabinAcOn,
    setYoutubeMockOpen,
    setSessionLogOpen,
    errorMsg,
    apiResult,
    apiError,
    apiLoading,
    handApiResult,
    appMenuOpen,
    lastUpdated,
    time,
    frameCount,
    wsConnected,
    drowsyAlert,
    phoneActive,
    phoneAlert,
    smokingActive,
    smokingAlert,
    driverId,
    identityOwner,
    identityHasRegistered,
    identitySimilarity,
    identityError,
    identitySamples,
    identityLockCause,
    identityRejectLockedAt,
    authWelcomeProfile,
    cabinLightsOn,
    cabinAcOn,
    youtubeMockOpen,
    drivingSessionId,
    drivingSessionStartedAt,
    sessionAlertCounts,
    sessionLogOpen,
    sessionLogLoading,
    sessionLogItems,
    phoneError,
    smokingError,
    displayEye,
    yDeg,
    pDeg,
    rDeg,
    blinkHL,
    isAlert,
    info,
    startWebcam,
    stopWebcam,
    stopAlarm,
    dismissAuthWelcome,
    handleIdentityUnlock,
    handleIdentityLock,
    handleUpdateIdentity,
    SMOKING_ENABLED,
    ID_AUTH_LOCK_INTRUDER_FRAMES,
    ID_AUTH_UNLOCK_FRAMES,
    ID_AUTH_RETRY_INTERVAL_MS,
    API_BASE,
  } = dms;

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
      {/* ══ LEFT PANEL ══ */}
      <DmsLeftPanel
        poseRef={poseRef}
        eyeDataRef={eyeDataRef}
        earHistoryRef={earHistoryRef}
        yDeg={yDeg}
        pDeg={pDeg}
        rDeg={rDeg}
        displayEye={displayEye}
        blinkHL={blinkHL}
      />

      {/* ══ RIGHT PANEL (Camera + HUD + Alerts + States) ══ */}
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
        <DmsCameraStage
          // Refs
          videoRef={videoRef}
          faceMeshRef={faceMeshRef}
          landmarksRef={landmarksRef}
          eyeDataRef={eyeDataRef}
          handLandmarksRef={handLandmarksRef}
          phoneDetectionRef={phoneDetectionRef}
          smokingDetectionRef={smokingDetectionRef}
          smokingSinceRef={smokingSinceRef}
          smokingSecRef={smokingSecRef}
          phoneSinceRef={phoneSinceRef}
          phoneSecRef={phoneSecRef}
          alarmIntervalRef={alarmIntervalRef}
          vibrateIntervalRef={vibrateIntervalRef}
          // Core state
          status={status}
          setStatus={setStatus}
          errorMsg={errorMsg}
          apiResult={apiResult}
          apiError={apiError}
          apiLoading={apiLoading}
          handApiResult={handApiResult}
          appMenuOpen={appMenuOpen}
          setAppMenuOpen={setAppMenuOpen}
          time={time}
          wsConnected={wsConnected}
          drowsyAlert={drowsyAlert}
          setDrowsyAlert={setDrowsyAlert}
          phoneActive={phoneActive}
          phoneAlert={phoneAlert}
          setPhoneAlert={setPhoneAlert}
          smokingActive={smokingActive}
          smokingAlert={smokingAlert}
          setSmokingAlert={setSmokingAlert}
          driverId={driverId}
          identityOwner={identityOwner}
          identityHasRegistered={identityHasRegistered}
          identitySimilarity={identitySimilarity}
          identityError={identityError}
          identitySamples={identitySamples}
          identityLockCause={identityLockCause}
          identityRejectLockedAt={identityRejectLockedAt}
          authWelcomeProfile={authWelcomeProfile}
          cabinLightsOn={cabinLightsOn}
          setCabinLightsOn={setCabinLightsOn}
          cabinAcOn={cabinAcOn}
          setCabinAcOn={setCabinAcOn}
          youtubeMockOpen={youtubeMockOpen}
          setYoutubeMockOpen={setYoutubeMockOpen}
          drivingSessionId={drivingSessionId}
          drivingSessionStartedAt={drivingSessionStartedAt}
          sessionAlertCounts={sessionAlertCounts}
          sessionLogOpen={sessionLogOpen}
          setSessionLogOpen={setSessionLogOpen}
          sessionLogLoading={sessionLogLoading}
          sessionLogItems={sessionLogItems}
          phoneError={phoneError}
          smokingError={smokingError}
          // Derived values
          isAlert={isAlert}
          info={info}
          // Handlers
          startWebcam={startWebcam}
          stopAlarm={stopAlarm}
          dismissAuthWelcome={dismissAuthWelcome}
          handleIdentityUnlock={handleIdentityUnlock}
          handleIdentityLock={handleIdentityLock}
          handleUpdateIdentity={handleUpdateIdentity}
          // Constants
          SMOKING_ENABLED={SMOKING_ENABLED}
          ID_AUTH_LOCK_INTRUDER_FRAMES={ID_AUTH_LOCK_INTRUDER_FRAMES}
          ID_AUTH_UNLOCK_FRAMES={ID_AUTH_UNLOCK_FRAMES}
          ID_AUTH_RETRY_INTERVAL_MS={ID_AUTH_RETRY_INTERVAL_MS}
          API_BASE={API_BASE}
          // Additional refs needed for alerts
          eyesClosedSinceRef={eyesClosedSinceRef}
          eyesClosedSecRef={eyesClosedSecRef}
        />

        {/* ══ BOTTOM BAR ══ */}
        <DmsBottomBar
          status={status}
          frameCount={frameCount}
          lastUpdated={lastUpdated}
          wsConnected={wsConnected}
          identityOwner={identityOwner}
          identityHasRegistered={identityHasRegistered}
          apiError={apiError}
          identityError={identityError}
          startWebcam={startWebcam}
          stopWebcam={stopWebcam}
        />
      </div>

      <FakeYouTubeLayout
        open={youtubeMockOpen}
        onClose={() => setYoutubeMockOpen(false)}
      />
    </div>
  );
}
