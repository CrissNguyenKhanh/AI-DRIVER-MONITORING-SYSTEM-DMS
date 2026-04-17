import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const Khanhregister = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("welcome");
  const [showNav, setShowNav] = useState(false);
  const [glitch, setGlitch] = useState(false);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const particlesRef = useRef([]);

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    const init = () => {
      resize();
      particlesRef.current = Array.from({ length: 40 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.4,
        vy: -(Math.random() * 0.6 + 0.2),
        vx: (Math.random() - 0.5) * 0.2,
        opacity: Math.random() * 0.45 + 0.05,
        color: Math.random() > 0.65 ? "#ff2d78" : "#00dcff",
      }));
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -4) {
          p.y = canvas.height + 4;
          p.x = Math.random() * canvas.width;
        }
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    init();
    animate();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const triggerGlitch = (cb) => {
    setGlitch(true);
    setTimeout(() => {
      setGlitch(false);
      cb();
    }, 560);
  };

  const handleStart = () => {
    triggerGlitch(() => {
      setPhase("nav");
      setTimeout(() => setShowNav(true), 40);
    });
  };

  const handleRegister = () => {
    triggerGlitch(() => navigate("/test5"));
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap');

        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
          --c: #00dcff;
          --m: #ff2d78;
          --bg: #040810;
          --mid: #0a1020;
        }

        .kw-universe {
          min-height: 100vh;
          background: var(--bg);
          font-family: 'Space Mono', monospace;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        /* ── Background layers ── */
        .kw-grid {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,220,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,220,255,0.035) 1px, transparent 1px);
          background-size: 52px 52px;
          animation: kw-grid-drift 18s linear infinite;
          pointer-events: none;
        }
        @keyframes kw-grid-drift {
          0% { background-position: 0 0; }
          100% { background-position: 0 52px; }
        }

        .kw-vignette {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, var(--bg) 100%);
          pointer-events: none;
        }

        .kw-canvas-particles {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        /* ── Scanline ── */
        .kw-scan {
          position: fixed;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(0,220,255,0.6) 50%, transparent 100%);
          animation: kw-scan 5s linear infinite;
          opacity: 0.45;
          pointer-events: none;
          z-index: 999;
        }
        @keyframes kw-scan {
          0% { top: -1px; opacity: 0; }
          5% { opacity: 0.45; }
          95% { opacity: 0.35; }
          100% { top: 100vh; opacity: 0; }
        }

        /* ── Corners ── */
        .kw-corner {
          position: fixed;
          width: 28px; height: 28px;
          pointer-events: none;
          z-index: 100;
        }
        .kw-corner svg { width: 28px; height: 28px; }
        .kw-c-tl { top: 18px; left: 18px; }
        .kw-c-tr { top: 18px; right: 18px; transform: scaleX(-1); }
        .kw-c-bl { bottom: 18px; left: 18px; transform: scaleY(-1); }
        .kw-c-br { bottom: 18px; right: 18px; transform: scale(-1); }

        /* ── Status bar ── */
        .kw-status {
          position: fixed;
          bottom: 14px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(0,220,255,0.28);
          font-size: 9px;
          letter-spacing: 3px;
          text-transform: uppercase;
          white-space: nowrap;
          pointer-events: none;
          z-index: 100;
        }

        /* ── Content shell ── */
        .kw-content {
          position: relative;
          z-index: 10;
          text-align: center;
          padding: 2rem;
          width: 100%;
          max-width: 480px;
        }

        /* ── Glitch ── */
        .kw-glitch { animation: kw-glitch-anim 0.56s steps(2) forwards; }
        @keyframes kw-glitch-anim {
          0%   { filter: none; }
          20%  { filter: hue-rotate(80deg) saturate(4); transform: skewX(-4deg); opacity: 0.85; }
          40%  { filter: hue-rotate(-80deg); transform: skewX(4deg) scaleY(0.99); }
          60%  { filter: invert(0.2); transform: translateX(-3px); opacity: 0.7; }
          80%  { filter: hue-rotate(160deg); transform: none; opacity: 0.9; }
          100% { filter: none; transform: none; opacity: 0; }
        }

        /* ═══════════════════════════════
           WELCOME PHASE
        ═══════════════════════════════ */
        .kw-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(0,220,255,0.22);
          color: rgba(0,220,255,0.65);
          font-size: 9px;
          letter-spacing: 5px;
          padding: 6px 20px;
          margin-bottom: 48px;
          text-transform: uppercase;
        }
        .kw-badge-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--c);
          animation: kw-pulse 2s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes kw-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.65); }
        }

        .kw-main-title { font-family: 'Orbitron', monospace; line-height: 1; }
        .kw-t1 {
          display: block;
          font-size: clamp(3.2rem, 12vw, 5.5rem);
          font-weight: 900;
          color: #fff;
          letter-spacing: -2px;
          text-shadow: 0 0 60px rgba(0,220,255,0.2);
        }
        .kw-t2 {
          display: block;
          font-size: clamp(1.8rem, 7vw, 3rem);
          font-weight: 400;
          color: transparent;
          -webkit-text-stroke: 1px rgba(0,220,255,0.55);
          letter-spacing: 6px;
          margin: 4px 0;
        }
        .kw-t3 {
          display: block;
          font-size: clamp(0.6rem, 2.2vw, 0.85rem);
          font-weight: 400;
          color: var(--m);
          letter-spacing: 10px;
          margin-top: 14px;
          text-shadow: 0 0 30px rgba(255,45,120,0.35);
        }

        .kw-divider {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 32px 0;
          opacity: 0.28;
        }
        .kw-div-line {
          flex: 1; height: 1px;
          background: linear-gradient(90deg, transparent, var(--c));
        }
        .kw-div-line:last-child {
          background: linear-gradient(90deg, var(--c), transparent);
        }
        .kw-div-dot { font-size: 7px; color: var(--c); }

        .kw-subtitle {
          color: rgba(255,255,255,0.28);
          font-size: 10px;
          letter-spacing: 4px;
          text-transform: uppercase;
          margin-bottom: 48px;
        }
        .kw-cursor {
          display: inline-block;
          width: 7px; height: 1em;
          background: rgba(0,220,255,0.65);
          margin-left: 3px;
          vertical-align: middle;
          animation: kw-blink 1.1s step-end infinite;
        }
        @keyframes kw-blink { 50% { opacity: 0; } }

        .kw-start-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 16px 56px;
          font-family: 'Orbitron', monospace;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 5px;
          text-transform: uppercase;
          color: var(--bg);
          background: var(--c);
          border: none;
          cursor: pointer;
          clip-path: polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%);
          transition: background 0.25s, transform 0.15s;
          outline: none;
          overflow: hidden;
        }
        .kw-start-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0.18);
          transform: translateX(-110%) skewX(-20deg);
          transition: transform 0.5s;
        }
        .kw-start-btn:hover::before { transform: translateX(110%) skewX(-20deg); }
        .kw-start-btn:hover { background: #fff; transform: scale(1.04); }
        .kw-start-btn:active { transform: scale(0.97); }

        .kw-start-icon {
          width: 13px; height: 13px;
          border-top: 2px solid currentColor;
          border-right: 2px solid currentColor;
          transform: rotate(45deg);
          flex-shrink: 0;
          transition: transform 0.25s;
        }
        .kw-start-btn:hover .kw-start-icon { transform: rotate(45deg) translate(3px,-3px); }

        /* ═══════════════════════════════
           NAV PHASE
        ═══════════════════════════════ */
        .kw-nav {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .kw-nav.visible { opacity: 1; transform: translateY(0); }

        .kw-nav-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          color: rgba(0,220,255,0.45);
          font-size: 9px;
          letter-spacing: 6px;
          text-transform: uppercase;
          margin-bottom: 48px;
        }
        .kw-nav-line { flex: 1; max-width: 60px; height: 1px; background: rgba(0,220,255,0.25); }

        .kw-menu { display: flex; flex-direction: column; gap: 10px; margin-bottom: 36px; }

        .kw-item {
          position: relative;
          display: flex;
          align-items: center;
          padding: 16px 24px;
          border: 1px solid rgba(0,220,255,0.12);
          background: rgba(0,220,255,0.02);
          cursor: pointer;
          transition: all 0.26s;
          overflow: hidden;
          animation: kw-slide-in 0.44s cubic-bezier(0.16,1,0.3,1) both;
        }
        .kw-item:nth-child(1) { animation-delay: 0.08s; }
        .kw-item:nth-child(2) { animation-delay: 0.16s; }
        .kw-item:nth-child(3) { animation-delay: 0.24s; }

        @keyframes kw-slide-in {
          from { opacity: 0; transform: translateX(-26px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .kw-item::after {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 2px;
          background: var(--c);
          transform: scaleY(0);
          transform-origin: top;
          transition: transform 0.24s;
        }
        .kw-item:hover::after { transform: scaleY(1); }
        .kw-item:hover {
          background: rgba(0,220,255,0.07);
          border-color: rgba(0,220,255,0.35);
          transform: translateX(6px);
        }

        .kw-item-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(0,220,255,0.05) 50%, transparent 100%);
          transform: translateX(-100%);
          transition: none;
          pointer-events: none;
        }
        .kw-item:hover .kw-item-shimmer { transform: translateX(100%); transition: transform 0.55s; }

        .kw-item-num {
          font-size: 9px;
          color: rgba(0,220,255,0.28);
          letter-spacing: 2px;
          width: 26px;
          flex-shrink: 0;
          transition: color 0.24s;
        }
        .kw-item:hover .kw-item-num { color: rgba(0,220,255,0.65); }

        .kw-item-name {
          flex: 1;
          font-family: 'Orbitron', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 4px;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          transition: color 0.24s;
          text-align: left;
          margin-left: 18px;
        }
        .kw-item:hover .kw-item-name { color: rgba(255,255,255,0.9); }

        .kw-item-tag {
          font-size: 8px;
          letter-spacing: 2px;
          color: rgba(0,220,255,0.22);
          text-transform: uppercase;
          transition: color 0.24s;
        }
        .kw-item:hover .kw-item-tag { color: rgba(0,220,255,0.5); }

        .kw-item-arr {
          width: 18px; height: 14px;
          margin-left: 16px;
          flex-shrink: 0;
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.24s;
          position: relative;
        }
        .kw-item-arr::before {
          content: '';
          position: absolute;
          top: 50%; left: 0;
          width: 13px; height: 1.5px;
          background: var(--c);
          transform: translateY(-50%);
        }
        .kw-item-arr::after {
          content: '';
          position: absolute;
          top: 50%; right: 0;
          width: 6px; height: 6px;
          border-top: 1.5px solid var(--c);
          border-right: 1.5px solid var(--c);
          transform: translateY(-50%) rotate(45deg);
        }
        .kw-item:hover .kw-item-arr { opacity: 1; transform: translateX(0); }

        /* Highlighted item */
        .kw-item-hi { border-color: rgba(255,45,120,0.18); background: rgba(255,45,120,0.025); }
        .kw-item-hi::after { background: var(--m); }
        .kw-item-hi:hover { background: rgba(255,45,120,0.09); border-color: rgba(255,45,120,0.42); }
        .kw-item-hi .kw-item-num { color: rgba(255,45,120,0.3); }
        .kw-item-hi:hover .kw-item-num { color: rgba(255,45,120,0.7); }
        .kw-item-hi .kw-item-name { color: rgba(255,45,120,0.55); }
        .kw-item-hi:hover .kw-item-name { color: rgba(255,255,255,0.9); }
        .kw-item-hi .kw-item-tag { color: rgba(255,45,120,0.28); }
        .kw-item-hi:hover .kw-item-tag { color: rgba(255,45,120,0.6); }
        .kw-item-hi .kw-item-arr::before { background: var(--m); }
        .kw-item-hi .kw-item-arr::after { border-color: var(--m); }

        /* Register button */
        .kw-reg-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 18px 64px;
          font-family: 'Orbitron', monospace;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 5px;
          text-transform: uppercase;
          color: var(--m);
          background: transparent;
          border: 1px solid rgba(255,45,120,0.38);
          cursor: pointer;
          transition: color 0.32s, border-color 0.32s;
          overflow: hidden;
          outline: none;
          animation: kw-slide-in 0.44s 0.32s both;
        }
        .kw-reg-fill {
          position: absolute;
          inset: 0;
          background: var(--m);
          transform: translateY(101%);
          transition: transform 0.36s cubic-bezier(0.16,1,0.3,1);
        }
        .kw-reg-btn:hover .kw-reg-fill { transform: translateY(0); }
        .kw-reg-btn:hover { color: #fff; border-color: var(--m); }
        .kw-reg-btn:active { transform: scale(0.97); }
        .kw-reg-btn > * { position: relative; z-index: 1; }

        .kw-hint {
          margin-top: 28px;
          color: rgba(255,255,255,0.14);
          font-size: 9px;
          letter-spacing: 3px;
          text-transform: uppercase;
          animation: kw-slide-in 0.44s 0.4s both;
        }
        .kw-hint-dot { color: rgba(255,45,120,0.38); }
      `}</style>

      {/* Background layers */}
      <div className="kw-grid" />
      <div className="kw-vignette" />
      <canvas ref={canvasRef} className="kw-canvas-particles" />
      <div className="kw-scan" />

      {/* Corner brackets */}
      {[["kw-c-tl", "rgba(0,220,255,0.5)"], ["kw-c-tr", "rgba(0,220,255,0.5)"], ["kw-c-bl", "rgba(255,45,120,0.5)"], ["kw-c-br", "rgba(255,45,120,0.5)"]].map(([cls, stroke]) => (
        <div key={cls} className={`kw-corner ${cls}`}>
          <svg viewBox="0 0 28 28">
            <path d="M0 28 L0 0 L28 0" fill="none" stroke={stroke} strokeWidth="1.5" />
          </svg>
        </div>
      ))}

      <div className="kw-status">SYS_OK · K-WEB v2.0 · {new Date().getFullYear()}</div>

      {/* Main glitch wrapper */}
      <div className={glitch ? "kw-glitch" : ""} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", width: "100%" }}>

        {/* WELCOME */}
        {phase === "welcome" && (
          <div className="kw-content">
            <div className="kw-badge">
              <span className="kw-badge-dot" />
              Khanh&apos;s System Online
              <span className="kw-badge-dot" />
            </div>

            <h1 className="kw-main-title">
              <span className="kw-t1">Welcome</span>
              <span className="kw-t2">To</span>
              <span className="kw-t3">Khanh&apos;s Web</span>
            </h1>

            <div className="kw-divider">
              <div className="kw-div-line" />
              <span className="kw-div-dot">◆</span>
              <div className="kw-div-line" />
            </div>

            <p className="kw-subtitle">
              Initializing portal<span className="kw-cursor" />
            </p>

            <button className="kw-start-btn" onClick={handleStart}>
              <div className="kw-start-icon" />
              <span>Start</span>
            </button>
          </div>
        )}

        {/* NAV */}
        {phase === "nav" && (
          <div className={`kw-content kw-nav ${showNav ? "visible" : ""}`}>
            <div className="kw-nav-label">
              <div className="kw-nav-line" />
              Navigation Menu
              <div className="kw-nav-line" />
            </div>

            <div className="kw-menu">
              <div className="kw-item">
                <span className="kw-item-num">01</span>
                <div className="kw-item-shimmer" />
                <span className="kw-item-name">Dashboard</span>
                <span className="kw-item-tag">VIEW</span>
                <div className="kw-item-arr" />
              </div>
              <div className="kw-item">
                <span className="kw-item-num">02</span>
                <div className="kw-item-shimmer" />
                <span className="kw-item-name">Explorer</span>
                <span className="kw-item-tag">BROWSE</span>
                <div className="kw-item-arr" />
              </div>
              <div className="kw-item kw-item-hi" onClick={handleRegister} role="button" tabIndex={0}>
                <span className="kw-item-num">03</span>
                <div className="kw-item-shimmer" />
                <span className="kw-item-name">Register</span>
                <span className="kw-item-tag">→ ACTION</span>
                <div className="kw-item-arr" />
              </div>
            </div>

            <button className="kw-reg-btn" onClick={handleRegister}>
              <div className="kw-reg-fill" />
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polygon points="9,1 16,4.5 16,13.5 9,17 2,13.5 2,4.5" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="9,5 13,7 13,11 9,13 5,11 5,7" stroke="currentColor" strokeWidth="1" fill="currentColor" opacity="0.25" />
              </svg>
              <span>Register Now</span>
            </button>

            <p className="kw-hint">
              <span className="kw-hint-dot">◈</span> Bấm Register để tiếp tục <span className="kw-hint-dot">◈</span>
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default Khanhregister;