import { useCallback, useEffect } from "react";
import {
  speakOwnerGreeting,
  warmSpeechVoices,
} from "../../../shared/utils/speakOwnerGreeting";

function useIdentityGate({
  API_BASE,
  DRIVER_ID_KEY,
  driverId,
  setDriverId,
  setIdentityError,
  setIdentityLockCause,
  setIdentityRejectLockedAt,
  setStatus,
  setAuthWelcomeProfile,
  setDrowsyAlert,
  setPhoneAlert,
  setSmokingAlert,
  setIdentityHasRegistered,
  setIdentityOwner,
  setIdentitySimilarity,
  setIdentityThreshold,
  setIdentitySamples,
  stopAlarm,
  alarmIntervalRef,
  vibrateIntervalRef,
}) {
  const handleIdentityUnlock = useCallback(
    async (detail) => {
      setIdentityError("");
      setIdentityLockCause(null);
      setIdentityRejectLockedAt("");
      setStatus((prev) => (prev === "active" ? prev : "active"));

      const id = (detail && (detail.driver_id || detail.driverId)) || driverId;

      let merged = {
        driver_id: id,
        registered_name: (detail && (detail.registered_name || detail.name)) || "",
        profile_image_base64: detail && detail.profile_image_base64,
        registered_at: detail && detail.registered_at,
        similarity:
          detail && typeof detail.similarity === "number"
            ? detail.similarity
            : null,
        threshold:
          detail && typeof detail.threshold === "number" ? detail.threshold : null,
        samples_used: detail && detail.samples_used,
        source: (detail && detail.source) || "face",
      };

      if (!merged.profile_image_base64 && id) {
        try {
          const r = await fetch(
            `${API_BASE}/api/identity/driver_profile?driver_id=${encodeURIComponent(id)}`,
          );
          const d = await r.json();
          if (r.ok && d.driver_id) {
            merged = {
              ...merged,
              registered_name: merged.registered_name || d.registered_name || id,
              profile_image_base64:
                merged.profile_image_base64 || d.profile_image_base64,
              registered_at: merged.registered_at || d.registered_at,
            };
          }
        } catch (_) {
          /* ignore */
        }
      }

      if (!merged.registered_name) merged.registered_name = id;

      setAuthWelcomeProfile(merged);
      speakOwnerGreeting(merged.registered_name);
    },
    [API_BASE, driverId, setAuthWelcomeProfile, setIdentityError, setIdentityLockCause, setIdentityRejectLockedAt, setStatus],
  );

  const handleIdentityLock = useCallback(
    (reason) => {
      stopAlarm(alarmIntervalRef, vibrateIntervalRef);
      setDrowsyAlert(null);
      setPhoneAlert(null);
      setSmokingAlert(null);
      const msg = String(reason || "ENGINE OFF: NOT OWNER");
      setIdentityError(msg);
      if (/reject/i.test(msg)) {
        setIdentityLockCause("owner_reject");
        setIdentityRejectLockedAt(new Date().toLocaleString("vi-VN"));
      } else {
        setIdentityRejectLockedAt("");
        if (msg.includes("NO RESPONSE") || /expired/i.test(msg))
          setIdentityLockCause("owner_timeout");
        else setIdentityLockCause("generic");
      }
      setStatus("locked");
    },
    [alarmIntervalRef, setDrowsyAlert, setIdentityError, setIdentityLockCause, setIdentityRejectLockedAt, setPhoneAlert, setSmokingAlert, setStatus, stopAlarm, vibrateIntervalRef],
  );

  const handleUpdateIdentity = useCallback(
    (payload) => {
      const hasRegistered = Boolean(payload?.hasRegistered);
      const isOwner = Boolean(payload?.isOwner);

      setIdentityHasRegistered(hasRegistered);
      setIdentityOwner(hasRegistered ? isOwner : null);
      setIdentitySimilarity(
        typeof payload?.similarity === "number" ? payload.similarity : null,
      );
      if (typeof payload?.threshold === "number") {
        setIdentityThreshold(payload.threshold);
      }
      setIdentitySamples(
        typeof payload?.samplesUsed === "number" ? payload.samplesUsed : 0,
      );
      setIdentityError(payload?.error || "");
    },
    [
      setIdentityError,
      setIdentityHasRegistered,
      setIdentityOwner,
      setIdentitySamples,
      setIdentitySimilarity,
      setIdentityThreshold,
    ],
  );

  useEffect(() => {
    warmSpeechVoices();
  }, []);

  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(DRIVER_ID_KEY);
      if (savedId) setDriverId(savedId);
    } catch (_) {}
  }, [DRIVER_ID_KEY, setDriverId]);

  return {
    handleIdentityUnlock,
    handleIdentityLock,
    handleUpdateIdentity,
  };
}

export default useIdentityGate;
