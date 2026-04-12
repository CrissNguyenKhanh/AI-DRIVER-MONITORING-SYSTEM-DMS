/**
 * @fileoverview useDriverAlerts — interval 250ms đồng bộ UI và trigger cảnh báo.
 *
 * Trách nhiệm:
 *  - Mỗi ALERT_INTERVAL_MS: sync displayPose, displayEye từ refs → state
 *  - Timer smoking: đếm giây hút thuốc liên tục, set smokingAlert sau SMOKING_WARN_MS
 *  - Timer phone: đếm giây dùng điện thoại liên tục, set phoneAlert sau PHONE_WARN_MS
 *  - Timer drowsy: kết hợp EAR client (eyesClosedSecRef) + API label streak (server)
 *    → set drowsyAlert sau EYES_CLOSED_WARN_MS hoặc API streak ≥ API_STREAK_TRIGGER
 *  - Quản lý alarm (beep + vibration): startAlarm / stopAlarm
 *
 * @returns {{ startAlarm: Function, stopAlarm: Function, playBeep: Function }}
 */
import { useEffect, useRef, useCallback } from "react";
import {
  EYES_CLOSED_WARN_MS, PHONE_WARN_MS, SMOKING_WARN_MS,
  API_STREAK_TRIGGER, API_STREAK_MAX, ALERT_INTERVAL_MS,
} from "../constants/dmsConfig";

/**
 * useDriverAlerts — interval 250ms đọc refs và kích hoạt state alerts.
 *
 * Tách riêng khỏi useDriverAI để không làm nặng onResults callback.
 * Cũng quản lý alarm (beep + vibrate).
 *
 * @param {Object} refs - {
 *   eyesClosedSecRef, smokingDetectionRef, phoneDetectionRef,
 *   phoneSinceRef, phoneSecRef, smokingSinceRef, smokingSecRef,
 *   apiLabelRef, apiLabelStreakRef, alarmIntervalRef, vibrateIntervalRef,
 *   audioCtxRef, poseRef, eyeDataRef, blinkTimesRef, blinkDurRef,
 * }
 * @param {Object} setters - {
 *   setDisplayPose, setDisplayEye, setFrameCount,
 *   setSmokingAlert, setPhoneAlert, setDrowsyAlert,
 * }
 */
