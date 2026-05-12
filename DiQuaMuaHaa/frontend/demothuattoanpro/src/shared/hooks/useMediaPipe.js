import { useRef, useEffect, useState, useCallback } from "react";
import {
  EAR_BLINK_THRESH,
  EAR_HISTORY,
  L_EYE,
  R_EYE,
} from "../constants/dmsConstants";
import {
  computeEAR,
  computePupilRadius,
  estimateHeadPose,
} from "../utils/dmsMath";

/**
 * Hook khởi tạo và chạy MediaPipe FaceMesh + Hands
 * @param {Object} options - Cấu hình hook
 * @param {React.RefObject<HTMLVideoElement>} options.videoRef - Video element ref từ useDmsCamera
 * @param {string} options.status - Trạng thái ứng dụng ("active", "idle", etc.)
 * @param {boolean} [options.enabled=true] - Bật/tắt MediaPipe processing
 * @returns {Object} Các refs và state cho DMS processing
 */
export function useMediaPipe({ videoRef, status, enabled = true }) {
  const faceMeshRef = useRef(null);
  const handsRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Data refs (không trigger re-render)
  const landmarksRef = useRef([]);
  const handLandmarksRef = useRef([]);
  const poseRef = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const eyeDataRef = useRef({
    left: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
    right: { ear: 0.3, blinking: false, yaw: 0, pitch: 0, pupilR: 0 },
  });
  const earHistoryRef = useRef({ left: [], right: [] });
  const blinkStateRef = useRef({ left: false, right: false });
  const blinkTimesRef = useRef([]);
  const blinkDurRef = useRef({ start: null, dur: 0 });
  const eyesClosedSinceRef = useRef(null);
  const eyesClosedSecRef = useRef(0);

  // Frame counter for UI updates (trigger re-render)
  const [frameCount, setFrameCount] = useState(0);

  // Display values for UI
  const [displayPose, setDisplayPose] = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [displayEye, setDisplayEye] = useState({
    blinkRate: 0,
    blinkDur: 0,
    pupilL: "33.5",
    lYaw: "-11.8",
    lPitch: "-21.6",
    rYaw: "-19.9",
    rPitch: "-25.1",
    lX: "61.4",
    lY: "3.9",
    lZ: "-2.7",
    rX: "63.2",
    rY: "9.7",
    rZ: "-3.3",
  });

  // Helper: Load script dynamically
  const loadScript = useCallback((src) => {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) {
        res();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }, []);

  // Effect 1: Initialize MediaPipe models (FaceMesh + Hands)
  useEffect(() => {
    if (!enabled) return;

    async function init() {
      try {
        // Load FaceMesh
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js",
        );
        const FM = window.FaceMesh;
        if (!FM) return;
        const fm = new FM({
          locateFile: (f) =>
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + f,
        });
        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        fm.onResults((results) => {
          if (!results.multiFaceLandmarks || !results.multiFaceLandmarks[0]) {
            landmarksRef.current = [];
            return;
          }
          const lm = results.multiFaceLandmarks[0];
          landmarksRef.current = lm;
          poseRef.current = estimateHeadPose(lm);

          const earL = computeEAR(lm, L_EYE);
          const earR = computeEAR(lm, R_EYE);
          const prL = computePupilRadius(lm, L_EYE.iris) * 100;

          // Calculate eye gaze
          const leOX = (lm[L_EYE.outer].x + lm[L_EYE.inner].x) / 2;
          const leOY = (lm[L_EYE.outer].y + lm[L_EYE.inner].y) / 2;
          const eyeSpan =
            Math.abs(lm[L_EYE.outer].x - lm[L_EYE.inner].x) + 0.001;
          const lGY = ((lm[L_EYE.iris[0]].x - leOX) / eyeSpan) * 2;
          const lGP = ((lm[L_EYE.iris[0]].y - leOY) / eyeSpan) * 2;

          const reOX = (lm[R_EYE.outer].x + lm[R_EYE.inner].x) / 2;
          const reOY = (lm[R_EYE.outer].y + lm[R_EYE.inner].y) / 2;
          const rGY = ((lm[R_EYE.iris[0]].x - reOX) / eyeSpan) * 2;
          const rGP = ((lm[R_EYE.iris[0]].y - reOY) / eyeSpan) * 2;

          const now = Date.now();
          const isBlinkL = earL < EAR_BLINK_THRESH;
          const isBlinkR = earR < EAR_BLINK_THRESH;
          const isBlink = isBlinkL && isBlinkR;

          if (isBlink && !blinkStateRef.current.left) {
            blinkTimesRef.current.push(now);
            blinkDurRef.current.start = now;
          }
          if (
            !isBlink &&
            blinkStateRef.current.left &&
            blinkDurRef.current.start
          ) {
            blinkDurRef.current.dur = (now - blinkDurRef.current.start) / 1000;
          }
          blinkStateRef.current = { left: isBlinkL, right: isBlinkR };
          blinkTimesRef.current = blinkTimesRef.current.filter(
            (t) => now - t < 60000,
          );

          if (isBlinkL && isBlinkR) {
            if (eyesClosedSinceRef.current === null)
              eyesClosedSinceRef.current = now;
            eyesClosedSecRef.current =
              (now - eyesClosedSinceRef.current) / 1000;
          } else {
            eyesClosedSinceRef.current = null;
            eyesClosedSecRef.current = 0;
          }

          eyeDataRef.current = {
            left: {
              ear: earL,
              blinking: isBlinkL,
              yaw: lGY,
              pitch: lGP,
              pupilR: prL,
            },
            right: {
              ear: earR,
              blinking: isBlinkR,
              yaw: rGY,
              pitch: rGP,
              pupilR: prL * 0.98,
            },
          };

          earHistoryRef.current.left = earHistoryRef.current.left
            .slice(-(EAR_HISTORY - 1))
            .concat([earL]);
          earHistoryRef.current.right = earHistoryRef.current.right
            .slice(-(EAR_HISTORY - 1))
            .concat([earR]);
        });
        faceMeshRef.current = fm;
      } catch (e) {
        console.warn("MediaPipe FaceMesh init error", e);
      }

      /*
      // Tạm tắt Hands do lỗi CDN
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
        );
        const H = window.Hands;
        if (!H) return;
        const hands = new H({
          locateFile: (f) =>
            "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + f,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          selfieMode: false,
          minDetectionConfidence: 0.75,
          minTrackingConfidence: 0.6,
        });
        hands.onResults((results) => {
          if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
            handLandmarksRef.current = [];
            return;
          }
          handLandmarksRef.current = results.multiHandLandmarks.map((raw) =>
            raw.map((p) => ({ x: p.x, y: p.y, z: p.z })),
          );
        });
        await hands.initialize();
        handsRef.current = hands;
      } catch (e) {
        console.warn("MediaPipe Hands init error", e);
      }
      */
      setIsLoaded(true);
    }

    init();
    return () => {
      const fm = faceMeshRef.current;
      const hs = handsRef.current;
      faceMeshRef.current = null;
      handsRef.current = null;
      if (fm?.close) Promise.resolve(fm.close()).catch(() => {});
      if (hs?.close) Promise.resolve(hs.close()).catch(() => {});
    };
  }, [enabled, loadScript]);

  // Effect 2: Processing Loop (RAF-based)
  useEffect(() => {
    if (!enabled || status !== "active") return;

    let running = true;
    let last = 0;

    async function loop(now) {
      if (!running) return;
      if (now - last >= 33) {
        last = now;
        const fm = faceMeshRef.current;
        const hs = handsRef.current;
        const vid = videoRef?.current;

        if (vid && vid.readyState >= 2) {
          if (fm) {
            try {
              await fm.send({ image: vid });
            } catch (_) {}
          }
          if (hs) {
            try {
              await hs.send({ image: vid });
            } catch (_) {}
          }
        }
        setFrameCount((f) => f + 1);
      }
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
    return () => {
      running = false;
    };
  }, [enabled, status, videoRef]);

  // Effect 3: Display Update Interval
  useEffect(() => {
    if (!enabled) return;

    const dispId = setInterval(() => {
      const p = poseRef.current;
      setDisplayPose({ yaw: p.yaw, pitch: p.pitch, roll: p.roll });

      const ed = eyeDataRef.current;
      const now = Date.now();
      setDisplayEye({
        blinkRate: blinkTimesRef.current.length,
        blinkDur: blinkDurRef.current.dur,
        pupilL: (ed.left.pupilR || 33.5).toFixed(1),
        lYaw: ((ed.left.yaw || 0) * 180).toFixed(1),
        lPitch: ((ed.left.pitch || 0) * 180).toFixed(1),
        rYaw: ((ed.right.yaw || 0) * 180).toFixed(1),
        rPitch: ((ed.right.pitch || 0) * 180).toFixed(1),
        lX: (ed.left.ear * 100).toFixed(1),
        lY: ((ed.left.yaw || 0) * 100).toFixed(1),
        lZ: ((ed.left.pitch || 0) * 100).toFixed(1),
        rX: (ed.right.ear * 100).toFixed(1),
        rY: ((ed.right.yaw || 0) * 100).toFixed(1),
        rZ: ((ed.right.pitch || 0) * 100).toFixed(1),
      });
    }, 200);

    return () => clearInterval(dispId);
  }, [enabled]);

  return {
    // Refs
    faceMeshRef,
    handsRef,
    landmarksRef,
    handLandmarksRef,
    poseRef,
    eyeDataRef,
    earHistoryRef,
    blinkStateRef,
    blinkTimesRef,
    blinkDurRef,
    eyesClosedSinceRef,
    eyesClosedSecRef,
    // State
    isLoaded,
    frameCount,
    displayPose,
    displayEye,
  };
}

export default useMediaPipe;
