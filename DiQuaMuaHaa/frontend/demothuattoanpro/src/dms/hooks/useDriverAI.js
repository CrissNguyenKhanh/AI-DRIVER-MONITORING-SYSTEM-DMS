/**
 * @fileoverview useDriverAI — xử lý AI frame-by-frame với MediaPipe FaceMesh.
 *
 * Trách nhiệm:
 *  - Load MediaPipe FaceMesh từ CDN (1 lần, persist qua mọi re-render)
 *  - RAF loop ~30fps: gửi frame video vào FaceMesh
 *  - Tính EAR (Eye Aspect Ratio), pupil radius, head pose, gaze direction
 *  - Detect blink và đo thời gian nhắm mắt liên tục (drowsy timer)
 *  - Ghi kết quả vào refs (KHÔNG setState) để overlays đọc ở 60fps
 *  - Cleanup: gọi fm.close() khi unmount để tránh memory leak
 *
 * Performance: dùng refs thay state để tránh re-render 30fps.
 */
import { useEffect } from "react";
import {
  L_EYE, R_EYE,
  computeEAR, computePupilRadius, estimateHeadPose,
} from "../utils/geometry";
import {
  EAR_BLINK_THRESH, EAR_HISTORY, FACE_MESH_INTERVAL_MS,
} from "../constants/dmsConfig";

const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";

/**
 * useDriverAI — khởi tạo MediaPipe FaceMesh và xử lý từng frame.
 *
 * Viết kết quả vào refs (không trigger re-render) để RAF overlays đọc ở 60fps.
 * State display (pose, eye data) được sync qua interval 250ms trong useDriverAlerts.
 *
 * @param {Object} refs - {
 *   faceMeshRef, landmarksRef, poseRef,
 *   eyeDataRef, earHistoryRef,
 *   blinkStateRef, blinkTimesRef, blinkDurRef,
 *   eyesClosedSinceRef, eyesClosedSecRef,
 *   videoRef,
 * }
 * @param {string} status - trạng thái app ("active" | "idle" | ...)
 */
export function useDriverAI(refs, status) {
  const {
    faceMeshRef, landmarksRef, poseRef,
    eyeDataRef, earHistoryRef,
    blinkStateRef, blinkTimesRef, blinkDurRef,
    eyesClosedSinceRef, eyesClosedSecRef,
    videoRef,
  } = refs;

  // ── Khởi tạo MediaPipe FaceMesh (chạy 1 lần) ──────────────────
  useEffect(() => {
    function loadScript(src) {
      return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement("script");
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    async function init() {
      try {
        await loadScript(MEDIAPIPE_CDN);
        const FM = window.FaceMesh;
        if (!FM) return;

        const fm = new FM({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
        });
        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // ── onResults: chạy mỗi khi MediaPipe xử lý xong 1 frame ──
        fm.onResults((results) => {
          if (!results.multiFaceLandmarks?.[0]) {
            landmarksRef.current = [];
            return;
          }
          const lm = results.multiFaceLandmarks[0];
          landmarksRef.current = lm;

          // Head pose
          poseRef.current = estimateHeadPose(lm);

          // EAR + pupil
          const earL = computeEAR(lm, L_EYE);
          const earR = computeEAR(lm, R_EYE);
          const prL  = computePupilRadius(lm, L_EYE.iris) * 100;

          // Gaze (eye direction)
          const eyeSpan = Math.abs(lm[L_EYE.outer].x - lm[L_EYE.inner].x) + 0.001;
          const leOX    = (lm[L_EYE.outer].x + lm[L_EYE.inner].x) / 2;
          const leOY    = (lm[L_EYE.outer].y + lm[L_EYE.inner].y) / 2;
          const lGY     = ((lm[L_EYE.iris[0]].x - leOX) / eyeSpan) * 2;
          const lGP     = ((lm[L_EYE.iris[0]].y - leOY) / eyeSpan) * 2;
          const reOX    = (lm[R_EYE.outer].x + lm[R_EYE.inner].x) / 2;
          const reOY    = (lm[R_EYE.outer].y + lm[R_EYE.inner].y) / 2;
          const rGY     = ((lm[R_EYE.iris[0]].x - reOX) / eyeSpan) * 2;
          const rGP     = ((lm[R_EYE.iris[0]].y - reOY) / eyeSpan) * 2;

          // Blink detection
          const now       = Date.now();
          const isBlinkL  = earL < EAR_BLINK_THRESH;
          const isBlinkR  = earR < EAR_BLINK_THRESH;
          const isBlink   = isBlinkL && isBlinkR;

          if (isBlink && !blinkStateRef.current.left) {
            blinkTimesRef.current.push(now);
            blinkDurRef.current.start = now;
          }
          if (!isBlink && blinkStateRef.current.left && blinkDurRef.current.start) {
            blinkDurRef.current.dur = (now - blinkDurRef.current.start) / 1000;
          }
          blinkStateRef.current  = { left: isBlinkL, right: isBlinkR };
          blinkTimesRef.current  = blinkTimesRef.current.filter((t) => now - t < 60000);

          // Eyes-closed duration (cho drowsy timer)
          if (isBlinkL && isBlinkR) {
            if (eyesClosedSinceRef.current === null) eyesClosedSinceRef.current = now;
            eyesClosedSecRef.current = (now - eyesClosedSinceRef.current) / 1000;
          } else {
            eyesClosedSinceRef.current = null;
            eyesClosedSecRef.current   = 0;
          }

          // Ghi vào eyeDataRef để overlays đọc
          eyeDataRef.current = {
            left:  { ear: earL, blinking: isBlinkL, yaw: lGY, pitch: lGP, pupilR: prL },
            right: { ear: earR, blinking: isBlinkR, yaw: rGY, pitch: rGP, pupilR: prL * 0.98 },
          };

          // EAR history cho WaveformCanvas
          earHistoryRef.current.left  = earHistoryRef.current.left.slice(-(EAR_HISTORY - 1)).concat([earL]);
          earHistoryRef.current.right = earHistoryRef.current.right.slice(-(EAR_HISTORY - 1)).concat([earR]);
        });

        faceMeshRef.current = fm;
      } catch (e) {
        console.warn("[useDriverAI] MediaPipe init error:", e);
      }
    }

    init();

    // Cleanup: đóng FaceMesh khi unmount để tránh memory leak
    return () => {
      if (faceMeshRef.current?.close) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
    };
  }, []); // chạy 1 lần duy nhất

  // ── RAF loop: gửi frame vào FaceMesh ~30fps ────────────────────
  useEffect(() => {
    if (status !== "active") return;
    let running = true;
    let last = 0;

    async function loop(now) {
      if (!running) return;
      if (now - last >= FACE_MESH_INTERVAL_MS) {
        last = now;
        const fm  = faceMeshRef.current;
        const vid = videoRef.current;
        if (fm && vid && vid.readyState >= 2) {
          try { await fm.send({ image: vid }); } catch (_) {}
        }
      }
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [status]);
}
