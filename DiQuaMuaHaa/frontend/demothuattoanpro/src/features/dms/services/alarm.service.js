function getAudioCtx(audioCtxRef) {
  if (!audioCtxRef.current)
    audioCtxRef.current = new (
      window.AudioContext || window.webkitAudioContext
    )();
  return audioCtxRef.current;
}

function playBeep(audioCtxRef, freq, dur, vol) {
  try {
    const ctx = getAudioCtx(audioCtxRef);
    const osc = ctx.createOscillator(),
      g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (_) {}
}

function startAlarm(audioCtxRef, alarmIntervalRef, vibrateIntervalRef) {
  stopAlarm(alarmIntervalRef, vibrateIntervalRef);
  playBeep(audioCtxRef, 880, 0.18, 0.7);
  setTimeout(() => playBeep(audioCtxRef, 660, 0.18, 0.7), 200);
  alarmIntervalRef.current = setInterval(() => {
    playBeep(audioCtxRef, 880, 0.18, 0.7);
    setTimeout(() => playBeep(audioCtxRef, 660, 0.18, 0.7), 200);
  }, 900);
  if (navigator.vibrate) {
    navigator.vibrate([300, 150, 300, 150, 300]);
    vibrateIntervalRef.current = setInterval(
      () => navigator.vibrate([300, 150, 300, 150, 300]),
      1500,
    );
  }
}

function stopAlarm(alarmIntervalRef, vibrateIntervalRef) {
  if (alarmIntervalRef.current) {
    clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = null;
  }
  if (vibrateIntervalRef.current) {
    clearInterval(vibrateIntervalRef.current);
    vibrateIntervalRef.current = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

export { getAudioCtx, playBeep, startAlarm, stopAlarm };
