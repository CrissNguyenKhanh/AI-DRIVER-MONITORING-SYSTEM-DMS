import React from "react";

/**
 * Màn hình full-screen khi chủ xe bấm **Reject** trên Telegram.
 * Gắn vào DMS / thucmuctest khi status === "locked" và lockCause === "owner_reject".
 */
export default function TelegramOwnerRejectOverlay({
  driverId = "",
  detail = "",
  /** Thời điểm (optional) hiển thị dưới tiêu đề */
  timestamp,
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        background:
          "radial-gradient(ellipse at 50% 20%, rgba(120,0,30,0.45) 0%, rgba(0,0,0,0.92) 55%, #000 100%)",
        border: "3px solid rgba(255,60,80,0.55)",
        boxShadow: "inset 0 0 80px rgba(255,0,40,0.15)",
      }}
    >
      <div
        style={{
          fontSize: 56,
          lineHeight: 1,
          marginBottom: 12,
          filter: "drop-shadow(0 0 20px rgba(255,50,50,0.6))",
        }}
        aria-hidden
      >
        ⛔
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#ff6b7a",
          letterSpacing: "0.35em",
          fontWeight: 800,
          marginBottom: 8,
        }}
      >
        TELEGRAM · OWNER REJECTED
      </div>

      <div
        style={{
          fontSize: 18,
          color: "#fff",
          fontWeight: 900,
          letterSpacing: "0.06em",
          textShadow: "0 0 24px rgba(255,40,60,0.5)",
          marginBottom: 10,
          maxWidth: 420,
          lineHeight: 1.35,
        }}
      >
        CHỦ XE ĐÃ TỪ CHỐI TRÊN TELEGRAM
      </div>

      <div
        style={{
          fontSize: 13,
          color: "#ffc9cf",
          maxWidth: 440,
          lineHeight: 1.65,
          marginBottom: 16,
        }}
      >
        Xe đang <b>tắt máy / khóa điều khiển</b> vì người lái hiện tại{" "}
        <b>không được chính chủ chấp nhận</b> qua ứng dụng Telegram.
      </div>

      <div
        style={{
          background: "rgba(40,0,10,0.75)",
          border: "1px solid rgba(255,80,100,0.45)",
          borderRadius: 10,
          padding: "14px 22px",
          marginBottom: 12,
          minWidth: 260,
        }}
      >
        <div style={{ fontSize: 10, color: "#ff8899", letterSpacing: "0.12em", marginBottom: 6 }}>
          XE (DRIVER ID)
        </div>
        <div
          style={{
            fontSize: 15,
            fontFamily: "ui-monospace, Consolas, monospace",
            color: "#fff",
            fontWeight: 700,
            wordBreak: "break-all",
          }}
        >
          {driverId || "—"}
        </div>
      </div>

      {timestamp && (
        <div style={{ fontSize: 10, color: "#8a5a62", marginBottom: 8 }}>{timestamp}</div>
      )}

      {detail ? (
        <div
          style={{
            fontSize: 11,
            color: "#ff9eaa",
            maxWidth: 400,
            lineHeight: 1.5,
            opacity: 0.95,
          }}
        >
          {detail}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 22,
          fontSize: 9,
          color: "#5c3d44",
          letterSpacing: "0.08em",
          maxWidth: 360,
        }}
      >
        Chỉ chủ xe (Telegram) mới có thể cho phép tiếp tục bằng Accept trong lần kiểm tra sau.
      </div>
    </div>
  );
}
