import React, { useEffect, useRef } from "react";
import { getDmsApiBase } from "../config/apiEndpoints";

const DEFAULT_API_BASE = getDmsApiBase();
const DEFAULT_VERIFY_INTERVAL_MS = 1200;
const DEFAULT_DECISION_TIMEOUT_SEC = 30;
const BURST_FRAMES = 2;
const BURST_GAP_MS = 110;

// Downscale to reduce base64 payload size.
function captureFrame(videoEl, quality = 0.7, maxW = 480) {
  if (!videoEl || videoEl.readyState < 2) return null;

  const srcW = videoEl.videoWidth || 640;
  const srcH = videoEl.videoHeight || 480;
  const scale = Math.min(1, maxW / srcW);
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

async function captureBurstFrames(videoEl, count = BURST_FRAMES, gapMs = BURST_GAP_MS) {
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const f = captureFrame(videoEl, 0.7);
    if (f) frames.push(f);
    if (i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return frames;
}

/**
 * OwnerVerifyGate
 * - Chuyên verify identity (driver_id) bằng /api/identity/verify
 * - Điều khiển unlock/lock theo streak
 *
 * Props:
 * - enabled: bật/tắt loop
 * - carState: "auth" | "active" (dùng để tránh callback lặp)
 * - videoRef: ref tới <video>
 * - driverId: car uuid / owner id
 * - apiBase: base url backend (mặc định cùng hostname trang web, cổng 8000)
 * - unlockStreakFrames: số lần liên tiếp cần is_owner=true để unlock
 * - lockStreakFrames: số lần liên tiếp cần is_owner=false để lock về auth
 * - onUnlock: callback khi unlock; nhận optional object profile từ verify (hoặc tối thiểu { driverId, source: "telegram" })
 * - onLock: callback khi lock
 * - onUpdateIdentity: callback mỗi vòng verify để parent render HUD
 */
export default function OwnerVerifyGate({
  enabled,
  carState,
  videoRef,
  driverId,
  apiBase = DEFAULT_API_BASE,
  unlockStreakFrames = 2,
  lockStreakFrames = 3,
  verifyIntervalMs = DEFAULT_VERIFY_INTERVAL_MS,
  decisionTimeoutSec = DEFAULT_DECISION_TIMEOUT_SEC,
  onUnlock,
  onLock,
  onUpdateIdentity,
}) {
  const onUnlockRef = useRef(onUnlock);
  const onLockRef = useRef(onLock);
  const onUpdateRef = useRef(onUpdateIdentity);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
    onLockRef.current = onLock;
    onUpdateRef.current = onUpdateIdentity;
  }, [onUnlock, onLock, onUpdateIdentity]);

  const intruderStreakRef = useRef(0);
  const ownerStreakRef = useRef(0);
  const lockedStateRef = useRef(false);
  const pendingRequestIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let tid = null;

    async function verifyOnce() {
      const vid = videoRef?.current;
      if (!vid || vid.readyState < 2) return null;

      const frames = await captureBurstFrames(vid);
      if (!frames || frames.length === 0) return null;

      const res = await fetch(`${apiBase}/api/identity/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: driverId, images: frames }),
      });

      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    }

    async function createDecisionRequest(similarity, threshold) {
      const res = await fetch(`${apiBase}/api/identity/request_decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: driverId,
          similarity,
          threshold,
          reason: "intruder",
          timeout_sec: decisionTimeoutSec,
          phase: "auth",
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    }

    async function pollDecisionStatus(requestId) {
      const res = await fetch(
        `${apiBase}/api/identity/decision_status?request_id=${encodeURIComponent(String(requestId))}`,
      );
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    }

    async function loop() {
      if (cancelled) return;

      try {
        // Ưu tiên: đang chờ quyết định Telegram → poll trước verify mặt.
        // Tránh mất request_id khi verify nhấp nháy is_owner=true (đã clear pending).
        if (pendingRequestIdRef.current) {
          const stRes = await pollDecisionStatus(pendingRequestIdRef.current);
          if (!stRes.ok || stRes.data?.error) {
            const errMsg = String(stRes.data?.error || "Decision status unavailable");
            if (onUpdateRef.current) {
              onUpdateRef.current({
                hasRegistered: true,
                isOwner: false,
                similarity: null,
                threshold: null,
                samplesUsed: 0,
                error: errMsg,
              });
            }
          } else {
            const stRaw = String(stRes.data?.status || "pending").toLowerCase().trim();
            const remain = Number(stRes.data?.remaining_sec || 0);
            let waitMsg = `WAITING OWNER DECISION (${remain}s)`;

            if (stRaw === "accepted") {
              pendingRequestIdRef.current = null;
              intruderStreakRef.current = 0;
              ownerStreakRef.current = unlockStreakFrames;
              waitMsg = "OWNER ACCEPTED REMOTE OVERRIDE";
              onUnlockRef.current?.({ driverId, source: "telegram" });
              if (onUpdateRef.current) {
                onUpdateRef.current({
                  hasRegistered: true,
                  isOwner: true,
                  similarity: null,
                  threshold: null,
                  samplesUsed: 0,
                  error: waitMsg,
                });
              }
              if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
              return;
            }
            if (stRaw === "rejected" || stRaw === "expired") {
              pendingRequestIdRef.current = null;
              lockedStateRef.current = false;
              const lockMsg =
                stRaw === "rejected"
                  ? "OWNER REJECTED. ENGINE OFF."
                  : "OWNER NO RESPONSE. ENGINE OFF.";
              onLockRef.current?.(lockMsg);
              if (onUpdateRef.current) {
                onUpdateRef.current({
                  hasRegistered: true,
                  isOwner: false,
                  similarity: null,
                  threshold: null,
                  samplesUsed: 0,
                  error: lockMsg,
                });
              }
              if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
              return;
            }

            if (onUpdateRef.current) {
              onUpdateRef.current({
                hasRegistered: true,
                isOwner: false,
                similarity: null,
                threshold: null,
                samplesUsed: 0,
                error: waitMsg,
              });
            }
          }
          if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
          return;
        }

        const res = await verifyOnce();
        if (!res) {
          if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
          return;
        }

        if (!res.ok || res.data?.error) {
          const msg = String(res.data?.error || "Identity verify failed");
          // treat as intruder/unknown -> avoid unlocking
          ownerStreakRef.current = 0;
          intruderStreakRef.current += 1;
          if (onUpdateRef.current) {
            onUpdateRef.current({
              hasRegistered: false,
              isOwner: false,
              similarity: null,
              threshold: null,
              samplesUsed: 0,
              error: msg,
            });
          }
          if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
          return;
        }

        const hasRegistered = Boolean(res.data?.has_registered);
        const isOwner = Boolean(res.data?.is_owner);
        const similarity =
          typeof res.data?.similarity === "number" ? res.data.similarity : null;
        const threshold =
          typeof res.data?.threshold === "number" ? res.data.threshold : null;
        const samplesUsed =
          typeof res.data?.samples_used === "number" ? res.data.samples_used : 0;

        if (!hasRegistered) {
          if (onUpdateRef.current) {
            onUpdateRef.current({
              hasRegistered,
              isOwner: false,
              similarity,
              threshold,
              samplesUsed,
              error: "NO FACE REGISTERED FOR THIS CAR",
            });
          }
          ownerStreakRef.current = 0;
          intruderStreakRef.current += 1;
          if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
          return;
        }

        if (isOwner) {
          if (onUpdateRef.current) {
            onUpdateRef.current({
              hasRegistered,
              isOwner,
              similarity,
              threshold,
              samplesUsed,
              error: "",
            });
          }
          intruderStreakRef.current = 0;
          ownerStreakRef.current += 1;

          if (carState === "auth" && ownerStreakRef.current >= unlockStreakFrames && !lockedStateRef.current) {
            lockedStateRef.current = true;
            onUnlockRef.current?.({
              driverId,
              driver_id: res.data?.driver_id || driverId,
              registered_name: res.data?.registered_name,
              profile_image_base64: res.data?.profile_image_base64,
              registered_at: res.data?.registered_at,
              similarity: res.data?.similarity,
              threshold: res.data?.threshold,
              samples_used: res.data?.samples_used,
              source: "face",
            });
          }
        } else {
          ownerStreakRef.current = 0;
          intruderStreakRef.current += 1;

          // Chỉ gửi Telegram khi đang xác nhận xe (auth), không spam khi đã lái (active).
          const mustEscalate =
            carState === "auth" &&
            intruderStreakRef.current >= lockStreakFrames &&
            carState !== "locked";
          let msg = "INTRUDER DETECTED";
          if (carState === "active" && intruderStreakRef.current >= lockStreakFrames) {
            msg = "⚠ KHÔNG KHỚP KHUÔN MẶT (chỉ cảnh báo trên xe, không gửi Telegram)";
          }

          if (mustEscalate) {
            if (!pendingRequestIdRef.current) {
              const reqRes = await createDecisionRequest(similarity, threshold);
              if (!reqRes.ok || reqRes.data?.error) {
                pendingRequestIdRef.current = null;
                lockedStateRef.current = false;
                msg = String(reqRes.data?.error || "Cannot request owner decision");
                onLockRef.current?.(msg);
              } else {
                pendingRequestIdRef.current = reqRes.data?.request_id || null;
                const remain = Number(reqRes.data?.remaining_sec || decisionTimeoutSec);
                msg = `WAITING OWNER DECISION (${remain}s)`;
              }
            }
            // Poll chạy ở đầu vòng loop khi đã có pendingRequestIdRef — không poll lại ở đây.
          }

          if (onUpdateRef.current) {
            onUpdateRef.current({
              hasRegistered,
              isOwner: false,
              similarity,
              threshold,
              samplesUsed,
              error: msg,
            });
          }
        }
      } catch (e) {
        if (onUpdateRef.current) {
          onUpdateRef.current({
            hasRegistered: false,
            isOwner: false,
            similarity: null,
            threshold: null,
            samplesUsed: 0,
            error: String(e?.message || e || "Identity auth error"),
          });
        }
      }

      if (!cancelled) tid = setTimeout(loop, verifyIntervalMs);
    }

    loop();
    return () => {
      cancelled = true;
      if (tid) clearTimeout(tid);
    };
  }, [
    enabled,
    carState,
    videoRef,
    driverId,
    apiBase,
    unlockStreakFrames,
    lockStreakFrames,
    verifyIntervalMs,
    decisionTimeoutSec,
  ]);

  return null;
}

