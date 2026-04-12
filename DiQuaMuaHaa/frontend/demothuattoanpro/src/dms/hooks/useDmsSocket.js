/**
 * @fileoverview useDmsSocket — Socket.IO connection và gửi frames qua WebSocket.
 *
 * Trách nhiệm:
 *  - Kết nối Socket.IO tới API_BASE (1 lần, reconnect tự động)
 *  - Nhận phone_result: áp dụng hysteresis (PHONE_STABLE_FRAMES / PHONE_OFF_FRAMES)
 *    và bbox filter (size + motion) trước khi cập nhật phoneDetectionRef
 *  - Nhận smoking_result: áp dụng hysteresis tương tự
 *  - RAF loop ~PHONE_WS_FPS: gửi frame JPEG qua socket emit "phone_frame"
 *  - RAF loop ~SMOKING_WS_FPS: gửi frame JPEG qua socket emit "smoking_frame"
 *
 * Không render gì — chỉ đọc/ghi refs và cập nhật state khi trạng thái detection thay đổi.
 */
import { useEffect } from "react";
import { io } from "socket.io-client";
import {
  API_BASE,
  SMOKING_ENABLED,
  SMOKING_HISTORY_LEN, SMOKING_STABLE_FRAMES, SMOKING_OFF_FRAMES, SMOKING_MIN_PROB,
  PHONE_YOLO_MIN_PROB, PHONE_HISTORY_LEN, PHONE_STABLE_FRAMES, PHONE_OFF_FRAMES,
  PHONE_WS_FPS, SMOKING_WS_FPS,
  PHONE_BOX_MIN_SIZE, PHONE_BOX_MAX_SIZE,
  PHONE_MOTION_MAX_X, PHONE_MOTION_MAX_Y,
} from "../constants/dmsConfig";

/**
 * useDmsSocket — Socket.IO connection + phone/smoking frame send loops.
 *
 * @param {Object} refs - {
 *   socketRef, wsReadyRef, wsPendingRef, wsLastSentRef,
 *   wsSmokePendingRef, wsSmokLastSentRef,
 *   phoneDetectionRef, phoneActiveFilteredRef,
 *   phoneOnStreakRef, phoneOffStreakRef, phoneLastBoxRef,
 *   smokingDetectionRef, smokingActiveRef,
 *   videoRef,
 * }
 * @param {Object} setters - {
 *   setWsConnected, setPhoneError,
 *   setPhoneActive, setPhoneHistory,
 *   setSmokingActive, setSmokingHistory,
 * }
 * @param {string} status  - app status
 * @param {string} driverId
 */
