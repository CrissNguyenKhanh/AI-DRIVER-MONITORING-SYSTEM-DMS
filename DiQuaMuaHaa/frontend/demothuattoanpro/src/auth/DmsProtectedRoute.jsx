import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDmsApiBase } from "../config/apiEndpoints.js";
import { logoutDmsSession, validateDmsSession } from "../utils/authApi.js";
import DmsEnrollmentPanel from "./DmsEnrollmentPanel.jsx";
import { DmsSessionContext } from "./DmsSessionContext.js";
import "./DmsAuth.css";

const API_BASE = getDmsApiBase();
export default function DmsProtectedRoute({ children }) {
  const [session, setSession] = useState({ state: "checking", principal: null });
  const [logoutLoading, setLogoutLoading] = useState(false);
  const controllerRef = useRef(null);

  const checkSession = useCallback(async ({ quiet = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!quiet) setSession((current) => ({ ...current, state: "checking" }));
    try {
      const result = await validateDmsSession(API_BASE, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSession({
        state: result.state,
        principal: result.principal || null,
        message: result.message || "",
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        setSession({ state: "unavailable", principal: null, message: "Không thể kiểm tra phiên DMS." });
      }
    }
  }, []);

  useEffect(() => {
    checkSession();
    const onFocus = () => checkSession({ quiet: true });
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      controllerRef.current?.abort();
    };
  }, [checkSession]);

  async function logout() {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await logoutDmsSession(API_BASE);
    } finally {
      setLogoutLoading(false);
      setSession({ state: "missing", principal: null, message: "Đã đăng xuất khỏi DMS." });
    }
  }

  const invalidate = useCallback((message = "Phiên DMS đã hết hạn hoặc bị thu hồi.") => {
    setSession({ state: "expired", principal: null, message });
  }, []);
  const contextValue = useMemo(() => ({
    principal: session.principal,
    invalidate,
  }), [invalidate, session.principal]);

  if (session.state === "checking") {
    return <main className="dms-auth-shell"><div className="dms-auth-card" role="status">Đang kiểm tra phiên DMS với máy chủ…</div></main>;
  }
  if (session.state === "unavailable") {
    return (
      <main className="dms-auth-shell">
        <section className="dms-auth-card">
          <h1>Chưa thể xác minh phiên</h1>
          <p>Token cục bộ được giữ nguyên nhưng quyền truy cập tạm khóa cho tới khi máy chủ phản hồi.</p>
          <div className="dms-auth-status info" role="status">{session.message}</div>
          <div className="dms-auth-actions">
            <button className="dms-auth-button" type="button" onClick={() => checkSession()}>Thử lại</button>
          </div>
        </section>
      </main>
    );
  }
  if (session.state !== "authenticated") {
    return (
      <DmsEnrollmentPanel
        apiBase={API_BASE}
        initialMessage={session.message}
        onAuthenticated={(principal) => setSession({ state: "authenticated", principal })}
      />
    );
  }
  return (
    <DmsSessionContext.Provider value={contextValue}>
      <div className="dms-session-bar" role="status">
        <span>Phiên DMS đã xác minh · Driver: {session.principal?.driver_id}</span>
        <button className="dms-auth-button secondary" type="button" disabled={logoutLoading} onClick={logout}>
          {logoutLoading ? "Đang đăng xuất…" : "Đăng xuất DMS"}
        </button>
      </div>
      {children}
    </DmsSessionContext.Provider>
  );
}
