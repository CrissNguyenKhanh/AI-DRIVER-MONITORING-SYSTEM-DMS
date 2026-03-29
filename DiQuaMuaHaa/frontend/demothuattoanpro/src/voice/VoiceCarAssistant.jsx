import React, { useCallback, useEffect, useRef, useState } from "react";
import { parseVoiceIntent, tryVoiceArm } from "./parseVoiceCommand";
import { speakReply } from "./speakReply";

function getRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function VoiceCarAssistant({
  enabled = true,
  requireWake = true,
  allowCommandWithoutWake = true,
  autoStartWhenEnabled = true,
  speechLang = "en-US",
  onLightChange,
  onAcChange,
  onYoutubeOpen,
  onYoutubeClose,
  reply = true,
  showManualMicControl = false,
}) {
  const [listening, setListening]   = useState(false);
  const [lastHeard, setLastHeard]   = useState("");
  const [hint, setHint]             = useState("");
  const [armed, setArmed]           = useState(false);

  const armedRef         = useRef(false);
  const recRef           = useRef(null);
  const wantListenRef    = useRef(false);
  const startRecRef      = useRef(() => {});
  const isSpeakingRef    = useRef(false);
  const cooldownRef      = useRef(false);
  const lastFinalRef     = useRef("");
  const lastFinalTimeRef = useRef(0);

  const syncArmed = useCallback((v) => {
    armedRef.current = v;
    setArmed(v);
  }, []);

  const speak = useCallback((text) => {
    if (!reply || !text) return;
    const wordCount = text.trim().split(/\s+/).length;
    const isLong = wordCount >= 4;

    if (isLong) isSpeakingRef.current = true;

    speakReply(text, () => {
      setTimeout(() => { isSpeakingRef.current = false; }, 300);
    });

    if (isLong) {
      const estimatedMs = Math.max(1200, wordCount * 320);
      setTimeout(() => { isSpeakingRef.current = false; }, estimatedMs);
    }
  }, [reply]);

  const startCooldown = useCallback(() => {
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 1000);
  }, []);

  const applyIntent = useCallback(
    (transcript) => {
      const t = String(transcript || "").trim();
      if (!t) return;

      if (isSpeakingRef.current) return;
      if (cooldownRef.current) return;

      const now = Date.now();
      if (t === lastFinalRef.current && now - lastFinalTimeRef.current < 700) return;
      lastFinalRef.current = t;
      lastFinalTimeRef.current = now;

      setLastHeard(t);

      if (!armedRef.current) {
        const arm = tryVoiceArm(t);
        if (arm) {
          syncArmed(true);
          setHint('🎙 on · off · youtube · back · deactivate');
          speak("Activated.");
          startCooldown();
        }
        return;
      }

      let intent = parseVoiceIntent(t, { requireWake: false });
      if (intent?.error === "no_wake" && allowCommandWithoutWake) {
        intent = parseVoiceIntent(t, { requireWake: false });
      }
      if (!intent) return;
      if (intent.error === "no_wake") return;

      if (intent.error === "unknown") {
        // KHÔNG speakReply → tránh vòng lặp
        setHint("❓ on · off · youtube · back · deactivate");
        return;
      }

      startCooldown();

      switch (intent.cmd) {
        case "voice_arm":
          setHint("🎙 Ready");
          speak("Listening.");
          break;
        case "light_on":
          onLightChange?.(true);
          setHint("💡 ON");
          speak("On.");
          break;
        case "light_off":
          onLightChange?.(false);
          setHint("💡 OFF");
          speak("Off.");
          break;
        case "ac_on":
          onAcChange?.(true);
          setHint("❄️ AC ON");
          speak("AC on.");
          break;
        case "ac_off":
          onAcChange?.(false);
          setHint("❄️ AC OFF");
          speak("AC off.");
          break;
        case "stop_voice":
          syncArmed(false);
          setHint("⏹ Say 'activate' to resume");
          speak("Deactivated.");
          break;
        case "youtube_open":
          onYoutubeOpen?.();
          setHint("▶ YouTube");
          speak("Opening YouTube.");
          break;
        case "youtube_close":
          onYoutubeClose?.();
          setHint("↩ Back");
          speak("Going back.");
          break;
        default:
          break;
      }
    },
    [
      onLightChange, onAcChange, onYoutubeOpen, onYoutubeClose,
      allowCommandWithoutWake, speak, syncArmed, startCooldown,
    ],
  );

  const stopRec = useCallback(() => {
    wantListenRef.current = false;
    syncArmed(false);
    try { recRef.current?.stop?.(); } catch (_) {}
    recRef.current = null;
    setListening(false);
  }, [syncArmed]);

  const startRec = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setHint("Requires Chrome or Edge"); return; }

    stopRec();
    wantListenRef.current = true;

    const rec = new Ctor();
    recRef.current      = rec;
    rec.lang            = speechLang;
    rec.interimResults  = true;
    rec.continuous      = true;
    rec.maxAlternatives = 3;

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result  = ev.results[i];
        const isFinal = result.isFinal;

        if (!isFinal) {
          const interim = result[0].transcript.trim();
          if (interim) setLastHeard(`… ${interim}`);
          continue;
        }

        const firstAlt  = result[0].transcript.trim();
        const wordCount = firstAlt.split(/\s+/).filter(Boolean).length;
        // Block chỉ khi loa đang phát VÀ câu dài
        if (isSpeakingRef.current && wordCount >= 4) continue;

        let handled = false;
        for (let a = 0; a < result.length; a++) {
          const alt = result[a].transcript.trim();
          if (!alt) continue;

          if (!armedRef.current) {
            if (tryVoiceArm(alt)) { applyIntent(alt); handled = true; break; }
          } else {
            const intent = parseVoiceIntent(alt, { requireWake: false });
            if (intent && !intent.error) { applyIntent(alt); handled = true; break; }
          }
        }

        if (!handled) applyIntent(firstAlt);
      }
    };

    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setHint(`Mic error: ${ev.error}`);
    };

    rec.onend = () => {
      if (recRef.current !== rec || !wantListenRef.current) return;
      try { rec.start(); } catch (_) {
        wantListenRef.current = false;
        setListening(false);
      }
    };

    try {
      rec.start();
      setListening(true);
      setHint("Say 'activate' to start");
    } catch (e) {
      wantListenRef.current = false;
      setHint(String(e.message || "Cannot open mic"));
      setListening(false);
    }
  }, [applyIntent, stopRec, speechLang]);

  startRecRef.current = startRec;

  useEffect(() => {
    if (!enabled) { stopRec(); return; }
    if (!autoStartWhenEnabled) return;
    syncArmed(false);
    const id = window.setTimeout(() => startRecRef.current(), 500);
    return () => window.clearTimeout(id);
  }, [enabled, autoStartWhenEnabled, stopRec, syncArmed]);

  useEffect(() => () => stopRec(), [stopRec]);

  if (!enabled) return null;

  const supported = Boolean(getRecognitionCtor());

  return (
    <div style={{
      position: "absolute", bottom: 44, right: 12, zIndex: 44,
      display: "flex", flexDirection: "column", alignItems: "flex-end",
      gap: 6, maxWidth: 300, pointerEvents: "auto",
    }}>
      {showManualMicControl && (
        <button
          type="button"
          onClick={() => (listening ? stopRec() : startRec())}
          disabled={!supported}
          style={{
            padding: "8px 12px", borderRadius: 20,
            border: listening
              ? "1px solid rgba(0,229,120,0.7)"
              : "1px solid rgba(60,150,255,0.45)",
            background: listening ? "rgba(0,40,24,0.92)" : "rgba(8,20,40,0.88)",
            color: listening ? "#00e578" : "#7ab8d8",
            fontSize: 11, fontWeight: 700,
            cursor: supported ? "pointer" : "not-allowed",
          }}
        >
          {listening ? "🎙 Stop mic" : "🎤 Start mic"}
        </button>
      )}

      <div style={{
        fontSize: 9, color: "rgba(140,180,220,0.85)",
        textAlign: "right", lineHeight: 1.45, textShadow: "0 1px 2px #000",
      }}>
        {!supported
          ? "Requires Chrome or Edge."
          : listening
            ? armed
              ? "🟢 on · off · youtube · back · deactivate"
              : "⚪ Say: activate"
            : autoStartWhenEnabled
              ? "Connecting mic…"
              : "Enable autoStart"}
      </div>

      {lastHeard && (
        <div style={{
          fontSize: 9,
          color: lastHeard.startsWith("…") ? "rgba(155,224,255,0.45)" : "#9be0ff",
          textAlign: "right", maxWidth: 280, wordBreak: "break-word",
          fontStyle: lastHeard.startsWith("…") ? "italic" : "normal",
        }}>
          {lastHeard.startsWith("…") ? lastHeard : `Heard: ${lastHeard}`}
        </div>
      )}

      {hint && (
        <div style={{ fontSize: 9, color: "#ffc940", textAlign: "right" }}>
          {hint}
        </div>
      )}
    </div>
  );
}