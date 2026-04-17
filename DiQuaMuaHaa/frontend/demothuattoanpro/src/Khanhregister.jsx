import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Khanhregister = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("welcome"); // welcome | nav
  const [showNav, setShowNav] = useState(false);
  const [particles, setParticles] = useState([]);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const pts = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 20 + 10,
      delay: Math.random() * 5,
      opacity: Math.random() * 0.5 + 0.1,
    }));
    setParticles(pts);
  }, []);

  const handleStart = () => {
    setGlitch(true);
    setTimeout(() => {
      setGlitch(false);
      setPhase("nav");
      setTimeout(() => setShowNav(true), 50);
    }, 600);
  };

  const handleRegister = () => {
    setGlitch(true);
    setTimeout(() => navigate("/test5"), 500);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
          --cyan: #00f5ff;
          --magenta: #ff006e;
          --gold: #ffd700;
          --dark: #020408;
          --mid: #0a0f1a;
          --glow-cyan: 0 0 20px #00f5ff88, 0 0 60px #00f5ff33;
          --glow-magenta: 0 0 20px #ff006e88, 0 0 60px #ff006e33;
        }

        .universe {
          min-height: 100vh;
          background: var(--dark);
          font-family: 'Space Mono', monospace;
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Grid Background */
        .universe::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,245,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,245,255,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridMove 20s linear infinite;
          pointer-events: none;
        }

        @keyframes gridMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }

        /* Particles */
        .particle {
          position: fixed;
          border-radius: 50%;
          background: var(--cyan);
          pointer-events: none;
          animation: drift linear infinite;
        }

        @keyframes drift {
          0% { transform: translateY(100vh) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-20px) translateX(30px); opacity: 0; }
        }

        /* Scanline */
        .scanline {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--cyan), transparent);
          animation: scan 4s linear infinite;
          opacity: 0.4;
          pointer-events: none;
          z-index: 999;
        }

        @keyframes scan {
          0% { top: -2px; }
          100% { top: 100vh; }
        }

        /* Corner decorations */
        .corner {
          position: fixed;
          width: 60px;
          height: 60px;
          pointer-events: none;
          z-index: 10;
        }
        .corner-tl { top: 20px; left: 20px; border-top: 2px solid var(--cyan); border-left: 2px solid var(--cyan); box-shadow: inset var(--glow-cyan); }
        .corner-tr { top: 20px; right: 20px; border-top: 2px solid var(--magenta); border-right: 2px solid var(--magenta); }
        .corner-bl { bottom: 20px; left: 20px; border-bottom: 2px solid var(--magenta); border-left: 2px solid var(--magenta); }
        .corner-br { bottom: 20px; right: 20px; border-bottom: 2px solid var(--cyan); border-right: 2px solid var(--cyan); }

        /* Status bar */
        .status-bar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(0,245,255,0.4);
          font-size: 10px;
          letter-spacing: 3px;
          text-transform: uppercase;
          pointer-events: none;
        }

        /* ===== WELCOME SCREEN ===== */
        .welcome-screen {
          text-align: center;
          position: relative;
          z-index: 10;
        }

        .badge {
          display: inline-block;
          border: 1px solid rgba(0,245,255,0.3);
          color: var(--cyan);
          font-size: 10px;
          letter-spacing: 5px;
          padding: 6px 20px;
          margin-bottom: 40px;
          text-transform: uppercase;
          position: relative;
          overflow: hidden;
        }

        .badge::before {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(0,245,255,0.15), transparent);
          animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
          100% { left: 100%; }
        }

        .main-title {
          font-family: 'Orbitron', monospace;
          font-size: clamp(3rem, 10vw, 8rem);
          font-weight: 900;
          line-height: 0.9;
          color: white;
          text-transform: uppercase;
          letter-spacing: -2px;
          position: relative;
          margin-bottom: 10px;
        }

        .main-title .line1 {
          display: block;
          color: white;
          text-shadow: var(--glow-cyan);
        }

        .main-title .line2 {
          display: block;
          -webkit-text-stroke: 1px var(--cyan);
          color: transparent;
          text-shadow: none;
          filter: drop-shadow(0 0 20px var(--cyan));
        }

        .main-title .line3 {
          display: block;
          color: var(--magenta);
          text-shadow: var(--glow-magenta);
          font-size: 0.5em;
          letter-spacing: 8px;
          font-weight: 400;
        }

        .subtitle {
          color: rgba(255,255,255,0.4);
          font-size: 12px;
          letter-spacing: 4px;
          text-transform: uppercase;
          margin: 30px 0 60px;
        }

        .start-btn {
          position: relative;
          display: inline-block;
          padding: 18px 70px;
          font-family: 'Orbitron', monospace;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: var(--dark);
          background: var(--cyan);
          border: none;
          cursor: pointer;
          clip-path: polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%);
          transition: all 0.3s;
          box-shadow: var(--glow-cyan);
        }

        .start-btn:hover {
          background: white;
          box-shadow: 0 0 40px #00f5ffcc, 0 0 80px #00f5ff55;
          transform: scale(1.05);
        }

        .start-btn:active {
          transform: scale(0.98);
        }

        .start-btn::after {
          content: '›';
          margin-left: 12px;
          font-size: 18px;
        }

        /* Glitch effect */
        .glitch {
          animation: glitchAnim 0.6s steps(2) forwards;
        }

        @keyframes glitchAnim {
          0% { filter: none; }
          20% { filter: hue-rotate(90deg) saturate(3); transform: skewX(-5deg) scale(1.02); opacity: 0.8; }
          40% { filter: hue-rotate(-90deg); transform: skewX(5deg); }
          60% { filter: invert(0.3); transform: translateX(-5px); opacity: 0.6; }
          80% { filter: hue-rotate(180deg); transform: scaleY(0.98); opacity: 0.9; }
          100% { filter: none; transform: none; opacity: 0; }
        }

        /* ===== NAV SCREEN ===== */
        .nav-screen {
          text-align: center;
          position: relative;
          z-index: 10;
          opacity: 0;
          transform: translateY(30px) scale(0.95);
          transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nav-screen.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .nav-label {
          color: var(--cyan);
          font-size: 10px;
          letter-spacing: 8px;
          text-transform: uppercase;
          margin-bottom: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .nav-label::before,
        .nav-label::after {
          content: '';
          width: 60px;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--cyan));
        }
        .nav-label::after {
          background: linear-gradient(90deg, var(--cyan), transparent);
        }

        .menu-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
          margin-bottom: 60px;
        }

        .menu-item {
          position: relative;
          width: 360px;
          padding: 20px 40px;
          background: rgba(0, 245, 255, 0.03);
          border: 1px solid rgba(0, 245, 255, 0.15);
          color: rgba(255,255,255,0.7);
          font-family: 'Orbitron', monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: space-between;
          overflow: hidden;
          animation: slideInItem 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }

        .menu-item:nth-child(1) { animation-delay: 0.1s; }
        .menu-item:nth-child(2) { animation-delay: 0.2s; }
        .menu-item:nth-child(3) { animation-delay: 0.3s; }

        @keyframes slideInItem {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .menu-item::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--cyan);
          transform: scaleY(0);
          transition: transform 0.3s;
        }

        .menu-item:hover::before { transform: scaleY(1); }

        .menu-item:hover {
          background: rgba(0, 245, 255, 0.08);
          border-color: var(--cyan);
          color: white;
          transform: translateX(8px);
          box-shadow: var(--glow-cyan);
        }

        .menu-item.highlight {
          border-color: var(--magenta);
          color: var(--magenta);
          background: rgba(255, 0, 110, 0.05);
        }

        .menu-item.highlight::before {
          background: var(--magenta);
        }

        .menu-item.highlight:hover {
          background: rgba(255, 0, 110, 0.12);
          color: white;
          transform: translateX(8px);
          box-shadow: var(--glow-magenta);
          border-color: var(--magenta);
        }

        .menu-item-num {
          font-size: 10px;
          color: rgba(0,245,255,0.4);
          letter-spacing: 2px;
        }

        .menu-item.highlight .menu-item-num {
          color: rgba(255,0,110,0.5);
        }

        .menu-item-arrow {
          opacity: 0;
          transform: translateX(-8px);
          transition: all 0.3s;
          font-size: 16px;
        }

        .menu-item:hover .menu-item-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        .bottom-info {
          color: rgba(255,255,255,0.2);
          font-size: 10px;
          letter-spacing: 3px;
          animation: fadeIn 1s 0.6s both;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Register CTA */
        .register-cta {
          margin-top: 10px;
        }

        .register-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 16px;
          padding: 22px 80px;
          font-family: 'Orbitron', monospace;
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: white;
          background: transparent;
          border: 2px solid var(--magenta);
          cursor: pointer;
          transition: all 0.4s;
          overflow: hidden;
          animation: slideInItem 0.5s 0.4s both;
        }

        .register-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--magenta);
          transform: translateX(-101%);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .register-btn:hover::before { transform: translateX(0); }
        .register-btn:hover { box-shadow: var(--glow-magenta); }

        .register-btn span {
          position: relative;
          z-index: 1;
        }

        .register-btn .icon {
          font-size: 20px;
          position: relative;
          z-index: 1;
          transition: transform 0.3s;
        }

        .register-btn:hover .icon {
          transform: rotate(15deg) scale(1.2);
        }

        /* Blinking cursor */
        .cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: var(--cyan);
          margin-left: 4px;
          vertical-align: middle;
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>

      {/* Ambient particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animationDuration: `${p.speed}s`,
            animationDelay: `${p.delay}s`,
            background: p.id % 3 === 0 ? "#ff006e" : "#00f5ff",
          }}
        />
      ))}

      {/* Decorations */}
      <div className="scanline" />
      <div className="corner corner-tl" />
      <div className="corner corner-tr" />
      <div className="corner corner-bl" />
      <div className="corner corner-br" />
      <div className="status-bar">SYS_OK // K-WEB v2.0 // {new Date().getFullYear()}</div>

      <div className={`universe ${glitch ? "glitch" : ""}`} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>

        {/* WELCOME PHASE */}
        {phase === "welcome" && (
          <div className="welcome-screen">
            <div className="badge">◈ Khanh's System Online ◈</div>

            <h1 className="main-title">
              <span className="line1">Welcome</span>
              <span className="line2">To</span>
              <span className="line3">Khanh's Web</span>
            </h1>

            <p className="subtitle">
              Initializing portal<span className="cursor" />
            </p>

            <button className="start-btn" onClick={handleStart}>
              Start
            </button>
          </div>
        )}

        {/* NAV PHASE */}
        {phase === "nav" && (
          <div className={`nav-screen ${showNav ? "visible" : ""}`}>
            <div className="nav-label">Navigation Menu</div>

            <div className="menu-container">
              <div className="menu-item">
                <span className="menu-item-num">01</span>
                <span>Dashboard</span>
                <span className="menu-item-arrow">→</span>
              </div>
              <div className="menu-item">
                <span className="menu-item-num">02</span>
                <span>Explorer</span>
                <span className="menu-item-arrow">→</span>
              </div>
              <div
                className="menu-item highlight"
                onClick={handleRegister}
                style={{ cursor: "pointer" }}
              >
                <span className="menu-item-num">03</span>
                <span>Register</span>
                <span className="menu-item-arrow">→</span>
              </div>
            </div>

            <div className="register-cta">
              <button className="register-btn" onClick={handleRegister}>
                <span className="icon">⬡</span>
                <span>Register Now</span>
              </button>
            </div>

            <div className="bottom-info" style={{ marginTop: 40 }}>
              ◈ Bấm Register để tiếp tục ◈
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Khanhregister;