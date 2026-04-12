import React, { useState, useCallback } from "react";
import { SMOKING_ENABLED } from "../../constants/dmsConfig";
import { useDmsContext } from "../../context/DmsContext";
import { listDrivingSessions } from "../../../utils/drivingSessionApi";
import { API_BASE } from "../../constants/dmsConfig";

/**
 * DmsHudPanel — top-left overlay hiển thị diagnostic info khi status === "active".
 * Đọc state từ DmsContext, không cần props.
 */
export default function DmsHudPanel() {
  const {
    driverId, faceMeshRef,
    identityOwner, identityHasRegistered, identitySimilarity, identitySamples, identityError,
    wsConnected, phoneIconActive, phoneDetectionRef, phoneError,
    smokingIconActive, smokingResult, smokingSecRef, smokingError,
    drivingSessionId, drivingSessionStartedAt, sessionAlertCounts,
  } = useDmsContext();

  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [sessionLogItems, setSessionLogItems] = useState([]);
  const [sessionLogLoading, setSessionLogLoading] = useState(false);

  const identityColor =
    identityOwner === true ? "#00e578" : identityOwner === false ? "#ff4560" : "#ffc940";
  const identityLabel = identityHasRegistered
    ? identityOwner === true ? "YES" : identityOwner === false ? "NO" : "CHECKING"
    : "NOT REGISTERED";

  const refreshSessionLog = useCallback(async () => {
    setSessionLogLoading(true);
    try {
      const { ok, data } = await listDrivingSessions(API_BASE, { limit: 25, driverId });
      if (ok && data?.sessions) setSessionLogItems(data.sessions);
    } catch (_) {
      setSessionLogItems([]);
    } finally {
      setSessionLogLoading(false);
    }
  }, [driverId]);

  const handleToggleLog = () => {
    setSessionLogOpen(o => {
      if (!o) refreshSessionLog();
      return !o;
    });
  };

  return (
    <div style={{
      position: "absolute", top: 82, left: 14,
      pointerEvents: "none", lineHeight: "1.9", zIndex: 6,
    }}>
      <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>FPS : 30</div>
      <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>Person ID : Tall</div>
      <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>AOI : 0</div>
      <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
        Eye Mode : {faceMeshRef?.current ? "SACCADE" : "STANDBY"}
      </div>
      <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
        Driver ID : {driverId}
      </div>
      <div style={{ fontSize: 13, color: identityColor, fontWeight: 700 }}>
        Real Driver : {identityLabel}
      </div>
      <div style={{ fontSize: 13, color: "#3b9eff", fontWeight: 500 }}>
        Face Match :{" "}
        {typeof identitySimilarity === "number"
          ? `${(identitySimilarity * 100).toFixed(2)}%`
          : "--"}{" "}
        ({identitySamples || 0} frames)
      </div>
      <div style={{
        fontSize: 13,
        color: phoneIconActive ? "#ffaa40" : "#3b9eff",
        fontWeight: 500,
      }}>
        Phone WS :{" "}
        {wsConnected
          ? phoneIconActive
            ? `⚠ YES (${((phoneDetectionRef?.current?.prob || 0) * 100).toFixed(0)}%)`
            : "NO"
          : "⚠ disconnected"}
      </div>

      {identityError && (
        <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}>
          Identity: {identityError}
        </div>
      )}
      {phoneError && (
        <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}>
          {phoneError}
        </div>
      )}

      {/* Driving session info */}
      <div style={{
        pointerEvents: "auto", marginTop: 10, paddingTop: 8,
        borderTop: "1px solid rgba(60,120,180,0.35)", maxWidth: 280,
      }}>
        <div style={{ fontSize: 12, color: "#8ecae6", fontWeight: 600 }}>
          Phiên lái #{drivingSessionId ?? "…"}
          {drivingSessionStartedAt ? ` · ${drivingSessionStartedAt}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "#a8d8ff", marginTop: 2 }}>
          Cảnh báo: 📱 {sessionAlertCounts?.phone ?? 0} · 🚬{" "}
          {sessionAlertCounts?.smoking ?? 0} · 😴 {sessionAlertCounts?.drowsy ?? 0}
        </div>
        <button type="button" onClick={handleToggleLog} style={{
          marginTop: 6, fontSize: 11, padding: "4px 10px", borderRadius: 4,
          border: "1px solid rgba(100,180,255,0.5)",
          background: "rgba(10,40,70,0.85)", color: "#cfe8ff", cursor: "pointer",
        }}>
          {sessionLogOpen ? "Ẩn lịch sử phiên" : "Lịch sử phiên (fleet demo)"}
        </button>

        {sessionLogOpen && (
          <div style={{
            marginTop: 8, maxHeight: 180, overflow: "auto", fontSize: 10,
            color: "#9ecfff", fontFamily: "monospace", lineHeight: 1.45,
            background: "rgba(0,20,40,0.5)", padding: 8, borderRadius: 4,
          }}>
            {sessionLogLoading ? (
              <span>Đang tải…</span>
            ) : sessionLogItems.length === 0 ? (
              <span>Chưa có phiên nào.</span>
            ) : (
              sessionLogItems.map(s => (
                <div key={s.session_id} style={{ marginBottom: 6 }}>
                  #{s.session_id} {s.started_at} → {s.ended_at || "…"} ·{" "}
                  {Object.entries(s.alerts || {}).map(([k, v]) => `${k}:${v}`).join(" ")}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {SMOKING_ENABLED && (
        <div style={{
          fontSize: 13,
          color: smokingIconActive ? "#ff6040" : "#3b9eff",
          fontWeight: 500,
        }}>
          Smoking :{" "}
          {smokingIconActive
            ? `⚠ YES (${smokingSecRef?.current?.toFixed(0) ?? 0}s)`
            : smokingResult ? "NO" : "..."}
        </div>
      )}
      {SMOKING_ENABLED && smokingError && (
        <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 500 }}>
          Smoking API error
        </div>
      )}
    </div>
  );
}
