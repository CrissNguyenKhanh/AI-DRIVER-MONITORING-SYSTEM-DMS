import { useEffect, useState, useCallback } from "react";
import { listDrivingSessions } from "../utils/drivingSessionApi";
import { getDmsApiBase } from "../config/apiEndpoints";

const API_BASE = getDmsApiBase();

const ALERT_LABELS = {
  drowsy: "Buồn ngủ",
  yawn: "Ngáp",
  phone: "Dùng điện thoại",
  smoking: "Hút thuốc",
};

function formatDuration(startedAt, endedAt) {
  if (!startedAt) return "—";
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end - start;
  if (isNaN(diffMs) || diffMs < 0) return "—";
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}g ${m}p`;
  }
  return mins > 0 ? `${mins}p ${secs}s` : `${secs}s`;
}

function formatDateTime(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

function StatusBadge({ ended }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 8px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 600,
        background: ended
          ? "rgba(100,116,139,0.15)"
          : "rgba(34,197,94,0.15)",
        color: ended ? "#94a3b8" : "#22c55e",
        border: `1px solid ${ended ? "rgba(100,116,139,0.3)" : "rgba(34,197,94,0.3)"}`,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: ended ? "#64748b" : "#22c55e",
          boxShadow: ended ? "none" : "0 0 5px #22c55e",
        }}
      />
      {ended ? "Đã kết thúc" : "Đang chạy"}
    </span>
  );
}

function AlertSummary({ alerts }) {
  if (!alerts || typeof alerts !== "object") return <span style={{ color: "#475569" }}>—</span>;
  const entries = Object.entries(alerts).filter(([, v]) => v > 0);
  if (entries.length === 0) return <span style={{ color: "#22c55e", fontSize: "12px" }}>Không có cảnh báo</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {entries.map(([key, count]) => (
        <span
          key={key}
          style={{
            padding: "2px 7px",
            borderRadius: "10px",
            fontSize: "11px",
            background: "rgba(239,68,68,0.12)",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          {ALERT_LABELS[key] || key}: {count}
        </span>
      ))}
    </div>
  );
}

export default function DrivingSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(30);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, data } = await listDrivingSessions(API_BASE, { limit });
      if (ok && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
      } else if (ok && Array.isArray(data)) {
        setSessions(data);
      } else {
        setError("Không thể tải dữ liệu. Kiểm tra kết nối tới backend DMS.");
      }
    } catch (e) {
      setError("Lỗi kết nối: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const totalAlerts = sessions.reduce((sum, s) => {
    if (!s.alerts || typeof s.alerts !== "object") return sum;
    return sum + Object.values(s.alerts).reduce((a, b) => a + (b || 0), 0);
  }, 0);

  const activeSessions = sessions.filter((s) => !s.ended_at).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        color: "#e2e8f0",
        padding: "32px 28px",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#e2e8f0",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Lịch sử lái xe
        </h1>
        <p style={{ color: "#64748b", fontSize: "13px", margin: "6px 0 0" }}>
          Danh sách các phiên lái xe và cảnh báo được ghi nhận
        </p>
      </div>

      {/* Stats cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "14px",
          marginBottom: "24px",
        }}
      >
        {[
          { label: "Tổng phiên", value: sessions.length, color: "#6366f1" },
          { label: "Đang hoạt động", value: activeSessions, color: "#22c55e" },
          { label: "Tổng cảnh báo", value: totalAlerts, color: "#ef4444" },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: "linear-gradient(135deg, #1e293b, #0f172a)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: "12px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "26px", fontWeight: 700, color: card.color }}>
              {loading ? "—" : card.value}
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ color: "#94a3b8", fontSize: "13px" }}>Hiển thị:</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{
              background: "#1e293b",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: "6px",
              color: "#e2e8f0",
              padding: "5px 10px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {[10, 30, 50, 100].map((n) => (
              <option key={n} value={n}>{n} phiên</option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          style={{
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.4)",
            borderRadius: "8px",
            color: "#a5b4fc",
            padding: "7px 16px",
            fontSize: "13px",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            opacity: loading ? 0.6 : 1,
            transition: "background 0.2s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Làm mới
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              border: "3px solid rgba(99,102,241,0.2)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Đang tải dữ liệu...
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: "10px",
            padding: "16px 20px",
            color: "#fca5a5",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "#475569",
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth={1.5} style={{ margin: "0 auto 12px", display: "block" }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Chưa có phiên lái xe nào được ghi nhận.
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, #1e293b, #0f172a)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(99,102,241,0.2)" }}>
                  {["#", "Tài xế", "Bắt đầu", "Kết thúc", "Thời lượng", "Cảnh báo", "Trạng thái"].map(
                    (col) => (
                      <th
                        key={col}
                        style={{
                          padding: "12px 16px",
                          textAlign: "left",
                          color: "#64748b",
                          fontWeight: 600,
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => (
                  <tr
                    key={s.id || idx}
                    style={{
                      borderBottom: "1px solid rgba(30,41,59,0.8)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(99,102,241,0.05)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={{ padding: "12px 16px", color: "#475569" }}>
                      {s.id || idx + 1}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#94a3b8" }}>
                      {s.driver_id || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {formatDateTime(s.started_at)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {formatDateTime(s.ended_at)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                      {formatDuration(s.started_at, s.ended_at)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <AlertSummary alerts={s.alerts} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusBadge ended={!!s.ended_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
