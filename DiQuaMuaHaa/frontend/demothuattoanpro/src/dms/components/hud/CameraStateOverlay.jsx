import TelegramOwnerRejectOverlay from "../../../systeamdetectface/TelegramOwnerRejectOverlay";

/**
 * Renders full-video-area state screens for non-active statuses:
 * loading | error | auth | locked (owner_reject or other) | idle
 *
 * Props:
 *   status                   — "loading" | "error" | "auth" | "locked" | "idle"
 *   errorMsg                 — string (for "error" state)
 *   driverId                 — string
 *   identityError            — string
 *   identitySimilarity       — number | null
 *   identityLockCause        — string (for "locked" state)
 *   identityRejectLockedAt   — timestamp (for owner_reject)
 *   startWebcam              — callback
 */
export default function CameraStateOverlay({
  status,
  errorMsg,
  driverId,
  identityError,
  identitySimilarity,
  identityLockCause,
  identityRejectLockedAt,
  startWebcam,
}) {
  if (status === "loading") {
    return (
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 16,
      }}>
        <div style={{ fontSize: 11, color: "#3b9eff", letterSpacing: "0.2em", animation: "blink 1s infinite" }}>
          INITIALIZING CAMERA...
        </div>
        <div style={{ width: 200, height: 2, background: "rgba(60,150,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "#3b9eff", animation: "loadBar 1.5s infinite", width: "40%" }} />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 12,
      }}>
        <div style={{ fontSize: 13, color: "#ff4560", letterSpacing: "0.1em" }}>⚠ Camera Error</div>
        <div style={{ fontSize: 11, color: "#4a7a9a", maxWidth: 280, textAlign: "center", lineHeight: "1.6" }}>
          {errorMsg}
        </div>
        <button onClick={startWebcam} style={{
          padding: "6px 20px", background: "rgba(60,150,255,0.1)",
          border: "1px solid rgba(60,150,255,0.4)", color: "#3b9eff",
          fontSize: 11, cursor: "pointer", borderRadius: 4,
        }}>
          Retry
        </button>
      </div>
    );
  }

  if (status === "auth") {
    return (
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 14, zIndex: 30, padding: 20, textAlign: "center",
      }}>
        <div style={{ fontSize: 13, color: "#ffc940", letterSpacing: "0.15em", fontWeight: 800 }}>
          CAR AUTH REQUIRED
        </div>
        <div style={{ fontSize: 11, color: "#9bd3ff", maxWidth: 420, lineHeight: 1.6 }}>
          Đang xác thực chủ xe bằng khuôn mặt cho <b>{driverId}</b>.
          <br />
          Nếu không phải chủ xe, hệ thống sẽ khóa về trạng thái chờ.
        </div>
        {identityError && (
          <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 700 }}>{identityError}</div>
        )}
        <div style={{ fontSize: 10, color: "#7ab8d8" }}>
          {typeof identitySimilarity === "number"
            ? `MATCH: ${(identitySimilarity * 100).toFixed(2)}%`
            : "MATCH: --"}
        </div>
        <div style={{ width: 240, height: 2, background: "rgba(60,150,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "#3b9eff", animation: "loadBar 1.5s infinite", width: "40%" }} />
        </div>
      </div>
    );
  }

  if (status === "locked") {
    if (identityLockCause === "owner_reject") {
      return (
        <TelegramOwnerRejectOverlay
          driverId={driverId}
          detail={identityError}
          timestamp={identityRejectLockedAt}
        />
      );
    }
    const isTimeout = identityLockCause === "owner_timeout";
    return (
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.88)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 14, zIndex: 35, padding: 20, textAlign: "center",
      }}>
        <div style={{ fontSize: 13, color: "#ff4560", letterSpacing: "0.15em", fontWeight: 800 }}>
          {isTimeout ? "ENGINE OFF - CHỦ XE KHÔNG PHẢN HỒI" : "ENGINE OFF - UNAUTHORIZED DRIVER"}
        </div>
        <div style={{ fontSize: 11, color: "#ffd0d0", maxWidth: 460, lineHeight: 1.6 }}>
          {isTimeout ? (
            <>Hết thời gian chờ phản hồi trên Telegram.<br />Xe đang tắt máy / khóa điều khiển.</>
          ) : (
            <>Xe hiện đang tắt máy vì bạn không phải chính chủ.<br />Hệ thống đã gửi yêu cầu xác nhận qua Telegram của chủ xe.</>
          )}
        </div>
        {identityError && (
          <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 700 }}>{identityError}</div>
        )}
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div style={{
        position: "absolute", inset: 0, background: "#000",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 16,
      }}>
        <div style={{ fontSize: 40, opacity: 0.08 }}>📷</div>
        <div style={{ fontSize: 11, color: "#2a4a68", letterSpacing: "0.18em" }}>CAMERA STANDBY</div>
        <button onClick={startWebcam} style={{
          padding: "7px 24px", background: "rgba(60,150,255,0.08)",
          border: "1px solid rgba(60,150,255,0.3)", color: "#3b9eff",
          fontSize: 11, cursor: "pointer", borderRadius: 4,
        }}>
          Activate Camera
        </button>
      </div>
    );
  }

  return null;
}
