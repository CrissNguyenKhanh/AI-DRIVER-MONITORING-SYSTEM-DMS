import { useCallback, useEffect, useRef } from "react";
import {
  startDrivingSession,
  endDrivingSession,
  recordDrivingAlert,
  listDrivingSessions,
} from "../../../shared/utils/drivingSessionApi";

function useDrivingSession({
  API_BASE,
  status,
  driverId,
  phoneAlert,
  smokingAlert,
  drowsyAlert,
  sessionLogOpen,
  setDrivingSessionId,
  setDrivingSessionStartedAt,
  setSessionAlertCounts,
  setSessionLogLoading,
  setSessionLogItems,
}) {
  const drivingSessionIdRef = useRef(null);
  const prevPhoneAlertRef = useRef(null);
  const prevSmokingAlertRef = useRef(null);
  const prevDrowsyAlertRef = useRef(null);

  useEffect(() => {
    if (status !== "active") {
      const sid = drivingSessionIdRef.current;
      drivingSessionIdRef.current = null;
      setDrivingSessionId(null);
      setDrivingSessionStartedAt(null);
      prevPhoneAlertRef.current = null;
      prevSmokingAlertRef.current = null;
      prevDrowsyAlertRef.current = null;
      setSessionAlertCounts({ phone: 0, smoking: 0, drowsy: 0 });
      if (sid) {
        endDrivingSession(API_BASE, sid).catch(() => {});
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const { ok, data } = await startDrivingSession(API_BASE, { driverId });
      if (cancelled) {
        if (ok && data?.session_id) {
          await endDrivingSession(API_BASE, data.session_id).catch(() => {});
        }
        return;
      }
      if (ok && data?.session_id) {
        drivingSessionIdRef.current = data.session_id;
        setDrivingSessionId(data.session_id);
        setDrivingSessionStartedAt(data.started_at || "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, driverId, setDrivingSessionId, setDrivingSessionStartedAt, setSessionAlertCounts, status]);

  useEffect(() => {
    if (!drivingSessionIdRef.current || status !== "active") return;
    prevPhoneAlertRef.current = phoneAlert;
    prevSmokingAlertRef.current = smokingAlert;
    prevDrowsyAlertRef.current = drowsyAlert;
  }, [drowsyAlert, phoneAlert, smokingAlert, status]);

  useEffect(() => {
    const sid = drivingSessionIdRef.current;
    if (!sid || status !== "active") return;

    if (phoneAlert !== null && prevPhoneAlertRef.current === null) {
      recordDrivingAlert(API_BASE, sid, "phone").then((r) => {
        if (r.ok) setSessionAlertCounts((c) => ({ ...c, phone: c.phone + 1 }));
      });
    }
    prevPhoneAlertRef.current = phoneAlert;

    if (smokingAlert !== null && prevSmokingAlertRef.current === null) {
      recordDrivingAlert(API_BASE, sid, "smoking").then((r) => {
        if (r.ok) setSessionAlertCounts((c) => ({ ...c, smoking: c.smoking + 1 }));
      });
    }
    prevSmokingAlertRef.current = smokingAlert;

    if (drowsyAlert !== null && prevDrowsyAlertRef.current === null) {
      recordDrivingAlert(API_BASE, sid, "drowsy").then((r) => {
        if (r.ok) setSessionAlertCounts((c) => ({ ...c, drowsy: c.drowsy + 1 }));
      });
    }
    prevDrowsyAlertRef.current = drowsyAlert;
  }, [API_BASE, drowsyAlert, phoneAlert, setSessionAlertCounts, smokingAlert, status]);

  const refreshSessionLog = useCallback(async () => {
    setSessionLogLoading(true);
    try {
      const { ok, data } = await listDrivingSessions(API_BASE, {
        limit: 25,
        driverId,
      });
      if (ok && data?.sessions) setSessionLogItems(data.sessions);
    } catch (_) {
      setSessionLogItems([]);
    } finally {
      setSessionLogLoading(false);
    }
  }, [API_BASE, driverId, setSessionLogItems, setSessionLogLoading]);

  useEffect(() => {
    if (sessionLogOpen) refreshSessionLog();
  }, [refreshSessionLog, sessionLogOpen]);
}

export default useDrivingSession;
