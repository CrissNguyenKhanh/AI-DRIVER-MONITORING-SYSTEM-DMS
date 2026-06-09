import { useCallback, useEffect, useRef, useState } from "react";

export function useDmsAudio() {
  const audioCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const vibrateIntervalRef = useRef(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const safeVibrate = useCallback((pattern) => {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // Vibration can be blocked until a user gesture; ignore cleanly.
    }
  }, []);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext || window.webkitAudioContext
      )();
    }
    return audioCtxRef.current;
  }, []);

  const playBeep = useCallback(
    (freq, dur, vol) => {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        g.gain.setValueAtTime(vol, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + dur);
      } catch {
        // AudioContext can fail before a user gesture; alarms are best-effort.
      }
    },
    [getAudioCtx],
  );

  const warmUpAudio = useCallback(() => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      safeVibrate(1);
      setAudioUnlocked(true);
    } catch {
      // Browser audio permission is best-effort until a user gesture occurs.
    }
  }, [getAudioCtx, safeVibrate]);

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    safeVibrate(0);
  }, [safeVibrate]);

  const startAlarm = useCallback(() => {
    stopAlarm();
    playBeep(880, 0.18, 0.7);
    setTimeout(() => playBeep(660, 0.18, 0.7), 200);
    alarmIntervalRef.current = setInterval(() => {
      playBeep(880, 0.18, 0.7);
      setTimeout(() => playBeep(660, 0.18, 0.7), 200);
    }, 900);
    if (navigator.vibrate) {
      safeVibrate([300, 150, 300, 150, 300]);
      vibrateIntervalRef.current = setInterval(
        () => safeVibrate([300, 150, 300, 150, 300]),
        1500,
      );
    }
  }, [playBeep, safeVibrate, stopAlarm]);

  useEffect(() => stopAlarm, [stopAlarm]);

  return {
    audioCtxRef,
    audioUnlocked,
    playBeep,
    startAlarm,
    stopAlarm,
    warmUpAudio,
  };
}

export default useDmsAudio;
