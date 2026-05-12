/**
 * Phát lời chào sau khi xác thực chủ xe (Web Speech API, tiếng Việt nếu trình duyệt có giọng).
 */
export function speakOwnerGreeting(displayName) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  const raw = String(displayName || "").trim();
  const name = raw || "chủ xe";

  try {
    synth.cancel();
  } catch (_) {
    /* ignore */
  }

  const text = `HELLO BOSS WELCOMEBACK, ${name}.`;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "vi-VN";
  u.rate = 0.92;
  u.pitch = 1;

  const voices = synth.getVoices?.() || [];
  const vi =
    voices.find((v) => v.lang?.toLowerCase().startsWith("vi")) ||
    voices.find((v) => v.lang?.toLowerCase().includes("viet"));
  if (vi) u.voice = vi;

  try {
    synth.speak(u);
  } catch (_) {
    /* ignore */
  }
}

/** Một số trình duyệt load voices async */
export function warmSpeechVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const load = () => window.speechSynthesis.getVoices();
  load();
  window.speechSynthesis.onvoiceschanged = load;
}
