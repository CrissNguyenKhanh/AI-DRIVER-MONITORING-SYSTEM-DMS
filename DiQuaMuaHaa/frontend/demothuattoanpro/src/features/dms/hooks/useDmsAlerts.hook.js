import { useEffect } from "react";

function useDmsAlerts({
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
}) {
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [setTime]);

  useEffect(() => {
    const dispId = setInterval(() => {
      const p = poseRef.current;
      setDisplayPose({ yaw: p.yaw, pitch: p.pitch, roll: p.roll });
      const ed = eyeDataRef.current;
      const now = Date.now();
      setDisplayEye({
        blinkRate: blinkTimesRef.current.length,
        blinkDur: blinkDurRef.current.dur,
        pupilL: ed.left.pupilR ? ed.left.pupilR.toFixed(1) : "33.5",
        lYaw: ed.left.yaw ? (-ed.left.yaw * 18).toFixed(1) : "-11.8",
        lPitch: ed.left.pitch ? (-ed.left.pitch * 18).toFixed(1) : "-21.6",
        rYaw: ed.right.yaw ? (-ed.right.yaw * 18).toFixed(1) : "-19.9",
        rPitch: ed.right.pitch ? (-ed.right.pitch * 18).toFixed(1) : "-25.1",
        lX: (62 + Math.sin(now / 1100) * 3).toFixed(1),
        lY: (3.9 + Math.cos(now / 900) * 1.2).toFixed(1),
        lZ: (-2.7 + Math.sin(now / 1300) * 0.8).toFixed(1),
        rX: (63.2 + Math.cos(now / 1200) * 2.8).toFixed(1),
        rY: (9.7 + Math.sin(now / 800) * 1.5).toFixed(1),
        rZ: (-3.3 + Math.cos(now / 1400) * 0.9).toFixed(1),
      });
      setFrameCount((f) => f);

      if (smokingDetectionRef.current?.active) {
        if (smokingSinceRef.current === null) smokingSinceRef.current = Date.now();
        smokingSecRef.current = (Date.now() - smokingSinceRef.current) / 1000;
      } else {
        smokingSinceRef.current = null;
        smokingSecRef.current = 0;
      }
      if (smokingSecRef.current >= SMOKING_WARN_MS / 1000) {
        setSmokingAlert(smokingSecRef.current);
        if (!alarmIntervalRef.current)
          startAlarm(audioCtxRef, alarmIntervalRef, vibrateIntervalRef);
      } else {
        setSmokingAlert(null);
      }

      if (phoneDetectionRef.current?.active) {
        if (phoneSinceRef.current === null) phoneSinceRef.current = Date.now();
        phoneSecRef.current = (Date.now() - phoneSinceRef.current) / 1000;
      } else {
        phoneSinceRef.current = null;
        phoneSecRef.current = 0;
      }
      if (phoneSecRef.current >= PHONE_WARN_MS / 1000) {
        setPhoneAlert(phoneSecRef.current);
        if (!alarmIntervalRef.current)
          startAlarm(audioCtxRef, alarmIntervalRef, vibrateIntervalRef);
      } else {
        setPhoneAlert(null);
      }

      const closedSec = eyesClosedSecRef.current;
      if (closedSec >= EYES_CLOSED_WARN_MS / 1000) {
        setDrowsyAlert(closedSec);
        if (!alarmIntervalRef.current)
          startAlarm(audioCtxRef, alarmIntervalRef, vibrateIntervalRef);
      } else {
        setDrowsyAlert(null);
        const anyAlert =
          phoneSecRef.current >= PHONE_WARN_MS / 1000 ||
          smokingSecRef.current >= SMOKING_WARN_MS / 1000;
        if (alarmIntervalRef.current && !anyAlert)
          stopAlarm(alarmIntervalRef, vibrateIntervalRef);
      }
    }, 250);
    return () => clearInterval(dispId);
  }, []);
}

export default useDmsAlerts;
