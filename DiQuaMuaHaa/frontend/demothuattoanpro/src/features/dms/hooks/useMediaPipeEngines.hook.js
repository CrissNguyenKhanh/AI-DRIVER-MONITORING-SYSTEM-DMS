import { useEffect } from "react";

function useMediaPipeEngines({
  status,
  videoRef,
  faceMeshRef,
  handsRef,
  handLandmarksRef,
  poseRef,
  landmarksRef,
  eyeDataRef,
  earHistoryRef,
  blinkStateRef,
  blinkTimesRef,
  blinkDurRef,
  eyesClosedSinceRef,
  eyesClosedSecRef,
  L_EYE,
  R_EYE,
  computeEAR,
  computePupilRadius,
  estimateHeadPose,
  EAR_BLINK_THRESH,
  EAR_HISTORY,
  setFrameCount,
}) {
  useEffect(() => {
    function loadScript(src) {
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
    }
    async function init() {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
        const FM = window.FaceMesh;
        if (!FM) return;
        const fm = new FM({
          locateFile: (f) => "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + f,
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
          const leOX = (lm[L_EYE.outer].x + lm[L_EYE.inner].x) / 2;
          const leOY = (lm[L_EYE.outer].y + lm[L_EYE.inner].y) / 2;
          const eyeSpan = Math.abs(lm[L_EYE.outer].x - lm[L_EYE.inner].x) + 0.001;
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
          if (!isBlink && blinkStateRef.current.left && blinkDurRef.current.start)
            blinkDurRef.current.dur = (now - blinkDurRef.current.start) / 1000;
          blinkStateRef.current = { left: isBlinkL, right: isBlinkR };
          blinkTimesRef.current = blinkTimesRef.current.filter((t) => now - t < 60000);
          if (isBlinkL && isBlinkR) {
            if (eyesClosedSinceRef.current === null) eyesClosedSinceRef.current = now;
            eyesClosedSecRef.current = (now - eyesClosedSinceRef.current) / 1000;
          } else {
            eyesClosedSinceRef.current = null;
            eyesClosedSecRef.current = 0;
          }
          eyeDataRef.current = {
            left: { ear: earL, blinking: isBlinkL, yaw: lGY, pitch: lGP, pupilR: prL },
            right: {
              ear: earR,
              blinking: isBlinkR,
              yaw: rGY,
              pitch: rGP,
              pupilR: prL * 0.98,
            },
          };
          earHistoryRef.current.left = earHistoryRef.current.left.slice(-(EAR_HISTORY - 1)).concat([earL]);
          earHistoryRef.current.right = earHistoryRef.current.right.slice(-(EAR_HISTORY - 1)).concat([earR]);
        });
        faceMeshRef.current = fm;
      } catch (e) {
        console.warn("MediaPipe FaceMesh init error", e);
      }
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
        const H = window.Hands;
        if (!H) return;
        const hands = new H({
          locateFile: (f) => "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + f,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 0,
          selfieMode: false,
          minDetectionConfidence: 0.35,
          minTrackingConfidence: 0.35,
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
    }
    init();
  }, []);

  useEffect(() => {
    if (status !== "active") return;
    let running = true;
    let last = 0;
    async function loop(now) {
      if (!running) return;
      if (now - last >= 33) {
        last = now;
        const fm = faceMeshRef.current;
        const hs = handsRef.current;
        const vid = videoRef.current;
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
  }, [setFrameCount, status, videoRef, faceMeshRef, handsRef]);
}

export default useMediaPipeEngines;
