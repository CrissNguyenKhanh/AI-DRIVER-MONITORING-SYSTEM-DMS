import { useCallback, useEffect, useRef, useState } from "react";
import {
  startDrivingSession,
  endDrivingSession,
  recordDrivingAlert,
  listDrivingSessions,
} from "../api/drivingSessionApi";

export function useDrivingSession({
  apiBase,
  status,
  driverId,
  phoneAlert,
  smokingAlert,
  drowsyAlert,
} = {}) {
  const drivingSessionIdRef = useRef(null);
  const prevPhoneAlertRef = useRef(null);
  const prevSmokingAlertRef = useRef(null);
  const prevDrowsyAlertRef = useRef(null);

  const [drivingSessionId, setDrivingSessionId] = useState(null);
  const [drivingSessionStartedAt, setDrivingSessionStartedAt] = useState(null);
  const [sessionAlertCounts, setSessionAlertCounts] = useState({
    phone: 0,
    smoking: 0,
    drowsy: 0,
  });
  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [sessionLogLoading, setSessionLogLoading] = useState(false);
  const [sessionLogItems, setSessionLogItems] = useState([]);

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
        endDrivingSession(apiBase, sid).catch(() => {});
      }
      return;
    }

    let cancelled = false;
    (async () => {
      const { ok, data } = await startDrivingSession(apiBase, { driverId });
      if (cancelled) {
        if (ok && data?.session_id) {
          await endDrivingSession(apiBase, data.session_id).catch(() => {});
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
      const sid = drivingSessionIdRef.current;
      if (sid) {
        drivingSessionIdRef.current = null;
        endDrivingSession(apiBase, sid).catch((err) => {
          console.warn("Failed to end driving session on cleanup", err);
        });
      }
      cancelled = true;
    };
  }, [apiBase, status, driverId]);

  useEffect(() => {
    if (!drivingSessionId || status !== "active") return;
    prevPhoneAlertRef.current = phoneAlert;
    prevSmokingAlertRef.current = smokingAlert;
    prevDrowsyAlertRef.current = drowsyAlert;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new session id is assigned
  }, [drivingSessionId, status]);

  useEffect(() => {
    const sid = drivingSessionIdRef.current;
    if (!sid || status !== "active") return;

    if (phoneAlert !== null && prevPhoneAlertRef.current === null) {
      recordDrivingAlert(apiBase, sid, "phone").then((r) => {
        if (r.ok)
          setSessionAlertCounts((c) => ({ ...c, phone: c.phone + 1 }));
      });
    }
    prevPhoneAlertRef.current = phoneAlert;

    if (smokingAlert !== null && prevSmokingAlertRef.current === null) {
      recordDrivingAlert(apiBase, sid, "smoking").then((r) => {
        if (r.ok)
          setSessionAlertCounts((c) => ({ ...c, smoking: c.smoking + 1 }));
      });
    }
    prevSmokingAlertRef.current = smokingAlert;

    if (drowsyAlert !== null && prevDrowsyAlertRef.current === null) {
      recordDrivingAlert(apiBase, sid, "drowsy").then((r) => {
        if (r.ok)
          setSessionAlertCounts((c) => ({ ...c, drowsy: c.drowsy + 1 }));
      });
    }
    prevDrowsyAlertRef.current = drowsyAlert;
  }, [apiBase, phoneAlert, smokingAlert, drowsyAlert, status]);

  const refreshSessionLog = useCallback(async () => {
    setSessionLogLoading(true);
    try {
      const { ok, data } = await listDrivingSessions(apiBase, {
        limit: 25,
        driverId,
      });
      if (ok && data?.sessions) setSessionLogItems(data.sessions);
    } catch {
      setSessionLogItems([]);
    } finally {
      setSessionLogLoading(false);
    }
  }, [apiBase, driverId]);

  useEffect(() => {
    if (sessionLogOpen) refreshSessionLog();
  }, [sessionLogOpen, refreshSessionLog]);

  return {
    drivingSessionIdRef,
    drivingSessionId,
    drivingSessionStartedAt,
    sessionAlertCounts,
    sessionLogOpen,
    setSessionLogOpen,
    sessionLogLoading,
    sessionLogItems,
    refreshSessionLog,
  };
}

export default useDrivingSession;
