import { useDmsContext } from "../../context/DmsContext";

/**
 * StatusBar — bottom bar hiển thị REC/STANDBY, WS, identity, nút Start/Stop.
 * Props:
 *   startWebcam — callback
 *   stopWebcam  — callback
 */
export default function StatusBar({ startWebcam, stopWebcam }) {
  const {
    status, frameCount, lastUpdated, wsConnected,
    identityOwner, identityHasRegistered, identityError, apiError,
  } = useDmsContext();

  const statusLabel =
    status === "active" ? "REC ACTIVE" :
    status === "auth"   ? "AUTH"       :
    status === "locked" ? "ENGINE OFF" : "STANDBY";

  const identityLabel = identityHasRegistered
    ? identityOwner === true  ? "OWNER"   :
      identityOwner === false ? "INTRUDER": "CHECK"
    : "NO_REG";

  const idColor =
    identityOwner === true ? "#00e578" : identityOwner === false ? "#ff4560" : "#ffc940";

  return (
    <div style={{
      flexShrink: 0, height: 32, background: "#030810",
      borderTop: "1px solid #0d1e30", display: "flex",
      alignItems: "center", justifyContent: "space-between", padding: "0 14px",
    }}>
      <div style={{
        display: "flex", gap: 14, fontSize: 9, color: "#2a4a68",
        letterSpacing: "0.08em", alignItems: "center",
      }}>
        <span>● {statusLabel}</span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span>{frameCount} frames</span>
        {lastUpdated && <span>| Last: {lastUpdated}</span>}
        <span style={{ color: wsConnected ? "#00e578" : "#ff4560" }}>
          {wsConnected ? "● WS" : "○ WS"}
        </span>
        <span style={{ color: idColor }}>ID:{identityLabel}</span>
        {apiError    && <span style={{ color: "#ff4560" }}>⚠ {apiError.slice(0, 28)}</span>}
        {identityError && <span style={{ color: "#ff4560" }}>⚠ ID {identityError.slice(0, 24)}</span>}
      </div>

      <div>
        {status === "active" || status === "auth" || status === "locked" ? (
          <button onClick={stopWebcam} style={{
            padding: "2px 14px", background: "rgba(255,69,96,0.07)",
            border: "1px solid rgba(255,69,96,0.3)", color: "#ff4560",
            fontSize: 9, cursor: "pointer", borderRadius: 3,
          }}>■ Stop</button>
        ) : (
          <button onClick={startWebcam} disabled={status === "loading"} style={{
            padding: "2px 14px", background: "rgba(60,200,100,0.07)",
            border: "1px solid rgba(60,200,100,0.3)", color: "#00e578",
            fontSize: 9, cursor: "pointer", borderRadius: 3,
            opacity: status === "loading" ? 0.5 : 1,
          }}>▶ Start</button>
        )}
      </div>
    </div>
  );
}
