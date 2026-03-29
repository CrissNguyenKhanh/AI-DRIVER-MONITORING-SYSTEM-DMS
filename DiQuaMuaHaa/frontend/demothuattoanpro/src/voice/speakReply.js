/**
 * speakReply.js
 * @param {string} text
 * @param {Function} [onEnd] - gọi khi nói xong
 */
export function speakReply(text, onEnd) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang   = "en-US";
  u.rate   = 1.05;
  u.pitch  = 1.0;
  u.volume = 0.9;
  u.onend   = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function warmSpeechVoices() {
  if (typeof window !== "undefined" && window.speechSynthesis)
    window.speechSynthesis.getVoices();
}