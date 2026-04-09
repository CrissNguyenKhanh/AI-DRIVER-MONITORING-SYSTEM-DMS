/**
 * PhoneAlertOverlay — full-screen cảnh báo dùng điện thoại.
 *
 * @param {Object}   props
 * @param {number}   props.phoneAlert   Số giây tài xế dùng điện thoại liên tục (>= PHONE_WARN_MS/1000)
 * @param {Function} props.onDismiss    Callback khi ấn nút "Bỏ qua cảnh báo"
 */
import React from "react";

const ALERT_BADGES = [
  { icon: "🔊", text: "ÂM THANH BẬT", bg: "rgba(255,140,0,0.18)", border: "rgba(255,160,0,0.6)", color: "#ffaa40", delay: "0s"   },
  { icon: "📳", text: "RUNG",          bg: "rgba(255,100,0,0.15)", border: "rgba(255,120,0,0.5)", color: "#ff8c40", delay: "0.4s" },
];

const CORNERS = [{ top: 0, left: 0 }, { top: 0, right: 0 }, { bottom: 0, left: 0 }, { bottom: 0, right: 0 }];

/**
 * Full-screen phone-use warning overlay.
 * Props:
 *   phoneAlert — số giây dùng điện thoại (number)
 *   onDismiss  — callback khi ấn nút "BỎ QUA"
 */
export default function PhoneAlertOverlay({ phoneAlert, onDismiss }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 19,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      animation: "phoneBg 0.6s ease-in-out infinite alternate",
    }}>
      {/* flashing border */}
      <div style={{
        position: "absolute", inset: 0, border: "5px solid #ff8c00",
        animation: "phoneAlarmBorder 0.45s ease-in-out infinite", pointerEvents: "none",
      }} />

      {/* corner flashes */}
      {CORNERS.map((pos, i) =>
        React.createElement("div", {
          key: i,
          style: {
            position: "absolute", width: 44, height: 44,
            background: "rgba(255,140,0,0.3)",
            animation: "cornerFlash 0.45s ease-in-out infinite",
            animationDelay: i * 0.1 + "s", pointerEvents: "none", ...pos,
          },
        })
      )}

      {/* badges */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, pointerEvents: "none" }}>
        {ALERT_BADGES.map(b => (
          <div key={b.text} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: b.bg, border: `1px solid ${b.border}`,
            borderRadius: 20, padding: "4px 14px",
            animation: "badgePulse 0.9s ease-in-out infinite", animationDelay: b.delay,
          }}>
            <span style={{ fontSize: 16 }}>{b.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: b.color, letterSpacing: "0.08em" }}>
              {b.text}
            </span>
          </div>
        ))}
      </div>

      {/* icon */}
      <div style={{
        fontSize: 72, marginBottom: 12,
        animation: "iconBounce 0.7s ease-in-out infinite",
        filter: "drop-shadow(0 0 28px rgba(255,140,0,0.95))", pointerEvents: "none",
      }}>
        📱
      </div>

      {/* title */}
      <div style={{
        fontSize: 28, fontWeight: 900, color: "#ff8c00", letterSpacing: "0.1em",
        textShadow: "0 0 24px rgba(255,140,0,0.95)",
        animation: "textFlash 0.5s ease-in-out infinite", marginBottom: 6, pointerEvents: "none",
      }}>
        ⚠ CẢNH BÁO DÙNG ĐIỆN THOẠI
      </div>

      <div style={{
        fontSize: 14, color: "#ffcc00", fontWeight: 600, letterSpacing: "0.06em",
        marginBottom: 22, pointerEvents: "none",
      }}>
        Tài xế đang sử dụng điện thoại — Tập trung vào lái xe!
      </div>

      {/* timer */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, pointerEvents: "none" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,140,0,0.6)",
          borderRadius: 8, padding: "6px 24px",
        }}>
          <span style={{ fontSize: 9, color: "#ffaa40", letterSpacing: "0.14em", marginBottom: 2 }}>
            THỜI GIAN DÙNG PHONE
          </span>
          <span style={{ fontSize: 34, fontFamily: "monospace", fontWeight: 700, color: "#ff8c00", lineHeight: 1 }}>
            {phoneAlert.toFixed(1)}
            <span style={{ fontSize: 16, color: "#ffaa40" }}>s</span>
          </span>
        </div>
      </div>

      {/* danger progress bar */}
      <div style={{ width: "55%", marginBottom: 22, pointerEvents: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "#ffaa40" }}>3s</span>
          <span style={{ fontSize: 9, color: "#ff8c00", fontWeight: 700 }}>MỨC ĐỘ NGUY HIỂM</span>
          <span style={{ fontSize: 9, color: "#ffaa40" }}>{Math.min(phoneAlert, 30).toFixed(0)}s</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: Math.min(100, ((phoneAlert - 3) / 27) * 100) + "%",
            background: "linear-gradient(90deg,#ff8c00,#ff4500)",
            borderRadius: 4, transition: "width 0.25s linear",
          }} />
        </div>
      </div>

      <button onClick={onDismiss} style={{
        padding: "8px 28px", background: "rgba(255,255,255,0.1)",
        border: "2px solid rgba(255,255,255,0.4)", borderRadius: 6,
        color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", cursor: "pointer",
      }}>
        ✕ BỎ QUA CẢNH BÁO
      </button>
    </div>
  );
}