export function useDmsSocket(refs, setters, status, driverId) {
  const {
    socketRef, wsReadyRef, wsPendingRef, wsLastSentRef,
    wsSmokePendingRef, wsSmokLastSentRef,
    phoneDetectionRef, phoneActiveFilteredRef,
    phoneOnStreakRef, phoneOffStreakRef, phoneLastBoxRef,
    smokingDetectionRef, smokingActiveRef,
    videoRef,
  } = refs;

  const {
    setWsConnected, setPhoneError,
    setPhoneActive, setPhoneHistory,
    setSmokingActive, setSmokingHistory,
  } = setters;

  // ── Socket.IO connect + event handlers ──────────────────────────
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
      wsReadyRef.current   = false;
      wsPendingRef.current = false;
      setWsConnected(false);
    });
    sock.on("connect_error", () => {
      wsReadyRef.current = false;
      setPhoneError("WebSocket unreachable");
    });

    // ── smoking_result ──
    sock.on("smoking_result", (data) => {
      if (!SMOKING_ENABLED) return;
      wsSmokePendingRef.current = false;
      const lbl  = data?.label ? String(data.label) : "";
      const prob = typeof data?.prob === "number" ? data.prob : 0;

      setSmokingHistory((prev) => {
        const trimmed = prev.concat([{ label: lbl, prob }])
          .slice(-SMOKING_HISTORY_LEN);

        const shouldTurnOn =
          trimmed.slice(-SMOKING_STABLE_FRAMES).length === SMOKING_STABLE_FRAMES &&
          trimmed.slice(-SMOKING_STABLE_FRAMES).every(
            (h) => h.label === "smoking" && h.prob >= SMOKING_MIN_PROB,
          );
        const shouldTurnOff =
          trimmed.slice(-SMOKING_OFF_FRAMES).length === SMOKING_OFF_FRAMES &&
          trimmed.slice(-SMOKING_OFF_FRAMES).every(
            (h) => h.label !== "smoking" || h.prob < SMOKING_MIN_PROB,
          );

        if (shouldTurnOn)  { smokingActiveRef.current = true;  setSmokingActive(true);  }
        if (shouldTurnOff) { smokingActiveRef.current = false; setSmokingActive(false); }

        smokingDetectionRef.current = {
          active: smokingActiveRef.current,
          prob,
          bbox: null,
        };
        return trimmed;
      });
    });

    // ── phone_result (YOLO boxes) ──
    sock.on("phone_result", (data) => {
      wsPendingRef.current = false;

      const boxesArr = Array.isArray(data?.boxes) ? data.boxes : [];
      const bestBox  = boxesArr
        .filter((b) => b && (b.prob || 0) >= PHONE_YOLO_MIN_PROB)
        .sort((a, b) => (b.prob || 0) - (a.prob || 0))[0] || null;

      let yoloBox = null;
      if (bestBox) {
        const { x: cx, y: cy, w: bw, h: bh } = bestBox;
        yoloBox = {
          x1: Math.max(0, cx - bw / 2), y1: Math.max(0, cy - bh / 2),
          x2: Math.min(1, cx + bw / 2), y2: Math.min(1, cy + bh / 2),
        };
      }

      const rawProb = bestBox?.prob || 0;
      const candW   = yoloBox ? yoloBox.x2 - yoloBox.x1 : 0;
      const candH   = yoloBox ? yoloBox.y2 - yoloBox.y1 : 0;
      const sizeOk  = yoloBox && candW >= PHONE_BOX_MIN_SIZE && candH >= PHONE_BOX_MIN_SIZE
                             && candW <= PHONE_BOX_MAX_SIZE && candH <= PHONE_BOX_MAX_SIZE;

      let motionOk = true;
      if (phoneLastBoxRef.current && yoloBox) {
        const lastCx = (phoneLastBoxRef.current.x1 + phoneLastBoxRef.current.x2) / 2;
        const lastCy = (phoneLastBoxRef.current.y1 + phoneLastBoxRef.current.y2) / 2;
        const candCx = (yoloBox.x1 + yoloBox.x2) / 2;
        const candCy = (yoloBox.y1 + yoloBox.y2) / 2;
        if (Math.abs(candCx - lastCx) > PHONE_MOTION_MAX_X || Math.abs(candCy - lastCy) > PHONE_MOTION_MAX_Y)
          motionOk = false;
      }

      const strongDetected = bestBox !== null && rawProb >= PHONE_YOLO_MIN_PROB && sizeOk && motionOk;
      if (strongDetected && yoloBox) phoneLastBoxRef.current = yoloBox;

      // Hysteresis
      if (strongDetected) {
        phoneOnStreakRef.current  += 1;
        phoneOffStreakRef.current  = 0;
      } else {
        phoneOffStreakRef.current += 1;
        phoneOnStreakRef.current   = 0;
      }

      if (!phoneActiveFilteredRef.current) {
        if (phoneOnStreakRef.current >= PHONE_STABLE_FRAMES) {
          phoneActiveFilteredRef.current = true;
          setPhoneActive(true);
        }
      } else {
        if (phoneOffStreakRef.current >= PHONE_OFF_FRAMES) {
          phoneActiveFilteredRef.current = false;
          setPhoneActive(false);
        }
      }

      const filteredActive = phoneActiveFilteredRef.current;
      phoneDetectionRef.current = {
        active: filteredActive,
        prob:   rawProb,
        bbox:   filteredActive ? phoneLastBoxRef.current || yoloBox : null,
      };

      setPhoneHistory((prev) =>
        prev.concat([{ label: strongDetected ? "phone" : "no_phone", prob: rawProb }])
          .slice(-PHONE_HISTORY_LEN)
      );
    });

    return () => { sock.disconnect(); };
  }, []); // 1 lần duy nhất

  // ── Phone frame send loop — RAF ~15fps ──────────────────────────
  useEffect(() => {
    if (status !== "active") return;
    let rafId;
    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = Date.now();
      if (
        now - (wsLastSentRef.current || 0) < 1000 / PHONE_WS_FPS ||
        wsPendingRef.current ||
        !wsReadyRef.current ||
        !socketRef.current
      ) return;

      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) return;
      const c = document.createElement("canvas");
      c.width = 320; c.height = 240;
      c.getContext("2d").drawImage(vid, 0, 0, 320, 240);
      const img = c.toDataURL("image/jpeg", 0.6);
      wsPendingRef.current  = true;
      wsLastSentRef.current = now;
      socketRef.current.emit("phone_frame", { image: img, driver_id: driverId });
    }
    requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [status]);

  // ── Smoking frame send loop — RAF ~4fps ─────────────────────────
  useEffect(() => {
    if (status !== "active" || !SMOKING_ENABLED) return;
    let rafId;
    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = Date.now();
      if (
        now - (wsSmokLastSentRef.current || 0) < 1000 / SMOKING_WS_FPS ||
        wsSmokePendingRef.current ||
        !wsReadyRef.current ||
        !socketRef.current
      ) return;

      const vid = videoRef.current;
      if (!vid || vid.readyState < 2) return;
      const c = document.createElement("canvas");
      c.width = vid.videoWidth || 640; c.height = vid.videoHeight || 480;
      c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height);
      const img = c.toDataURL("image/jpeg", 0.7);
      wsSmokePendingRef.current  = true;
      wsSmokLastSentRef.current  = now;
      socketRef.current.emit("smoking_frame", { image: img, driver_id: driverId });
    }
    requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [status]);
}
