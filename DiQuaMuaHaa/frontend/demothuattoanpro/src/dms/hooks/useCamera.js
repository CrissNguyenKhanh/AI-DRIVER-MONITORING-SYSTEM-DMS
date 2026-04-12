/**
 * @fileoverview useCamera — quản lý vòng đời webcam.
 *
 * Trách nhiệm:
 *  - Gọi getUserMedia và gán stream vào videoRef
 *  - Khi stop: huỷ stream, reset tất cả detection refs về trạng thái ban đầu
 *  - Dừng alarm nếu đang kêu
 *
 * @returns {{ startWebcam: Function, stopWebcam: Function }}
 */
import { useCallback } from "react";
import { getWebcamSupportErrorMessage } from "../../utils/cameraContext";

/**
 * useCamera — quản lý vòng đời webcam.
 *
 * @param {Object} refs   - { videoRef, streamRef, landmarksRef, poseRef,
 *                           phoneDetectionRef, phoneActiveFilteredRef, phoneOnStreakRef,
 *                           phoneOffStreakRef, phoneLastBoxRef, smokingDetectionRef,
 *                           wsPendingRef, wsSmokePendingRef, phoneSinceRef, phoneSecRef,
 *                           smokingActiveRef, smokingSinceRef, smokingSecRef,
 *                           eyesClosedSinceRef, eyesClosedSecRef }
 * @param {Object} setters - { setStatus, setErrorMsg, setPhoneActive, setPhoneAlert,
 *                             setSmokingActive, setSmokingAlert, setIdentityOwner,
 *                             setIdentitySimilarity, setIdentityError, setIdentitySamples,
 *                             setIdentityLockCause, setIdentityRejectLockedAt, setDrowsyAlert }
 * @param {Function} stopAlarm
 */
export function useCamera(refs, setters, stopAlarm) {
  const {
    videoRef, streamRef, landmarksRef, poseRef,
    phoneDetectionRef, phoneActiveFilteredRef, phoneOnStreakRef,
    phoneOffStreakRef, phoneLastBoxRef, smokingDetectionRef,
    wsPendingRef, wsSmokePendingRef, phoneSinceRef, phoneSecRef,
    smokingActiveRef, smokingSinceRef, smokingSecRef,
    eyesClosedSinceRef, eyesClosedSecRef,
  } = refs;

  const {
    setStatus, setErrorMsg, setPhoneActive, setPhoneAlert,
    setSmokingActive, setSmokingAlert, setIdentityOwner,
    setIdentitySimilarity, setIdentityError, setIdentitySamples,
    setIdentityLockCause, setIdentityRejectLockedAt, setDrowsyAlert,
  } = setters;

  const startWebcam = useCallback(async () => {
    const supportErr = getWebcamSupportErrorMessage();
    if (supportErr) {
      setErrorMsg(supportErr);
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("auth");
    } catch (err) {
      setErrorMsg(err.message || "Cannot access webcam");
      setStatus("error");
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;

    // Reset tất cả refs liên quan
    landmarksRef.current = [];
    poseRef.current = { yaw: 0, pitch: 0, roll: 0 };
    phoneDetectionRef.current = { active: false, prob: 0, bbox: null };
    phoneActiveFilteredRef.current = false;
    phoneOnStreakRef.current = 0;
    phoneOffStreakRef.current = 0;
    phoneLastBoxRef.current = null;
    smokingDetectionRef.current = { active: false, prob: 0, bbox: null };
    wsPendingRef.current = false;
    wsSmokePendingRef.current = false;
    phoneSinceRef.current = null;
    phoneSecRef.current = 0;
    smokingActiveRef.current = false;
    smokingSinceRef.current = null;
    smokingSecRef.current = 0;
    eyesClosedSinceRef.current = null;
    eyesClosedSecRef.current = 0;

    stopAlarm();

    // Reset state
    setStatus("idle");
    setDrowsyAlert(null);
    setPhoneActive(false);
    setPhoneAlert(null);
    setSmokingActive(false);
    setSmokingAlert(null);
    setIdentityOwner(null);
    setIdentitySimilarity(null);
    setIdentityError("");
    setIdentitySamples(0);
    setIdentityLockCause(null);
    setIdentityRejectLockedAt("");
  }, [stopAlarm]);

  return { startWebcam, stopWebcam };
}
