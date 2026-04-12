/**
 * DrowsyAlertOverlay — full-screen cảnh báo buồn ngủ.
 *
 * @param {Object}   props
 * @param {number}   props.drowsyAlert  Số giây tài xế nhắm mắt liên tục (>= EYES_CLOSED_WARN_MS/1000)
 * @param {Function} props.onDismiss    Callback khi ấn nút "Bỏ qua cảnh báo"
 */
import React from "react";

const ALERT_BADGES = [
  { icon: "🔊", text: "ÂM THANH BẬT", bg: "rgba(255,50,50,0.2)",   border: "rgba(255,80,80,0.6)",   color: "#ff8080", delay: "0s"    },
  { icon: "📳", text: "RUNG",          bg: "rgba(255,140,0,0.18)",  border: "rgba(255,160,0,0.5)",   color: "#ffaa40", delay: "0.45s" },
];

const CORNERS = [{ top: 0, left: 0 }, { top: 0, right: 0 }, { bottom: 0, left: 0 }, { bottom: 0, right: 0 }];

/**
 * Full-screen drowsy warning overlay.
 * Props:
 *   drowsyAlert  — số giây nhắm mắt (number)
 *   onDismiss    — callback khi ấn nút "BỎ QUA"
 */
export default function DrowsyAlertOverlay({ drowsyAlert, onDismiss }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)",
      animation: "drowsyBg 0.5s ease-in-out infinite alternate",
    }}>
      {/* flashing border */}
      <div style={{
        position: "absolute", inset: 0, border: "5px solid #ff1a1a",
        animation: "alarmBorder 0.4s ease-in-out infinite", pointerEvents: "none",
      }} />

      {/* corner flashes */}
      {CORNERS.map((pos, i) =>
        React.createElement("div", {
          key: i,
          style: {
            position: "absolute", width: 40, height: 40,
            background: "rgba(255,30,30,0.35)",
            animation: "cornerFlash 0.4s ease-in-out infinite",
            animationDelay: i * 0.1 + "s", pointerEvents: "none", ...pos,
          },
        })
      )}

      {/* badges */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, pointerEvents: "none" }}>
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
        filter: "drop-shadow(0 0 24px rgba(255,40,40,0.95))", pointerEvents: "none",
      }}>
        😴
      </div>

      {/* title */}
      <div style={{
        fontSize: 30, fontWeight: 900, color: "#ff1a1a", letterSpacing: "0.1em",
        textShadow: "0 0 24px rgba(255,20,20,0.95)",
        animation: "textFlash 0.5s ease-in-out infinite", marginBottom: 6, pointerEvents: "none",
      }}>
        ⚠ CẢNH BÁO BUỒN NGỦ
      </div>

      <div style={{
        fontSize: 14, color: "#ffcc00", fontWeight: 600, letterSpacing: "0.06em",
        marginBottom: 20, pointerEvents: "none",
      }}>
        Tài xế nhắm mắt quá lâu — Hãy dừng xe và nghỉ ngơi!
      </div>

      {/* timer */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, pointerEvents: "none" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,50,50,0.6)",
          borderRadius: 8, padding: "6px 20px",
        }}>
          <span style={{ fontSize: 9, color: "#ff8080", letterSpacing: "0.14em", marginBottom: 2 }}>
            THỜI GIAN NHẮM MẮT
          </span>
          <span style={{ fontSize: 34, fontFamily: "monospace", fontWeight: 700, color: "#ff3030", lineHeight: 1 }}>
            {drowsyAlert.toFixed(1)}
            <span style={{ fontSize: 16, color: "#ff6060" }}>s</span>
          </span>
        </div>
      </div>

      {/* danger progress bar */}
      <div style={{ width: "55%", marginBottom: 20, pointerEvents: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "#ff6060" }}>3s</span>
          <span style={{ fontSize: 9, color: "#ff2020", fontWeight: 700 }}>MỨC ĐỘ NGUY HIỂM</span>
          <span style={{ fontSize: 9, color: "#ff6060" }}>{Math.min(drowsyAlert, 10).toFixed(0)}s</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: Math.min(100, ((drowsyAlert - 3) / 7) * 100) + "%",
            background: "linear-gradient(90deg,#ff6600,#ff0000)",
            borderRadius: 4, transition: "width 0.25s linear",
          }} />
        </div>
      </div>

      <button onClick={onDismiss} style={{
        padding: "8px 28px", background: "rgba(255,255,255,0.12)",
        border: "2px solid rgba(255,255,255,0.4)", borderRadius: 6,
        color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", cursor: "pointer",
      }}>
        ✕ BỎ QUA CẢNH BÁO
      </button>
    </div>
  );
}
