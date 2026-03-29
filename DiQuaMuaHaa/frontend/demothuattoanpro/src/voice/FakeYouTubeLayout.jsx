import React from "react";

export default function FakeYouTubeLayout({ open, onClose }) {
  if (!open) return null;

  const thumbs = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    title: `Video demo ${i + 1} — Driver Monitor Test`,
    meta: `${(i + 1) * 124}K views · ${i + 1} day ago`,
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="YouTube demo layout"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#0f0f0f",
        color: "#f1f1f1",
        fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          height: 56,
          background: "#212121",
          borderBottom: "1px solid #303030",
          flexShrink: 0,
        }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Go back"
          style={{
            width: 40,
            height: 40,
            border: "none",
            borderRadius: "50%",
            background: "transparent",
            color: "#fff",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ←
        </button>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 28,
              height: 20,
              background: "#f00",
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "#fff",
              fontWeight: 800,
            }}
          >
            ▶
          </span>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>
            YouTube
          </span>
          <span style={{ fontSize: 10, color: "#aaa", alignSelf: "flex-start", marginTop: 2 }}>
            DEMO
          </span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 560, margin: "0 auto", display: "flex" }}>
          <input
            type="search"
            placeholder="Search (demo)"
            readOnly
            style={{
              flex: 1,
              height: 38,
              border: "1px solid #303030",
              borderRight: "none",
              borderRadius: "40px 0 0 40px",
              padding: "0 16px",
              background: "#121212",
              color: "#e3e3e3",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            style={{
              width: 64,
              height: 38,
              border: "1px solid #303030",
              borderRadius: "0 40px 40px 0",
              background: "#222",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            🔍
          </button>
        </div>

        {/* Voice hint badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 20,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            fontSize: 12,
            color: "#aaa",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14 }}>🎙</span>
          <span>Say <b style={{ color: "#fff" }}>"back"</b> to return</span>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <aside
          style={{
            width: 72,
            flexShrink: 0,
            background: "#212121",
            borderRight: "1px solid #303030",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
            gap: 8,
          }}
        >
          {["🏠", "🔥", "📺", "📚", "⬇️"].map((icon, i) => (
            <div
              key={i}
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                cursor: "default",
                background: i === 0 ? "#303030" : "transparent",
              }}
            >
              {icon}
            </div>
          ))}
        </aside>

        {/* Feed */}
        <main style={{ flex: 1, overflow: "auto", padding: "20px 24px 40px" }}>
          <div style={{ fontSize: 14, color: "#aaa", marginBottom: 16 }}>
            Recommended (mock) — mở bằng lệnh giọng: <b style={{ color: "#fff" }}>"youtube"</b>
            &nbsp;·&nbsp; đóng: <b style={{ color: "#fff" }}>"back"</b>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {thumbs.map((v) => (
              <article key={v.id}>
                <div
                  style={{
                    aspectRatio: "16 / 9",
                    background: "linear-gradient(135deg,#2a2a2a,#1a1a1a)",
                    borderRadius: 12,
                    marginBottom: 10,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      bottom: 8,
                      right: 8,
                      background: "rgba(0,0,0,0.8)",
                      color: "#fff",
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {`${String((v.id % 5) + 3).padStart(2, "0")}:${String(10 + v.id).padStart(2, "0")}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#555",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, marginBottom: 4, color: "#f1f1f1" }}>
                      {v.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>Demo Channel</div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>{v.meta}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}