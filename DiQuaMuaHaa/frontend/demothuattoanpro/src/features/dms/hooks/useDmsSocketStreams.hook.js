import { useEffect } from "react";
import { io } from "socket.io-client";

function useDmsSocketStreams({
  API_BASE,
  status,
  videoRef,
  socketRef,
  wsReadyRef,
  wsPendingRef,
  wsLastSentRef,
  wsSmokePendingRef,
  wsSmokLastSentRef,
  phoneDetectionRef,
  smokingDetectionRef,
  smokingActiveRef,
  phoneActiveFilteredRef,
  phoneOnStreakRef,
  phoneOffStreakRef,
  phoneLastBoxRef,
  setWsConnected,
  setPhoneError,
  setPhoneHistory,
  setSmokingHistory,
  setPhoneActive,
  setSmokingActive,
  PHONE_YOLO_MIN_PROB,
  PHONE_HISTORY_LEN,
  PHONE_STABLE_FRAMES,
  PHONE_OFF_FRAMES,
  SMOKING_ENABLED,
  SMOKING_HISTORY_LEN,
  SMOKING_STABLE_FRAMES,
  SMOKING_OFF_FRAMES,
  SMOKING_MIN_PROB,
  PHONE_WS_FPS,
  SMOKING_WS_FPS,
}) {
  useEffect(() => {
    const sock = io(API_BASE, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = sock;

    sock.on("connect", () => {
      wsReadyRef.current = true;
      setWsConnected(true);
      setPhoneError("");
    });
    sock.on("disconnect", () => {
      wsReadyRef.current = false;
      wsPendingRef.current = false;
      setWsConnected(false);
    });
    sock.on("connect_error", () => {
      wsReadyRef.current = false;
      setPhoneError("WebSocket unreachable");
    });

    sock.on("smoking_result", (data) => {
      if (!SMOKING_ENABLED) return;
      wsSmokePendingRef.current = false;
      const lbl = data?.label ? String(data.label) : "";
      const prob = typeof data?.prob === "number" ? data.prob : 0;

      setSmokingHistory((prev) => {
        const n = prev.concat([{ label: lbl, prob }]);
        const trimmed =
          n.length > SMOKING_HISTORY_LEN
            ? n.slice(n.length - SMOKING_HISTORY_LEN)
            : n;

        const recentOn = trimmed.slice(-SMOKING_STABLE_FRAMES);
        const recentOff = trimmed.slice(-SMOKING_OFF_FRAMES);
        const shouldTurnOn =
          recentOn.length === SMOKING_STABLE_FRAMES &&
          recentOn.every((h) => h.label === "smoking" && h.prob >= SMOKING_MIN_PROB);
        const shouldTurnOff =
          recentOff.length === SMOKING_OFF_FRAMES &&
          recentOff.every((h) => h.label !== "smoking" || h.prob < SMOKING_MIN_PROB);

        if (shouldTurnOn) {
          smokingActiveRef.current = true;
          setSmokingActive(true);
        }
        if (shouldTurnOff) {
          smokingActiveRef.current = false;
          setSmokingActive(false);
        }

        smokingDetectionRef.current = {
          active: smokingActiveRef.current,
          prob,
          bbox: null,
        };
        return trimmed;
      });
    });

    sock.on("phone_result", (data) => {
      wsPendingRef.current = false;
      const boxesArr = Array.isArray(data?.boxes) ? data.boxes : [];
      const bestBox =
        boxesArr
          .filter((b) => b && (b.prob || 0) >= PHONE_YOLO_MIN_PROB)
          .sort((a, b) => (b.prob || 0) - (a.prob || 0))[0] || null;

      let yoloBox = null;
      if (bestBox) {
        const { x: cx, y: cy, w: bw, h: bh } = bestBox;
        yoloBox = {
          x1: Math.max(0, cx - bw / 2),
          y1: Math.max(0, cy - bh / 2),
          x2: Math.min(1, cx + bw / 2),
          y2: Math.min(1, cy + bh / 2),
        };
      }

      const rawProb = bestBox?.prob || 0;
      const candW = yoloBox ? yoloBox.x2 - yoloBox.x1 : 0;
      const candH = yoloBox ? yoloBox.y2 - yoloBox.y1 : 0;
      const sizeOk = yoloBox && candW >= 0.05 && candH >= 0.05 && candW <= 0.55 && candH <= 0.55;

      let motionOk = true;
      if (phoneLastBoxRef.current && yoloBox) {
        const lastCx = (phoneLastBoxRef.current.x1 + phoneLastBoxRef.current.x2) / 2;
        const lastCy = (phoneLastBoxRef.current.y1 + phoneLastBoxRef.current.y2) / 2;
        const candCx = (yoloBox.x1 + yoloBox.x2) / 2;
        const candCy = (yoloBox.y1 + yoloBox.y2) / 2;
        const dx = Math.abs(candCx - lastCx);
        const dy = Math.abs(candCy - lastCy);
        if (dx > 0.30 || dy > 0.22) motionOk = false;
      }

      const strongDetected =
        bestBox !== null && rawProb >= PHONE_YOLO_MIN_PROB && sizeOk && motionOk;

      if (strongDetected && yoloBox) phoneLastBoxRef.current = yoloBox;

      if (strongDetected) {
        phoneOnStreakRef.current += 1;
        phoneOffStreakRef.current = 0;
      } else {
        phoneOffStreakRef.current += 1;
        phoneOnStreakRef.current = 0;
      }

      if (!phoneActiveFilteredRef.current) {
        if (phoneOnStreakRef.current >= PHONE_STABLE_FRAMES) {
          phoneActiveFilteredRef.current = true;
          setPhoneActive(true);
        }
      } else if (phoneOffStreakRef.current >= PHONE_OFF_FRAMES) {
        phoneActiveFilteredRef.current = false;
        setPhoneActive(false);
      }

      const filteredActive = phoneActiveFilteredRef.current;
      phoneDetectionRef.current = {
        active: filteredActive,
        prob: rawProb,
        bbox: filteredActive ? phoneLastBoxRef.current || yoloBox : null,
      };

      setPhoneHistory((prev) => {
        const n = prev.concat([{ label: strongDetected ? "phone" : "no_phone", prob: rawProb }]);
        return n.length > PHONE_HISTORY_LEN ? n.slice(n.length - PHONE_HISTORY_LEN) : n;
      });
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!status || status !== "active") return;
    let rafId;
    const interval = 1000 / PHONE_WS_FPS;
    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = Date.now();
      const sock = socketRef.current;
      const vid = videoRef.current;
      if (!sock || !wsReadyRef.current || wsPendingRef.current) return;
      if (now - wsLastSentRef.current < interval) return;
      if (!vid || vid.readyState < 2) return;
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 240;
      c.getContext("2d").drawImage(vid, 0, 0, 320, 240);
      const image = c.toDataURL("image/jpeg", 0.6);
      wsPendingRef.current = true;
      wsLastSentRef.current = now;
      sock.emit("phone_frame", { image });
    }
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [PHONE_WS_FPS, status]);

  useEffect(() => {
    if (!SMOKING_ENABLED) return;
    if (!status || status !== "active") return;
    let rafId;
    const interval = 1000 / SMOKING_WS_FPS;
    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = Date.now();
      const sock = socketRef.current;
      const vid = videoRef.current;
      if (!sock || !wsReadyRef.current || wsSmokePendingRef.current) return;
      if (now - wsSmokLastSentRef.current < interval) return;
      if (!vid || vid.readyState < 2) return;
      const c = document.createElement("canvas");
      c.width = vid.videoWidth || 640;
      c.height = vid.videoHeight || 480;
      c.getContext("2d").drawImage(vid, 0, 0);
      const image = c.toDataURL("image/jpeg", 0.7);
      wsSmokePendingRef.current = true;
      wsSmokLastSentRef.current = now;
      sock.emit("smoking_frame", { image });
    }
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [SMOKING_ENABLED, SMOKING_WS_FPS, status]);
}

export default useDmsSocketStreams;
