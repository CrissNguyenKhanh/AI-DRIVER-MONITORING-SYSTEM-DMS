import { useCallback, useEffect, useRef } from "react";

export function useDmsAudio() {
  const audioCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const vibrateIntervalRef = useRef(null);

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
  }, []);

  const startAlarm = useCallback(() => {
    stopAlarm();
    playBeep(880, 0.18, 0.7);
    setTimeout(() => playBeep(660, 0.18, 0.7), 200);
    alarmIntervalRef.current = setInterval(() => {
      playBeep(880, 0.18, 0.7);
      setTimeout(() => playBeep(660, 0.18, 0.7), 200);
    }, 900);
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
      vibrateIntervalRef.current = setInterval(
        () => navigator.vibrate([300, 150, 300, 150, 300]),
        1500,
      );
    }
  }, [playBeep, stopAlarm]);

  useEffect(() => stopAlarm, [stopAlarm]);

  return { audioCtxRef, playBeep, startAlarm, stopAlarm };
}

export default useDmsAudio;
