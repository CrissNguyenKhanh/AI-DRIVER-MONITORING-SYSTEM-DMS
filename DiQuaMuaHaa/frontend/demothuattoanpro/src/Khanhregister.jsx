import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import profileImage from "../images/image.png";

const Khanhregister = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("welcome");
  const [showHero, setShowHero] = useState(false);
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
      particlesRef.current = Array.from({ length: 44 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.4,
        vy: -(Math.random() * 0.6 + 0.2),
        vx: (Math.random() - 0.5) * 0.22,
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
      setPhase("hero");
      setTimeout(() => setShowHero(true), 60);
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
          --m: #ff2d78;
          --bg: #040810;
          --text: #f5fbff;
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

        .kw-root {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 20% 20%, rgba(0,220,255,0.09), transparent 26%),
            radial-gradient(circle at 80% 20%, rgba(255,45,120,0.09), transparent 28%),
            radial-gradient(circle at 50% 100%, rgba(0,220,255,0.06), transparent 34%),
            linear-gradient(180deg, #03060d 0%, #07111f 48%, #040810 100%);
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

        .kw-center-wrap {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 10;
          padding: 24px;
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

        .kw-content {
          text-align: center;
          width: 100%;
          max-width: 640px;
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
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02), 0 0 30px rgba(0,220,255,0.12);
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

        .kw-hero {
          width: 100%;
          max-width: 1100px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 48px;
          opacity: 0;
          transform: translateY(30px) scale(0.98);
          transition:
            opacity 0.8s var(--ease),
            transform 0.8s var(--ease);
        }

        .kw-hero.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .kw-hero-left {
          flex: 0 0 520px;
          display: flex;
          justify-content: center;
        }

        .kw-hero-right {
          flex: 0 1 420px;
          text-align: left;
        }

        .kw-portrait-shell {
          position: relative;
          width: min(520px, 42vw);
          aspect-ratio: 1 / 1.12;
          border-radius: 34px;
          padding: 14px;
          background:
            linear-gradient(135deg, rgba(0,220,255,0.28), rgba(255,45,120,0.24));
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04),
            0 22px 60px rgba(0,0,0,0.42),
            0 0 42px rgba(0,220,255,0.14),
            0 0 36px rgba(255,45,120,0.12);
          overflow: hidden;
        }

        .kw-portrait-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.12), transparent 30%, transparent 70%, rgba(255,255,255,0.04));
          pointer-events: none;
        }

        .kw-portrait-shell::after {
          content: "";
          position: absolute;
          inset: 8px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.08);
          pointer-events: none;
        }

        .kw-portrait-glow {
          position: absolute;
          inset: -18%;
          background:
            radial-gradient(circle, rgba(0,220,255,0.16) 0%, transparent 55%),
            radial-gradient(circle at 70% 30%, rgba(255,45,120,0.14) 0%, transparent 45%);
          filter: blur(28px);
          pointer-events: none;
          z-index: 0;
        }

        .kw-portrait-frame {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 26px;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(8,16,29,0.92), rgba(6,10,20,0.96));
          z-index: 1;
        }

        .kw-portrait-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          filter:
            saturate(1.08)
            contrast(1.04)
            brightness(1.02);
          transform: scale(1.03);
        }

        .kw-portrait-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(0,0,0,0.04), transparent 35%, transparent 65%, rgba(0,0,0,0.3)),
            radial-gradient(circle at top, transparent 50%, rgba(0,0,0,0.16));
          pointer-events: none;
        }

        .kw-portrait-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          top: 14%;
          background: linear-gradient(90deg, transparent, rgba(0,220,255,0.62), transparent);
          box-shadow: 0 0 12px rgba(0,220,255,0.24);
          animation: kw-face-scan 4.2s linear infinite;
          pointer-events: none;
        }

        @keyframes kw-face-scan {
          0% { top: 12%; opacity: 0; }
          8% { opacity: 0.8; }
          92% { opacity: 0.55; }
          100% { top: 88%; opacity: 0; }
        }

        .kw-portrait-corners span {
          position: absolute;
          width: 56px;
          height: 56px;
          z-index: 2;
          pointer-events: none;
        }

        .kw-portrait-corners span::before,
        .kw-portrait-corners span::after {
          content: "";
          position: absolute;
          background: rgba(0,220,255,0.65);
          box-shadow: 0 0 12px rgba(0,220,255,0.22);
        }

        .kw-portrait-corners .tl { top: 10px; left: 10px; }
        .kw-portrait-corners .tr { top: 10px; right: 10px; transform: scaleX(-1); }
        .kw-portrait-corners .bl { bottom: 10px; left: 10px; transform: scaleY(-1); }
        .kw-portrait-corners .br { bottom: 10px; right: 10px; transform: scale(-1); }

        .kw-portrait-corners span::before {
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
        }

        .kw-portrait-corners span::after {
          top: 0;
          left: 0;
          width: 2px;
          height: 100%;
        }

        .kw-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,45,120,0.2);
          background: rgba(255,45,120,0.06);
          color: rgba(255,45,120,0.86);
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          box-shadow: 0 0 24px rgba(255,45,120,0.08);
        }

        .kw-hero-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--m);
          box-shadow: 0 0 10px rgba(255,45,120,0.5);
        }

        .kw-hero-title {
          font-family: 'Orbitron', monospace;
          font-size: clamp(2.4rem, 5vw, 4.3rem);
          line-height: 0.96;
          font-weight: 900;
          letter-spacing: -1px;
          margin-bottom: 18px;
          text-transform: uppercase;
          color: #fff;
          text-shadow:
            0 0 24px rgba(255,255,255,0.06),
            0 0 40px rgba(0,220,255,0.14);
        }

        .kw-hero-title span {
          display: block;
          color: var(--m);
          text-shadow: 0 0 28px rgba(255,45,120,0.22);
        }

        .kw-hero-sub {
          color: rgba(255,255,255,0.66);
          font-size: 13px;
          line-height: 1.8;
          margin-bottom: 28px;
          max-width: 420px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .kw-reg-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          min-height: 60px;
          padding: 16px 34px;
          min-width: 250px;
          font-family: 'Orbitron', monospace;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--m);
          background: rgba(255,45,120,0.04);
          border: 1px solid rgba(255,45,120,0.38);
          border-radius: 16px;
          cursor: pointer;
          transition:
            transform 0.28s var(--ease),
            color 0.28s var(--ease),
            border-color 0.28s var(--ease),
            box-shadow 0.28s var(--ease);
          overflow: hidden;
          outline: none;
          backdrop-filter: blur(10px);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.02),
            0 16px 36px rgba(255,45,120,0.08);
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
            0 18px 40px rgba(255,45,120,0.16),
            0 0 24px rgba(255,45,120,0.12);
          transform: translateY(-2px) scale(1.01);
        }

        .kw-reg-btn:active {
          transform: translateY(0) scale(0.985);
        }

        .kw-reg-btn > * {
          position: relative;
          z-index: 1;
        }

        .kw-hero-note {
          margin-top: 18px;
          color: rgba(255,255,255,0.28);
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
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

        @media (max-width: 980px) {
          .kw-hero {
            flex-direction: column;
            gap: 24px;
            text-align: center;
          }

          .kw-hero-left,
          .kw-hero-right {
            flex: unset;
            width: 100%;
          }

          .kw-hero-right {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
          }

          .kw-portrait-shell {
            width: min(520px, 84vw);
          }

          .kw-hero-sub {
            max-width: 620px;
          }
        }

        @media (max-width: 768px) {
          .kw-center-wrap {
            padding: 18px 14px 110px;
          }

          .kw-content {
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

          .kw-portrait-shell {
            width: min(92vw, 430px);
            border-radius: 24px;
            padding: 10px;
          }

          .kw-portrait-frame {
            border-radius: 18px;
          }

          .kw-hero-title {
            font-size: clamp(2rem, 10vw, 3.2rem);
          }

          .kw-hero-sub {
            font-size: 12px;
            line-height: 1.7;
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

          .kw-center-wrap {
            padding-top: 12px;
          }

          .kw-hero-badge {
            font-size: 9px;
            letter-spacing: 1.5px;
          }

          .kw-hero-note {
            font-size: 9px;
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

      <div className="kw-root">
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
          SYS_OK · K-WEB v3.0 · {new Date().getFullYear()}
        </div>

        <div className={`kw-center-wrap ${glitch ? "kw-glitch" : ""}`}>
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

          {phase === "hero" && (
            <div className={`kw-hero ${showHero ? "visible" : ""}`}>
              <div className="kw-hero-left">
                <div className="kw-portrait-shell">
                  <div className="kw-portrait-glow" />
                  <div className="kw-portrait-frame">
                    <img
                      src={profileImage}
                      alt="Khanh portrait"
                      className="kw-portrait-img"
                    />
                    <div className="kw-portrait-overlay" />
                    <div className="kw-portrait-line" />
                    <div className="kw-portrait-corners">
                      <span className="tl" />
                      <span className="tr" />
                      <span className="bl" />
                      <span className="br" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="kw-hero-right">
                <div className="kw-hero-badge">
                  <span className="kw-hero-dot" />
                  Main Profile
                </div>

                <h2 className="kw-hero-title">
                  Khanh
                  <span>Handsome Mode</span>
                </h2>

                <p className="kw-hero-sub">
                  Welcome to the official visual gateway. Chỉ để lại đúng một
                  lối đi — đăng ký ngay để tiếp tục vào hệ thống.
                </p>

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

                <p className="kw-hero-note">
                  ◈ Only one action. Only one way in. ◈
                </p>
              </div>
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
      </div>
    </>
  );
};

export default Khanhregister;
