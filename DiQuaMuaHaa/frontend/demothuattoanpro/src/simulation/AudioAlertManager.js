const PATTERNS = Object.freeze({
  CAUTION: [[740, 0.08]],
  WARNING: [[620, 0.1], [760, 0.12]],
  CRITICAL: [[880, 0.12], [660, 0.1], [880, 0.18]],
  UNAVAILABLE: [[300, 0.16]],
});

const SPEECH = Object.freeze({
  DRIVER_DISTRACTED: "Tài xế đang mất tập trung.",
  DRIVER_DROWSY: "Cảnh báo buồn ngủ. Hãy tập trung.",
  DRIVER_HIGH_RISK: "Nguy hiểm. Trạng thái tài xế có rủi ro cao.",
  PHONE_USAGE: "Phát hiện sử dụng điện thoại.",
  OBSTACLE_AHEAD: "Chú ý, có vật cản phía trước.",
  OBSTACLE_CRITICAL: "Nguy hiểm, đang giảm tốc trong mô phỏng.",
  LANE_CHANGE_STARTED: "Đang chuyển làn trong mô phỏng.",
  SAFE_STOP: "Xe mô phỏng đang dừng an toàn.",
  CAMERA_UNAVAILABLE: "Mất tín hiệu camera.",
  MODEL_UNAVAILABLE: "Không có mô hình khả dụng.",
});

/** One managed Web Audio context. Audio is unlocked only by a user action. */
export class AudioAlertManager {
  constructor({ audioContextFactory, speech = globalThis.speechSynthesis } = {}) {
    this.audioContextFactory = audioContextFactory || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.speech = speech;
    this.context = null;
    this.enabled = false;
    this.voiceEnabled = false;
    this.volume = 0.55;
    this.timers = new Set();
  }

  async unlock() {
    if (!this.context) this.context = this.audioContextFactory();
    if (!this.context) return false;
    if (this.context.state === "suspended") await this.context.resume();
    this.enabled = true;
    return true;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) this.speech?.cancel?.();
  }

  setVoiceEnabled(value) {
    this.voiceEnabled = Boolean(value);
    if (!this.voiceEnabled) this.speech?.cancel?.();
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value) || 0));
  }

  play(alert) {
    if (!this.enabled || !alert?.shouldPlayAudio || !this.context) return false;
    const pattern = PATTERNS[alert.severity] || PATTERNS.CAUTION;
    let cursor = this.context.currentTime;
    for (const [frequency, duration] of pattern) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = alert.severity === "CRITICAL" ? "square" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.volume * 0.16), cursor + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + 0.02);
      cursor += duration + 0.07;
    }
    if (this.voiceEnabled && SPEECH[alert.type] && globalThis.SpeechSynthesisUtterance) {
      const utterance = new SpeechSynthesisUtterance(SPEECH[alert.type]);
      utterance.lang = "vi-VN";
      utterance.volume = this.volume;
      if (alert.severity === "CRITICAL") this.speech.cancel();
      this.speech.speak(utterance);
    }
    return true;
  }

  test() {
    return this.play({ type: "OBSTACLE_AHEAD", severity: "WARNING", shouldPlayAudio: true });
  }

  async dispose() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.speech?.cancel?.();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
    this.enabled = false;
  }
}
