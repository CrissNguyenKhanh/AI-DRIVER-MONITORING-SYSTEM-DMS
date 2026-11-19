import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createEnrollmentSubmissionManager,
  getStoredDmsDriver,
  validateDriverId,
} from "../utils/authApi.js";
import "./DmsAuth.css";

export default function DmsEnrollmentPanel({
  apiBase,
  initialMessage = "",
  onAuthenticated,
}) {
  const [driverId, setDriverId] = useState(() => getStoredDmsDriver());
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(() =>
    initialMessage ? { type: "error", message: initialMessage } : null,
  );
  const managerRef = useRef(null);
  if (!managerRef.current) managerRef.current = createEnrollmentSubmissionManager();

  useEffect(() => () => managerRef.current?.cancel(), []);

  async function submit(event) {
    event.preventDefault();
    if (submitting || managerRef.current.pending) return;
    if (!validateDriverId(driverId)) {
      setStatus({
        type: "error",
        message: "Driver ID dài 1–64 ký tự và chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
      });
      return;
    }
    if (!enrollmentCode.trim()) {
      setStatus({ type: "error", message: "Nhập Enrollment Code do quản trị viên cấp." });
      return;
    }
    setSubmitting(true);
    setStatus({ type: "info", message: "Đang xác thực mã một lần…" });
    try {
      const result = await managerRef.current.submit(apiBase, {
        driverId,
        enrollmentCode,
      });
      if (!result.ok) {
        setStatus({ type: "error", message: result.message });
        return;
      }
      setEnrollmentCode("");
      setStatus({ type: "success", message: result.message });
      onAuthenticated?.(result.principal);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setStatus({ type: "error", message: "Yêu cầu đã bị gián đoạn. Hãy thử lại." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="dms-auth-shell">
      <section className="dms-auth-card" aria-labelledby="dms-enrollment-title">
        <p style={{ color: "#5eead4", fontWeight: 800 }}>DMS DRIVER ACCESS</p>
        <h1 id="dms-enrollment-title">Đăng nhập tài xế</h1>
        <p>Enrollment Code chỉ cần dùng khi tạo lại phiên. Nếu phiên còn hợp lệ, hệ thống sẽ tự kiểm tra và không hỏi mã lại.</p>
        <ol className="dms-auth-steps">
          <li>Nhập đúng Driver ID đã đăng ký với quản trị viên.</li>
          <li>Nhập mã một lần còn hạn.</li>
          <li>Sau khi đăng nhập, đăng ký hoặc xác minh khuôn mặt ở bước riêng.</li>
        </ol>
        <form onSubmit={submit} noValidate>
          <label className="dms-auth-field">
            <span>Driver ID</span>
            <input
              name="driverId"
              autoComplete="username"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              disabled={submitting}
              aria-describedby="driver-id-help"
              autoFocus
            />
            <small id="driver-id-help">Không tự thay đổi khi bạn xóa nội dung.</small>
          </label>
          <label className="dms-auth-field">
            <span>Enrollment Code</span>
            <div className="dms-auth-input-row">
              <input
                name="enrollmentCode"
                type={showCode ? "text" : "password"}
                autoComplete="one-time-code"
                value={enrollmentCode}
                onChange={(event) => setEnrollmentCode(event.target.value)}
                disabled={submitting}
              />
              <button
                className="dms-auth-button secondary"
                type="button"
                onClick={() => setShowCode((value) => !value)}
                aria-pressed={showCode}
              >
                {showCode ? "Ẩn mã" : "Hiện mã"}
              </button>
            </div>
          </label>
          <div className="dms-auth-actions">
            <button className="dms-auth-button" type="submit" disabled={submitting}>
              {submitting ? "Đang xác thực…" : "Đăng nhập DMS"}
            </button>
          </div>
        </form>
        {status && (
          <div className={`dms-auth-status ${status.type}`} role="status" aria-live="polite">
            {status.message}
          </div>
        )}
        <p>
          Không có mã hoặc mã đã hết hạn? Liên hệ quản trị viên để nhận mã mới.
          {" "}<Link className="dms-auth-link" to="/dms/admin/enrollment">Khu vực cấp mã quản trị</Link>
        </p>
      </section>
    </main>
  );
}
