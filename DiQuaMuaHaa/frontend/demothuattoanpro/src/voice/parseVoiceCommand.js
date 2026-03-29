/**
 * parseVoiceCommand.js — v5
 *
 * Lệnh:
 *   Kích hoạt  : "activate"
 *   Bật đèn    : "on"
 *   Tắt đèn    : "off"
 *   Bật AC     : "ac on" | "air on"
 *   Tắt AC     : "ac off" | "air off"
 *   Mở YouTube : "youtube" | "open youtube"
 *   Đóng YT    : "back" | "close" | "close youtube"
 *   Tắt trợ lý : "deactivate" | "stop"
 */

// ─── Self-reply block — chỉ block câu DÀI (≥ 4 từ) ──────────────────────────
const SELF_REPLY_PHRASES = [
  "ready for commands",
  "air conditioning on",
  "air conditioning off",
  "opening youtube",
  "going back",
  "sorry i didn",
  "didn't catch that",
];

function isSelfReply(t) {
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) return false; // câu ngắn → không bao giờ block
  return SELF_REPLY_PHRASES.some((p) => t.includes(p));
}

// ─── Wake word ────────────────────────────────────────────────────────────────
const WAKE_PATTERNS = [
  /\bhey\s+car\b/i,
  /\bhey\s+vehicle\b/i,
  /xe\s+ơi/i,
  /ô\s+tô\s+ơi/i,
  /này\s+xe/i,
];

export function hasWakeWord(text) {
  if (!text || typeof text !== "string") return false;
  return WAKE_PATTERNS.some((p) => p.test(text.trim()));
}

export function stripWakeAndNormalize(text) {
  let t = text.trim().toLowerCase();
  for (const p of WAKE_PATTERNS) t = t.replace(p, " ");
  return t.replace(/[,;.?!…]+/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.!?…,;:'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lev(a, b) {
  if (a === b) return 0;
  if (a.length > 20 || b.length > 20) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}

function fuzzyContains(t, kw, maxDist = 1) {
  if (t.includes(kw)) return true;
  const len = kw.length;
  for (let i = 0; i <= t.length - len; i++)
    if (lev(t.slice(i, i + len), kw) <= maxDist) return true;
  return false;
}

// ─── ARM ──────────────────────────────────────────────────────────────────────

export function tryVoiceArm(fullTranscript) {
  const t = norm(stripWakeAndNormalize(String(fullTranscript || "")) || fullTranscript);
  if (!t) return null;
  if (isSelfReply(t)) return null;

  if (fuzzyContains(t, "activate", 2) && !t.includes("deactivate"))
    return { cmd: "voice_arm" };
  if (/bật\s*trợ\s*lý|kích\s*hoạt|kich\s*hoat/.test(t))
    return { cmd: "voice_arm" };

  return null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseVoiceIntent(fullTranscript, options = {}) {
  const requireWake = options.requireWake !== false;
  const raw = String(fullTranscript || "").trim();
  if (!raw) return null;

  if (requireWake && !hasWakeWord(raw)) return { error: "no_wake" };

  const t = norm(stripWakeAndNormalize(raw) || raw);
  if (isSelfReply(t)) return null;

  return matchCommand(t);
}

// ─── Command matcher ──────────────────────────────────────────────────────────

function matchCommand(t) {

  // ── YouTube open ─────────────────────────────────────────────────────────
  const hasYT = /youtube|you\s*tube/.test(t) || fuzzyContains(t, "youtube", 2);
  if (hasYT) {
    // "back", "close", "off" kèm youtube → đóng
    const wantClose = /\b(close|off|stop|exit|quit|back|tắt|đóng|dong)\b/.test(t);
    return wantClose ? { cmd: "youtube_close" } : { cmd: "youtube_open" };
  }

  // ── "back" đứng một mình → đóng YouTube (quay lại) ──────────────────────
  if (t === "back" || t === "go back") {
    return { cmd: "youtube_close" };
  }

  // ── Deactivate — TRƯỚC activate ──────────────────────────────────────────
  if (
    fuzzyContains(t, "deactivate", 2) ||
    /\bstop\s+listening\b/.test(t) ||
    /tắt\s*trợ\s*lý|tắt\s*micro/.test(t) ||
    t === "n"
  ) {
    return { cmd: "stop_voice" };
  }

  // ── Activate ──────────────────────────────────────────────────────────────
  if (fuzzyContains(t, "activate", 2) && !t.includes("deactivate") && !/\boff\b/.test(t)) {
    return { cmd: "voice_arm" };
  }

  // ── AC (kiểm tra trước on/off đơn để "ac on" không thành light_on) ────────
  const hasAC = /\b(ac|a\/c|aircon|air\s*con|conditioning|điều\s*hòa|dieu\s*hoa)\b/.test(t);
  if (hasAC) {
    if (/\b(off|disable)\b/.test(t) || /tắt|tat/.test(t)) return { cmd: "ac_off" };
    if (/\b(on|enable)\b/.test(t)   || /bật|bat/.test(t)) return { cmd: "ac_on" };
  }

  // ── Lights với từ "light/lights/đèn" kèm on/off ──────────────────────────
  const hasLight = /\b(light|lights|lamp|đèn|den)\b/.test(t) || fuzzyContains(t, "lights", 1);
  if (hasLight) {
    if (/\b(off|disable)\b/.test(t) || /tắt|tat/.test(t)) return { cmd: "light_off" };
    if (/\b(on|enable)\b/.test(t)   || /bật|bat/.test(t)) return { cmd: "light_on" };
  }

  // ── "on" / "off" đứng một mình → đèn ─────────────────────────────────────
  // Dùng exact match để tránh nhầm với "gone", "bond", "song"...
  if (t === "on")  return { cmd: "light_on" };
  if (t === "off") return { cmd: "light_off" };

  // ── "turn on/off" không kèm object → đèn ────────────────────────────────
  if (/\bturn\s+on\b/.test(t) || /\bswitch\s+on\b/.test(t))  return { cmd: "light_on" };
  if (/\bturn\s+off\b/.test(t) || /\bswitch\s+off\b/.test(t)) return { cmd: "light_off" };

  // Legacy
  if (t === "open") return { cmd: "light_on" };
  if (t === "and" || /\bendgame\b/.test(t)) return { cmd: "light_off" };

  return { error: "unknown" };
}