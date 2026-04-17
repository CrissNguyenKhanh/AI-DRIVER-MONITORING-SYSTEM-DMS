import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const Khanhregister = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("welcome");
  const [showNav, setShowNav] = useState(false);
  const [glitch, setGlitch] = useState(false);

  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const particlesRef = useRef([]);

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

  const handleMiniContactSubmit = (e) => {
    e.preventDefault();

    if (!contactEmail.trim() || !contactMessage.trim()) {
      alert("Vui long nhap gmail va mo ta.");
      return;
    }

    const subject = "Contact to Khanh";
    const body = `Gmail: ${contactEmail}\n\nMo ta:\n${contactMessage}`;

    window.location.href = `mailto:quockhanhdz295@gmail.com?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;

    setContactEmail("");
    setContactMessage("");
  };

  return (
    <>
      <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap');

  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    --c: #00dcff;
    --c-soft: rgba(0, 220, 255, 0.14);
    --c-strong: rgba(0, 220, 255, 0.7);
    --m: #ff2d78;
    --m-soft: rgba(255, 45, 120, 0.14);
    --m-strong: rgba(255, 45, 120, 0.75);

    --bg: #040810;
    --bg-2: #08101d;
    --bg-3: #0c1628;
    --panel: rgba(10, 16, 32, 0.72);
    --panel-strong: rgba(10, 16, 32, 0.9);

    --text: #f5fbff;
    --text-soft: rgba(245, 251, 255, 0.72);
    --text-dim: rgba(245, 251, 255, 0.42);
    --text-faint: rgba(245, 251, 255, 0.22);

    --border: rgba(0, 220, 255, 0.16);
    --border-strong: rgba(0, 220, 255, 0.34);

    --shadow-cyan: 0 0 30px rgba(0, 220, 255, 0.12);
    --shadow-pink: 0 0 30px rgba(255, 45, 120, 0.12);
    --shadow-deep: 0 24px 60px rgba(0, 0, 0, 0.45);

    --radius-sm: 10px;
    --radius-md: 16px;
    --radius-lg: 24px;

    --ease: cubic-bezier(0.16, 1, 0.3, 1);
  }

  html, body {
    width: 100%;
    min-height: 100%;
    background: var(--bg);
    scroll-behavior: smooth;
  }

  body {
    font-family: 'Space Mono', monospace;
    color: var(--text);
  }

  .kw-universe,
  .kw-root {
    min-height: 100vh;
    background:
      radial-gradient(circle at 20% 20%, rgba(0,220,255,0.08), transparent 28%),
      radial-gradient(circle at 80% 18%, rgba(255,45,120,0.08), transparent 30%),
      radial-gradient(circle at 50% 80%, rgba(0,220,255,0.05), transparent 35%),
      linear-gradient(180deg, #03060d 0%, #07111f 48%, #040810 100%);
    position: relative;
    overflow: hidden;
  }

  .kw-grid {
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,220,255,0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,220,255,0.035) 1px, transparent 1px);
    background-size: 52px 52px;
    mask-image: radial-gradient(circle at center, black 55%, transparent 100%);
    animation: kw-grid-drift 20s linear infinite;
    pointer-events: none;
  }

  @keyframes kw-grid-drift {
    0% { background-position: 0 0; }
    100% { background-position: 0 52px; }
  }

  .kw-vignette {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 78% 72% at 50% 45%, transparent 35%, rgba(4,8,16,0.76) 75%, #040810 100%);
    pointer-events: none;
  }

  .kw-canvas-particles {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .kw-scan {
    position: fixed;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0,220,255,0.15) 20%,
      rgba(0,220,255,0.75) 50%,
      rgba(255,45,120,0.15) 80%,
      transparent 100%
    );
    box-shadow: 0 0 14px rgba(0,220,255,0.25);
    animation: kw-scan 5.8s linear infinite;
    opacity: 0.5;
    pointer-events: none;
    z-index: 999;
  }

  @keyframes kw-scan {
    0% { top: -1px; opacity: 0; }
    6% { opacity: 0.55; }
    94% { opacity: 0.38; }
    100% { top: 100vh; opacity: 0; }
  }

  .kw-corner {
    position: fixed;
    width: 30px;
    height: 30px;
    pointer-events: none;
    z-index: 100;
    filter: drop-shadow(0 0 12px rgba(0, 220, 255, 0.12));
  }

  .kw-corner svg {
    width: 100%;
    height: 100%;
  }

  .kw-c-tl { top: 18px; left: 18px; }
  .kw-c-tr { top: 18px; right: 18px; transform: scaleX(-1); }
  .kw-c-bl { bottom: 18px; left: 18px; transform: scaleY(-1); }
  .kw-c-br { bottom: 18px; right: 18px; transform: scale(-1); }

  .kw-status {
    position: fixed;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(0,220,255,0.32);
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    white-space: nowrap;
    pointer-events: none;
    z-index: 100;
    padding: 6px 14px;
    border: 1px solid rgba(0,220,255,0.08);
    background: rgba(3,8,18,0.45);
    backdrop-filter: blur(8px);
    border-radius: 999px;
  }

  .kw-content {
    position: relative;
    z-index: 10;
    text-align: center;
    padding: 2rem;
    width: 100%;
    max-width: 620px;
  }

  .kw-glitch {
    animation: kw-glitch-anim 0.56s steps(2) forwards;
  }

  @keyframes kw-glitch-anim {
    0%   { filter: none; }
    20%  { filter: hue-rotate(80deg) saturate(4); transform: skewX(-4deg); opacity: 0.85; }
    40%  { filter: hue-rotate(-80deg); transform: skewX(4deg) scaleY(0.99); }
    60%  { filter: invert(0.2); transform: translateX(-3px); opacity: 0.7; }
    80%  { filter: hue-rotate(160deg); transform: none; opacity: 0.9; }
    100% { filter: none; transform: none; opacity: 0; }
  }

  .kw-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(0,220,255,0.18);
    color: rgba(0,220,255,0.72);
    font-size: 9px;
    letter-spacing: 5px;
    padding: 8px 18px;
    margin-bottom: 36px;
    text-transform: uppercase;
    border-radius: 999px;
    background: rgba(0, 220, 255, 0.045);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02), var(--shadow-cyan);
    backdrop-filter: blur(8px);
  }

  .kw-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 12px rgba(0,220,255,0.7);
    animation: kw-pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes kw-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.7); }
  }

  .kw-main-title {
    font-family: 'Orbitron', monospace;
    line-height: 1;
    text-transform: uppercase;
  }

  .kw-t1 {
    display: block;
    font-size: clamp(3.1rem, 11vw, 5.8rem);
    font-weight: 900;
    letter-spacing: -2px;
    color: #fff;
    text-shadow:
      0 0 24px rgba(255,255,255,0.08),
      0 0 60px rgba(0,220,255,0.18);
  }

  .kw-t2 {
    display: block;
    font-size: clamp(1.6rem, 6vw, 2.8rem);
    font-weight: 700;
    color: transparent;
    -webkit-text-stroke: 1px rgba(0,220,255,0.68);
    letter-spacing: 8px;
    margin: 10px 0 4px;
  }

  .kw-t3 {
    display: block;
    font-size: clamp(0.66rem, 2vw, 0.9rem);
    font-weight: 700;
    color: var(--m);
    letter-spacing: 9px;
    margin-top: 18px;
    text-shadow: 0 0 26px rgba(255,45,120,0.28);
  }

  .kw-divider {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 30px auto;
    opacity: 0.4;
    max-width: 420px;
  }

  .kw-div-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--c));
  }

  .kw-div-line:last-child {
    background: linear-gradient(90deg, var(--c), transparent);
  }

  .kw-div-dot {
    font-size: 9px;
    color: var(--c);
    text-shadow: 0 0 12px rgba(0,220,255,0.35);
  }

  .kw-subtitle {
    color: rgba(255,255,255,0.44);
    font-size: 10px;
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-bottom: 38px;
  }

  .kw-cursor {
    display: inline-block;
    width: 7px;
    height: 1em;
    background: rgba(0,220,255,0.65);
    margin-left: 3px;
    vertical-align: middle;
    animation: kw-blink 1.1s step-end infinite;
  }

  @keyframes kw-blink {
    50% { opacity: 0; }
  }

  .kw-start-btn,
  .kw-reg-btn {
    isolation: isolate;
  }

  .kw-start-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 16px 40px;
    min-height: 56px;
    font-family: 'Orbitron', monospace;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #041018;
    background: linear-gradient(135deg, #00dcff 0%, #79efff 100%);
    border: none;
    cursor: pointer;
    clip-path: polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%);
    transition:
      transform 0.24s var(--ease),
      box-shadow 0.24s var(--ease),
      filter 0.24s var(--ease);
    outline: none;
    overflow: hidden;
    box-shadow:
      0 12px 30px rgba(0,220,255,0.24),
      inset 0 0 0 1px rgba(255,255,255,0.18);
  }

  .kw-start-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      120deg,
      transparent 0%,
      rgba(255,255,255,0.3) 45%,
      rgba(255,255,255,0.1) 55%,
      transparent 100%
    );
    transform: translateX(-120%) skewX(-18deg);
    transition: transform 0.7s var(--ease);
    z-index: 0;
  }

  .kw-start-btn:hover::before {
    transform: translateX(120%) skewX(-18deg);
  }

  .kw-start-btn:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      0 18px 38px rgba(0,220,255,0.28),
      0 0 24px rgba(0,220,255,0.18);
    filter: brightness(1.04);
  }

  .kw-start-btn:active {
    transform: translateY(0) scale(0.985);
  }

  .kw-start-btn > * {
    position: relative;
    z-index: 1;
  }

  .kw-start-icon {
    width: 13px;
    height: 13px;
    border-top: 2px solid currentColor;
    border-right: 2px solid currentColor;
    transform: rotate(45deg);
    flex-shrink: 0;
    transition: transform 0.25s var(--ease);
  }

  .kw-start-btn:hover .kw-start-icon {
    transform: rotate(45deg) translate(3px, -3px);
  }

  .kw-nav {
    opacity: 0;
    transform: translateY(22px);
    transition:
      opacity 0.7s var(--ease),
      transform 0.7s var(--ease);
  }

  .kw-nav.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .kw-nav-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: rgba(0,220,255,0.52);
    font-size: 9px;
    letter-spacing: 6px;
    text-transform: uppercase;
    margin-bottom: 28px;
  }

  .kw-nav-line {
    flex: 1;
    max-width: 70px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,220,255,0.35), transparent);
  }

  .kw-menu {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 28px;
    padding: 22px;
    border: 1px solid rgba(0,220,255,0.1);
    background:
      linear-gradient(180deg, rgba(8, 16, 29, 0.78), rgba(6, 12, 24, 0.9));
    border-radius: var(--radius-lg);
    backdrop-filter: blur(12px);
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.02),
      var(--shadow-cyan),
      var(--shadow-deep);
  }

  .kw-item {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 68px;
    padding: 16px 20px;
    border: 1px solid rgba(0,220,255,0.12);
    background:
      linear-gradient(180deg, rgba(0,220,255,0.04), rgba(0,220,255,0.02));
    border-radius: 14px;
    cursor: pointer;
    transition:
      transform 0.28s var(--ease),
      border-color 0.28s var(--ease),
      background 0.28s var(--ease),
      box-shadow 0.28s var(--ease);
    overflow: hidden;
    animation: kw-slide-in 0.44s var(--ease) both;
    backdrop-filter: blur(8px);
  }

  .kw-item:nth-child(1) { animation-delay: 0.08s; }
  .kw-item:nth-child(2) { animation-delay: 0.16s; }
  .kw-item:nth-child(3) { animation-delay: 0.24s; }

  @keyframes kw-slide-in {
    from { opacity: 0; transform: translateX(-26px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .kw-item::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    background: linear-gradient(
      135deg,
      rgba(255,255,255,0.025),
      transparent 35%,
      transparent 70%,
      rgba(0,220,255,0.05)
    );
    pointer-events: none;
  }

  .kw-item::after {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(0,220,255,0.4), var(--c));
    transform: scaleY(0);
    transform-origin: top;
    transition: transform 0.26s var(--ease);
  }

  .kw-item:hover::after {
    transform: scaleY(1);
  }

  .kw-item:hover {
    transform: translateX(6px);
    background:
      linear-gradient(180deg, rgba(0,220,255,0.08), rgba(0,220,255,0.03));
    border-color: rgba(0,220,255,0.32);
    box-shadow: 0 12px 28px rgba(0,220,255,0.08);
  }

  .kw-item-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255,255,255,0.02) 25%,
      rgba(0,220,255,0.08) 50%,
      rgba(255,255,255,0.02) 75%,
      transparent 100%
    );
    transform: translateX(-100%);
    pointer-events: none;
  }

  .kw-item:hover .kw-item-shimmer {
    transform: translateX(100%);
    transition: transform 0.85s var(--ease);
  }

  .kw-item-num {
    font-size: 10px;
    color: rgba(0,220,255,0.38);
    letter-spacing: 2px;
    width: 34px;
    flex-shrink: 0;
    transition: color 0.24s var(--ease);
  }

  .kw-item:hover .kw-item-num {
    color: rgba(0,220,255,0.86);
  }

  .kw-item-name {
    flex: 1;
    font-family: 'Orbitron', monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 3px;
    color: rgba(255,255,255,0.72);
    text-transform: uppercase;
    transition: color 0.24s var(--ease);
    text-align: left;
    margin-left: 12px;
  }

  .kw-item:hover .kw-item-name {
    color: #fff;
  }

  .kw-item-tag {
    font-size: 8px;
    letter-spacing: 2px;
    color: rgba(0,220,255,0.36);
    text-transform: uppercase;
    transition: color 0.24s var(--ease);
  }

  .kw-item:hover .kw-item-tag {
    color: rgba(0,220,255,0.76);
  }

  .kw-item-arr {
    width: 18px;
    height: 14px;
    margin-left: 16px;
    flex-shrink: 0;
    opacity: 0;
    transform: translateX(-10px);
    transition: all 0.24s var(--ease);
    position: relative;
  }

  .kw-item-arr::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    width: 13px;
    height: 1.5px;
    background: var(--c);
    transform: translateY(-50%);
  }

  .kw-item-arr::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 0;
    width: 6px;
    height: 6px;
    border-top: 1.5px solid var(--c);
    border-right: 1.5px solid var(--c);
    transform: translateY(-50%) rotate(45deg);
  }

  .kw-item:hover .kw-item-arr {
    opacity: 1;
    transform: translateX(0);
  }

  .kw-item-hi {
    border-color: rgba(255,45,120,0.16);
    background: linear-gradient(180deg, rgba(255,45,120,0.05), rgba(255,45,120,0.02));
  }

  .kw-item-hi::after {
    background: linear-gradient(180deg, rgba(255,45,120,0.38), var(--m));
  }

  .kw-item-hi:hover {
    background: linear-gradient(180deg, rgba(255,45,120,0.1), rgba(255,45,120,0.03));
    border-color: rgba(255,45,120,0.34);
    box-shadow: 0 14px 30px rgba(255,45,120,0.08);
  }

  .kw-item-hi .kw-item-num {
    color: rgba(255,45,120,0.45);
  }

  .kw-item-hi:hover .kw-item-num {
    color: rgba(255,45,120,0.85);
  }

  .kw-item-hi .kw-item-name {
    color: rgba(255,255,255,0.84);
  }

  .kw-item-hi .kw-item-tag {
    color: rgba(255,45,120,0.44);
  }

  .kw-item-hi:hover .kw-item-tag {
    color: rgba(255,45,120,0.78);
  }

  .kw-item-hi .kw-item-arr::before {
    background: var(--m);
  }

  .kw-item-hi .kw-item-arr::after {
    border-color: var(--m);
  }

  .kw-reg-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    justify-content: center;
    min-height: 58px;
    padding: 16px 38px;
    width: min(100%, 340px);
    font-family: 'Orbitron', monospace;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--m);
    background: rgba(255,45,120,0.03);
    border: 1px solid rgba(255,45,120,0.36);
    border-radius: 14px;
    cursor: pointer;
    transition:
      transform 0.28s var(--ease),
      color 0.28s var(--ease),
      border-color 0.28s var(--ease),
      box-shadow 0.28s var(--ease);
    overflow: hidden;
    outline: none;
    animation: kw-slide-in 0.44s 0.32s both;
    backdrop-filter: blur(8px);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
  }

  .kw-reg-fill {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,45,120,0.95), rgba(255,86,154,0.95));
    transform: translateY(101%);
    transition: transform 0.36s var(--ease);
    z-index: 0;
  }

  .kw-reg-btn:hover .kw-reg-fill {
    transform: translateY(0);
  }

  .kw-reg-btn:hover {
    color: #fff;
    border-color: rgba(255,45,120,0.9);
    box-shadow:
      0 16px 34px rgba(255,45,120,0.16),
      0 0 24px rgba(255,45,120,0.12);
    transform: translateY(-2px);
  }

  .kw-reg-btn:active {
    transform: translateY(0) scale(0.985);
  }

  .kw-reg-btn > * {
    position: relative;
    z-index: 1;
  }

  .kw-hint {
    margin-top: 22px;
    color: rgba(255,255,255,0.2);
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    animation: kw-slide-in 0.44s 0.4s both;
  }

  .kw-hint-dot {
    color: rgba(255,45,120,0.52);
  }

  .kw-mini-contact {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: min(380px, calc(100vw - 32px));
    z-index: 1000;
    padding: 18px;
    border: 1px solid rgba(0, 220, 255, 0.2);
    background:
      linear-gradient(180deg, rgba(10, 18, 34, 0.94), rgba(6, 10, 20, 0.97));
    backdrop-filter: blur(14px);
    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,0.02),
      0 18px 50px rgba(0, 0, 0, 0.38),
      0 0 30px rgba(0, 220, 255, 0.08);
    border-radius: 18px;
    overflow: hidden;
  }

  .kw-mini-contact::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(135deg, rgba(0,220,255,0.08), transparent 28%, transparent 70%, rgba(255,45,120,0.08)),
      linear-gradient(180deg, rgba(255,255,255,0.02), transparent 28%);
  }

  .kw-mini-contact::after {
    content: "";
    position: absolute;
    top: 0;
    left: 18px;
    right: 18px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,220,255,0.45), transparent);
    pointer-events: none;
  }

  .kw-mini-title {
    position: relative;
    color: #ecfbff;
    font-family: "Orbitron", monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2.4px;
    margin-bottom: 14px;
    text-transform: uppercase;
    text-shadow: 0 0 14px rgba(0, 220, 255, 0.16);
  }

  .kw-mini-form {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .kw-mini-input,
  .kw-mini-textarea {
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(0, 220, 255, 0.14);
    color: #fff;
    padding: 12px 14px;
    font-family: "Space Mono", monospace;
    font-size: 12px;
    line-height: 1.5;
    outline: none;
    border-radius: 12px;
    transition:
      border-color 0.22s ease,
      box-shadow 0.22s ease,
      background 0.22s ease,
      transform 0.18s ease;
  }

  .kw-mini-input::placeholder,
  .kw-mini-textarea::placeholder {
    color: rgba(255,255,255,0.34);
  }

  .kw-mini-input:hover,
  .kw-mini-textarea:hover {
    border-color: rgba(0, 220, 255, 0.26);
    background: rgba(255,255,255,0.04);
  }

  .kw-mini-input:focus,
  .kw-mini-textarea:focus {
    border-color: rgba(0, 220, 255, 0.56);
    background: rgba(255,255,255,0.05);
    box-shadow: 0 0 0 4px rgba(0,220,255,0.08);
    transform: translateY(-1px);
  }

  .kw-mini-textarea {
    min-height: 120px;
    resize: vertical;
  }

  .kw-mini-btn {
    width: 100%;
    min-height: 46px;
    border: 1px solid rgba(255, 45, 120, 0.42);
    background: linear-gradient(180deg, rgba(255,45,120,0.1), rgba(255,45,120,0.04));
    color: var(--m);
    padding: 12px 14px;
    font-family: "Orbitron", monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2.4px;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 12px;
    transition:
      transform 0.18s ease,
      border-color 0.22s ease,
      background 0.22s ease,
      color 0.22s ease,
      box-shadow 0.22s ease;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
  }

  .kw-mini-btn:hover {
    color: #fff;
    border-color: rgba(255, 45, 120, 0.8);
    background: linear-gradient(180deg, rgba(255,45,120,0.22), rgba(255,45,120,0.08));
    box-shadow: 0 0 18px rgba(255,45,120,0.14);
    transform: translateY(-1px);
  }

  .kw-mini-btn:active {
    transform: translateY(0);
  }

  @media (max-width: 992px) {
    .kw-content {
      max-width: 560px;
    }

    .kw-mini-contact {
      width: min(360px, calc(100vw - 28px));
      right: 14px;
      bottom: 14px;
    }
  }

  @media (max-width: 768px) {
    .kw-content {
      padding: 1.5rem 1rem 7rem;
      max-width: 100%;
    }

    .kw-badge {
      margin-bottom: 28px;
      letter-spacing: 3px;
      padding: 8px 14px;
    }

    .kw-t2 {
      letter-spacing: 5px;
    }

    .kw-t3 {
      letter-spacing: 6px;
    }

    .kw-subtitle {
      margin-bottom: 28px;
      letter-spacing: 3px;
    }

    .kw-menu {
      padding: 16px;
      gap: 12px;
      border-radius: 18px;
    }

    .kw-item {
      min-height: 62px;
      padding: 14px 16px;
    }

    .kw-item-name {
      font-size: 11px;
      letter-spacing: 2px;
      margin-left: 10px;
    }

    .kw-reg-btn,
    .kw-start-btn {
      width: min(100%, 320px);
    }

    .kw-mini-contact {
      left: 12px;
      right: 12px;
      bottom: 12px;
      width: auto;
      padding: 16px;
      border-radius: 16px;
    }

    .kw-mini-title {
      font-size: 11px;
      letter-spacing: 2px;
    }

    .kw-mini-input,
    .kw-mini-textarea,
    .kw-mini-btn {
      font-size: 11px;
    }

    .kw-mini-textarea {
      min-height: 96px;
    }

    .kw-status {
      bottom: 10px;
      font-size: 8px;
      letter-spacing: 2px;
      padding: 5px 10px;
    }
  }

  @media (max-width: 480px) {
    .kw-corner {
      width: 24px;
      height: 24px;
    }

    .kw-c-tl { top: 10px; left: 10px; }
    .kw-c-tr { top: 10px; right: 10px; }
    .kw-c-bl { bottom: 10px; left: 10px; }
    .kw-c-br { bottom: 10px; right: 10px; }

    .kw-content {
      padding-top: 1.25rem;
    }

    .kw-divider {
      gap: 10px;
      margin: 24px auto;
    }

    .kw-nav-label {
      margin-bottom: 20px;
      gap: 10px;
      letter-spacing: 4px;
    }

    .kw-item-tag {
      display: none;
    }

    .kw-item-arr {
      margin-left: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  }
`}</style>

      <div className="kw-grid" />
      <div className="kw-vignette" />
      <canvas ref={canvasRef} className="kw-canvas-particles" />
      <div className="kw-scan" />

      {[
        ["kw-c-tl", "rgba(0,220,255,0.5)"],
        ["kw-c-tr", "rgba(0,220,255,0.5)"],
        ["kw-c-bl", "rgba(255,45,120,0.5)"],
        ["kw-c-br", "rgba(255,45,120,0.5)"],
      ].map(([cls, stroke]) => (
        <div key={cls} className={`kw-corner ${cls}`}>
          <svg viewBox="0 0 28 28">
            <path
              d="M0 28 L0 0 L28 0"
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
            />
          </svg>
        </div>
      ))}

      <div className="kw-status">
        SYS_OK · K-WEB v2.0 · {new Date().getFullYear()}
      </div>

      <div
        className={glitch ? "kw-glitch" : ""}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          width: "100%",
        }}
      >
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
              Initializing portal
              <span className="kw-cursor" />
            </p>

            <button className="kw-start-btn" onClick={handleStart}>
              <div className="kw-start-icon" />
              <span>Start</span>
            </button>
          </div>
        )}

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
              <div
                className="kw-item kw-item-hi"
                onClick={handleRegister}
                role="button"
                tabIndex={0}
              >
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
                <polygon
                  points="9,1 16,4.5 16,13.5 9,17 2,13.5 2,4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <polygon
                  points="9,5 13,7 13,11 9,13 5,11 5,7"
                  stroke="currentColor"
                  strokeWidth="1"
                  fill="currentColor"
                  opacity="0.25"
                />
              </svg>
              <span>Register Now</span>
            </button>

            <p className="kw-hint">
              <span className="kw-hint-dot">◈</span> Bấm Register để tiếp tục{" "}
              <span className="kw-hint-dot">◈</span>
            </p>
          </div>
        )}
      </div>

      <div className="kw-mini-contact">
        <div className="kw-mini-title">Contact to Khanh</div>
        <form className="kw-mini-form" onSubmit={handleMiniContactSubmit}>
          <input
            className="kw-mini-input"
            type="email"
            placeholder="Nhap gmail cua ban"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
          <textarea
            className="kw-mini-textarea"
            placeholder="Nhap mo ta..."
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value)}
          />
          <button type="submit" className="kw-mini-btn">
            Gui
          </button>
        </form>
      </div>
    </>
  );
};

export default Khanhregister;
