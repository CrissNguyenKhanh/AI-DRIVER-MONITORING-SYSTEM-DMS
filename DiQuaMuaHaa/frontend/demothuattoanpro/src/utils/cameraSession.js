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
        video.srcObject = acquired;
        onStatus(activeStatus);
      } catch (error) {
        release(stream);
        stream = null;
        if (!disposed && wanted) {
          onError(error.message || "Không thể mở webcam");
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
