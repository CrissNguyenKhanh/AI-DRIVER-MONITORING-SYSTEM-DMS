import React, { useEffect, useMemo } from "react";

function toImageSrc(raw) {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("data:")) return t;
  return `data:image/jpeg;base64,${t}`;
}

/**
 * Popup ~5s sau khi xác thực chủ xe thành công: tên, ảnh đăng ký, ID, độ khớp, v.v.
 */
export default function DriverAuthenticatedWelcome({
  profile,
  durationMs = 5000,
  onDismiss,
}) {
  useEffect(() => {
    if (!profile) return undefined;
    const t = setTimeout(() => onDismiss?.(), durationMs);
    return () => clearTimeout(t);
  }, [profile, durationMs, onDismiss]);

  const imgSrc = useMemo(
    () => toImageSrc(profile?.profile_image_base64),
    [profile?.profile_image_base64],
  );

  if (!profile) return null;

  const name = profile.registered_name || profile.driver_id || "—";
  const did = profile.driver_id || "—";
  const sim =
    typeof profile.similarity === "number"
      ? `${(profile.similarity * 100).toFixed(2)}%`
      : null;
  const thr =
    typeof profile.threshold === "number"
      ? `${(profile.threshold * 100).toFixed(2)}%`
      : null;
  const samples =
    typeof profile.samples_used === "number" ? profile.samples_used : null;
  const sourceLabel =
    profile.source === "telegram"
      ? "Telegram — chủ xe chấp nhận từ xa"
      : "Khuôn mặt — khớp chính chủ";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-auth-welcome-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,8,20,0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        pointerEvents: "auto",
      }}
      onClick={() => onDismiss?.()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92vw)",
          maxHeight: "min(560px, 88vh)",
          overflow: "auto",
          borderRadius: 14,
          border: "1px solid rgba(0,229,120,0.45)",
          boxShadow:
            "0 0 0 1px rgba(0,229,120,0.12), 0 24px 48px rgba(0,0,0,0.55)",
          background:
            "linear-gradient(165deg, rgba(12,32,28,0.96) 0%, rgba(6,18,32,0.98) 100%)",
          padding: "22px 22px 18px",
        }}
      >
        <div
          id="driver-auth-welcome-title"
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            fontWeight: 800,
            color: "#00e578",
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          XÁC THỰC THÀNH CÔNG
        </div>
        <div
          style={{
            fontSize: 10,
            color: "rgba(120,200,255,0.75)",
            textAlign: "center",
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          {sourceLabel}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: "50%",
              overflow: "hidden",
              border: "3px solid rgba(0,229,120,0.5)",
              boxShadow: "0 0 24px rgba(0,229,120,0.25)",
              background: "rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="Registered driver"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
            ) : (
              <span style={{ fontSize: 42, opacity: 0.35 }}>👤</span>
            )}
          </div>

          <div style={{ textAlign: "center", width: "100%" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#e8f4ff",
                letterSpacing: "0.02em",
                lineHeight: 1.25,
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(150,190,230,0.85)",
                marginTop: 6,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              ID: {did}
            </div>
          </div>

          <div
            style={{
              width: "100%",
              borderTop: "1px solid rgba(60,150,255,0.2)",
              paddingTop: 14,
              display: "grid",
              gap: 10,
              fontSize: 11,
            }}
          >
            {profile.registered_at ? (
              <Row label="Đăng ký hồ sơ" value={profile.registered_at} />
            ) : null}
            {sim != null ? <Row label="Độ khớp (lần này)" value={sim} /> : null}
            {thr != null ? <Row label="Ngưỡng hệ thống" value={thr} /> : null}
            {samples != null ? (
              <Row label="Frame dùng để so khớp" value={String(samples)} />
            ) : null}
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 9,
              color: "rgba(120,160,200,0.55)",
              textAlign: "center",
            }}
          >
            Tự đóng sau {Math.round(durationMs / 1000)}s — chạm nền tối để đóng
            sớm
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
      }}
    >
      <span style={{ color: "rgba(140,180,220,0.75)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          color: "#b8dcff",
          textAlign: "right",
          fontWeight: 600,
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}