export function useDriverAlerts(refs, setters) {
  const {
    eyesClosedSecRef, smokingDetectionRef, phoneDetectionRef,
    phoneSinceRef, phoneSecRef, smokingSinceRef, smokingSecRef,
    apiLabelRef, apiLabelStreakRef, alarmIntervalRef, vibrateIntervalRef,
    audioCtxRef, poseRef, eyeDataRef, blinkTimesRef, blinkDurRef,
  } = refs;

  const {
    setDisplayPose, setDisplayEye,
    setSmokingAlert, setPhoneAlert, setDrowsyAlert,
  } = setters;

  // ── Alarm helpers ──────────────────────────────────────────────
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  }, [audioCtxRef]);

  const playBeep = useCallback((freq = 880, dur = 0.15) => {
    try {
      const ctx  = getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (_) {}
  }, [getAudioCtx]);

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  }, [alarmIntervalRef, vibrateIntervalRef]);

  const startAlarm = useCallback(() => {
    if (alarmIntervalRef.current) return;
    playBeep(880, 0.15);
    alarmIntervalRef.current = setInterval(() => playBeep(880, 0.15), 900);
    vibrateIntervalRef.current = setInterval(() => {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }, 1500);
  }, [alarmIntervalRef, vibrateIntervalRef, playBeep]);

  // ── 250ms interval: sync display + trigger alerts ──────────────
  useEffect(() => {
    const dispId = setInterval(() => {
      // Sync pose display
      const p = poseRef.current;
      setDisplayPose({ yaw: p.yaw, pitch: p.pitch, roll: p.roll });

      // Sync eye display
      const ed  = eyeDataRef.current;
      const now = Date.now();
      setDisplayEye({
        blinkRate: blinkTimesRef.current.length,
        blinkDur:  blinkDurRef.current.dur,
        pupilL:    ed.left.pupilR   ? ed.left.pupilR.toFixed(1)      : "33.5",
        lYaw:      ed.left.yaw      ? (-ed.left.yaw   * 18).toFixed(1) : "-11.8",
        lPitch:    ed.left.pitch    ? (-ed.left.pitch  * 18).toFixed(1) : "-21.6",
        rYaw:      ed.right.yaw     ? (-ed.right.yaw   * 18).toFixed(1) : "-19.9",
        rPitch:    ed.right.pitch   ? (-ed.right.pitch * 18).toFixed(1) : "-25.1",
        // Decorative 3D coords (placeholder)
        lX: (62   + Math.sin(now / 1100) * 3).toFixed(1),
        lY: (3.9  + Math.cos(now / 900)  * 1.2).toFixed(1),
        lZ: (-2.7 + Math.sin(now / 1300) * 0.8).toFixed(1),
        rX: (63.2 + Math.cos(now / 1200) * 2.8).toFixed(1),
        rY: (9.7  + Math.sin(now / 800)  * 1.5).toFixed(1),
        rZ: (-3.3 + Math.cos(now / 1400) * 0.9).toFixed(1),
      });

      // ── Smoking timer ──
      if (smokingDetectionRef.current?.active) {
        if (smokingSinceRef.current === null) smokingSinceRef.current = Date.now();
        smokingSecRef.current = (Date.now() - smokingSinceRef.current) / 1000;
      } else {
        smokingSinceRef.current = null;
        smokingSecRef.current   = 0;
      }
      if (smokingSecRef.current >= SMOKING_WARN_MS / 1000) {
        setSmokingAlert(smokingSecRef.current);
        if (!alarmIntervalRef.current) startAlarm();
      } else {
        setSmokingAlert(null);
      }

      // ── Phone timer ──
      if (phoneDetectionRef.current?.active) {
        if (phoneSinceRef.current === null) phoneSinceRef.current = Date.now();
        phoneSecRef.current = (Date.now() - phoneSinceRef.current) / 1000;
      } else {
        phoneSinceRef.current = null;
        phoneSecRef.current   = 0;
      }
      if (phoneSecRef.current >= PHONE_WARN_MS / 1000) {
        setPhoneAlert(phoneSecRef.current);
        if (!alarmIntervalRef.current) startAlarm();
      } else {
        setPhoneAlert(null);
      }

      // ── Drowsy: EAR (client) + API label streak (server) ──
      const closedSec = eyesClosedSecRef.current;
      const apiLabel  = apiLabelRef.current;

      if (apiLabel === "drowsy" || apiLabel === "yawning") {
        apiLabelStreakRef.current = Math.min(apiLabelStreakRef.current + 1, API_STREAK_MAX);
      } else {
        apiLabelStreakRef.current = Math.max(apiLabelStreakRef.current - 1, 0);
      }
      const apiStreakTriggered = apiLabelStreakRef.current >= API_STREAK_TRIGGER;
      const drowsyTriggered    = closedSec >= EYES_CLOSED_WARN_MS / 1000 || apiStreakTriggered;

      if (drowsyTriggered) {
        setDrowsyAlert(closedSec > 0 ? closedSec : 1);
        if (!alarmIntervalRef.current) startAlarm();
      } else {
        setDrowsyAlert(null);
        const anyAlert =
          phoneSecRef.current   >= PHONE_WARN_MS   / 1000 ||
          smokingSecRef.current >= SMOKING_WARN_MS / 1000;
        if (alarmIntervalRef.current && !anyAlert) stopAlarm();
      }
    }, ALERT_INTERVAL_MS);

    return () => clearInterval(dispId);
  }, []); // chạy vĩnh viễn, không phụ thuộc status

  return { startAlarm, stopAlarm, playBeep };
}
