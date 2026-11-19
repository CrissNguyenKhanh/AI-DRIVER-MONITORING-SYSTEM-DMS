import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getDmsApiBase } from "../config/apiEndpoints.js";
import {
  createDmsAdminSession,
  createDriverEnrollmentCode,
  validateDriverId,
} from "../utils/authApi.js";
import "./DmsAuth.css";

const API_BASE = getDmsApiBase();

export default function DmsAdminEnrollment() {
  const adminTokenRef = useRef("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [driverId, setDriverId] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState(null);
  const [status, setStatus] = useState(null);

  async function authenticate(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setStatus({ type: "info", message: "Đang xác thực quản trị viên…" });
    try {
      const result = await createDmsAdminSession(API_BASE, bootstrapSecret);
      setBootstrapSecret("");
      if (!result.ok || !result.data?.access_token) {
        adminTokenRef.current = "";
        setAuthenticated(false);
        setStatus({ type: "error", message: result.message });
        return;
      }
      adminTokenRef.current = result.data.access_token;
      setAuthenticated(true);
      setStatus({ type: "success", message: result.message });
    } finally {
      setLoading(false);
    }
  }

  async function issueCode(event) {
    event.preventDefault();
    if (loading) return;
    if (!validateDriverId(driverId)) {
      setStatus({ type: "error", message: "Driver ID không hợp lệ." });
      return;
    }
    setIssued(null);
    setLoading(true);
    setStatus({ type: "info", message: "Đang tạo mã một lần…" });
    try {
      const result = await createDriverEnrollmentCode(API_BASE, {
        adminToken: adminTokenRef.current,
        driverId,
      });
      if (!result.ok) {
        if (result.status === 401 || result.status === 403) {
          adminTokenRef.current = "";
          setAuthenticated(false);
        }
        setStatus({ type: "error", message: result.message });
        return;
      }
      setIssued(result.data);
      setStatus({ type: "success", message: result.message });
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!issued?.enrollment_code) return;
    try {
      await navigator.clipboard.writeText(issued.enrollment_code);
      setStatus({ type: "success", message: "Đã sao chép mã. Không dán mã vào URL hoặc log." });
    } catch {
      setStatus({ type: "error", message: "Không thể sao chép tự động. Hãy chọn và sao chép thủ công." });
    }
  }

  return (
    <main className="dms-auth-shell">
      <section className="dms-auth-card" aria-labelledby="dms-admin-title">
        <p style={{ color: "#facc15", fontWeight: 800 }}>DMS ADMIN · SENSITIVE</p>
        <h1 id="dms-admin-title">Cấp Enrollment Code</h1>
        <p>Bootstrap secret và admin token chỉ nằm trong bộ nhớ của tab này, không được lưu vào URL, localStorage hoặc sessionStorage.</p>
        {!authenticated ? (
          <form onSubmit={authenticate}>
            <label className="dms-auth-field">
              <span>Bootstrap secret</span>
              <input
                type="password"
                autoComplete="off"
                value={bootstrapSecret}
                onChange={(event) => setBootstrapSecret(event.target.value)}
                disabled={loading}
              />
            </label>
            <button className="dms-auth-button" type="submit" disabled={loading || !bootstrapSecret}>
              {loading ? "Đang xác thực…" : "Xác thực quản trị viên"}
            </button>
          </form>
        ) : (
          <form onSubmit={issueCode}>
            <label className="dms-auth-field">
              <span>Driver ID cần cấp mã</span>
              <input value={driverId} onChange={(event) => setDriverId(event.target.value)} disabled={loading} autoFocus />
            </label>
            <button className="dms-auth-button" type="submit" disabled={loading}>
              {loading ? "Đang tạo mã…" : "Tạo mã một lần"}
            </button>
          </form>
        )}
        {issued && (
          <div style={{ marginTop: 18 }}>
            <div className="dms-admin-code" aria-label="Enrollment Code được cấp">{issued.enrollment_code}</div>
            <p>Driver: <strong>{issued.driver_id}</strong><br />Hết hạn: <strong>{issued.expires_at}</strong></p>
            <button className="dms-auth-button secondary" type="button" onClick={copyCode}>Sao chép mã</button>
          </div>
        )}
        {status && <div className={`dms-auth-status ${status.type}`} role="status" aria-live="polite">{status.message}</div>}
        <p><Link className="dms-auth-link" to="/test5">Quay lại đăng nhập/đăng ký DMS</Link></p>
      </section>
    </main>
  );
}
