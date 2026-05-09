import { useRef, useEffect, useState, useCallback } from "react";
import { getWebcamSupportErrorMessage } from "../utils/cameraContext";

/**
 * Hook quản lý webcam cho DMS
 * @param {Object} options - Cấu hình hook
 * @param {Function} [options.onError] - Callback khi có lỗi (nhận message string)
 * @param {Function} [options.onStatusChange] - Callback khi status thay đổi (nhận status string)
 * @returns {Object} { videoRef, streamRef, startCamera, stopCamera, isReady }
 */
export function useDmsCamera({ onError, onStatusChange } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  const startCamera = useCallback(async () => {
    const supportErr = getWebcamSupportErrorMessage();
    if (supportErr) {
      onError?.(supportErr);
      onStatusChange?.("error");
      return;
    }

    onStatusChange?.("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsReady(true);
      onStatusChange?.("auth");
    } catch (err) {
      onError?.(err.message || "Cannot access webcam");
      onStatusChange?.("error");
      setIsReady(false);
    }
  }, [onError, onStatusChange]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  // Auto-start camera on mount, cleanup on unmount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  return {
    videoRef,
    streamRef,
    startCamera,
    stopCamera,
    isReady,
  };
}

export default useDmsCamera;
