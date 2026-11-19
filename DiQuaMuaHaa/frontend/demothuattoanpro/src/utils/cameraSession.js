export function cameraErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Quyền camera bị từ chối. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Không tìm thấy camera trên thiết bị này.";
    case "NotReadableError":
    case "TrackStartError":
      return "Camera đang được ứng dụng khác sử dụng hoặc không thể khởi động.";
    case "OverconstrainedError":
      return "Camera không hỗ trợ cấu hình video được yêu cầu.";
    case "AbortError":
      return "Trình duyệt đã hủy yêu cầu mở camera. Vui lòng thử lại.";
    default:
      return error?.message || "Không thể mở camera.";
  }
}

/** Owns one webcam request/stream; late permission results are always released. */
export function createCameraSession({
  getUserMedia,
  getVideo,
  checkSupport,
  onStatus,
  onError,
  constraints = {
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  },
  activeStatus = "active",
}) {
  let stream = null;
  let pending = null;
  let wanted = false;
  let disposed = false;

  const handleUnexpectedEnd = () => {
    if (disposed || !wanted || !stream) return;
    stream = null;
    wanted = false;
    const video = getVideo();
    if (video) video.srcObject = null;
    onError("Kết nối camera đã bị ngắt. Hãy kiểm tra thiết bị rồi thử lại.");
    onStatus("error");
  };

  const release = (value) => {
    value?.getTracks().forEach((track) => track.stop());
  };

  function stop() {
    wanted = false;
    release(stream);
    stream = null;
    const video = getVideo();
    if (video) video.srcObject = null;
    if (!disposed) onStatus("idle");
  }

  function start() {
    if (disposed || stream) return Promise.resolve();
    wanted = true;
    if (pending) return pending;

    const supportError = checkSupport();
    if (supportError) {
      onError(supportError);
      onStatus("error");
      return Promise.resolve();
    }

    onError("");
    onStatus("loading");
    pending = (async () => {
      try {
        const acquired = await getUserMedia(constraints);
        const video = getVideo();
        if (disposed || !wanted || !video) {
          release(acquired);
          return;
        }
        stream = acquired;
        acquired.getVideoTracks?.().forEach((track) => {
          track.addEventListener?.("ended", handleUnexpectedEnd, { once: true });
        });
        video.srcObject = acquired;
        onStatus(activeStatus);
      } catch (error) {
        release(stream);
        stream = null;
        if (!disposed && wanted) {
          onError(cameraErrorMessage(error));
          onStatus("error");
        }
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  function dispose() {
    disposed = true;
    stop();
  }

  return { start, stop, dispose };
}
