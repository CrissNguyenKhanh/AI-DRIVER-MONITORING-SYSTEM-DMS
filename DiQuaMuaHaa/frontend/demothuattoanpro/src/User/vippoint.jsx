import React, { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertTriangle, Clock, User } from "lucide-react";
import { getMedicalApiBase } from "../shared/constants/apiEndpoints";

const MedicalRecordConfirmation = () => {
  const [records, setRecords] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actualDiagnosis, setActualDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    if (currentUser.id) {
      loadRecords();
      loadDiagnoses();
    }
  }, []);

  const loadRecords = async () => {
    try {
      const response = await fetch(
        `${getMedicalApiBase()}/api/records/${currentUser.id}`
      );
      const data = await response.json();
      if (data.success) {
        setRecords(data.records);
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading records:", error);
      setIsLoading(false);
    }
  };

  const loadDiagnoses = async () => {
    try {
      const response = await fetch(`${getMedicalApiBase()}/api/ai/diagnoses`);
      const data = await response.json();
      if (data.success) {
        setDiagnoses(data.diagnoses);
      }
    } catch (error) {
      console.error("Error loading diagnoses:", error);
    }
  };

  const handleConfirm = async () => {
    if (!selectedRecord || !actualDiagnosis) {
      setMessage({
        type: "error",
        text: "Vui lòng chọn chẩn đoán thực tế!",
      });
      return;
    }

    try {
      const response = await fetch(
        `${getMedicalApiBase()}/api/records/${selectedRecord.id}/confirm`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actual_diagnosis: actualDiagnosis,
            doctor_id: currentUser.id,
            notes: notes,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: "✅ Đã xác nhận chẩn đoán thành công!",
        });
        setSelectedRecord(null);
        setActualDiagnosis("");
        setNotes("");
        loadRecords();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Có lỗi xảy ra",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Lỗi kết nối server: " + error.message,
      });
    }
  };

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  const unconfirmedRecords = records.filter((r) => !r.confirmed);
  const confirmedRecords = records.filter((r) => r.confirmed);

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.iconContainer}>
            <CheckCircle size={40} color="white" />
          </div>
          <h1 style={styles.title}>Xác Nhận Chẩn Đoán</h1>
          <p style={styles.subtitle}>
            Xác nhận chẩn đoán thực tế để cải thiện độ chính xác AI
          </p>
        </div>

        {/* Message */}
        {message && (
          <div
            style={{
              ...styles.message,
              ...(message.type === "success"
                ? styles.messageSuccess
                : styles.messageError),
            }}
          >
            {message.type === "success" ? (
              <CheckCircle size={20} />
            ) : (
              <XCircle size={20} />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Stats */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <Clock size={32} color="#f59e0b" />
            <div>
              <div style={styles.statValue}>{unconfirmedRecords.length}</div>
              <div style={styles.statLabel}>Chờ xác nhận</div>
            </div>
          </div>
          <div style={styles.statCard}>
            <CheckCircle size={32} color="#10b981" />
            <div>
              <div style={styles.statValue}>{confirmedRecords.length}</div>
              <div style={styles.statLabel}>Đã xác nhận</div>
            </div>
          </div>
          <div style={styles.statCard}>
            <User size={32} color="#3b82f6" />
            <div>
              <div style={styles.statValue}>{records.length}</div>
              <div style={styles.statLabel}>Tổng bệnh án</div>
            </div>
          </div>
        </div>

        {/* Unconfirmed Records */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            ⚠️ Bệnh án chờ xác nhận ({unconfirmedRecords.length})
          </h2>
          {unconfirmedRecords.length === 0 ? (
            <div style={styles.emptyState}>
              <CheckCircle size={48} color="#10b981" />
              <p style={styles.emptyText}>Không có bệnh án nào cần xác nhận</p>
            </div>
          ) : (
            <div style={styles.recordsGrid}>
              {unconfirmedRecords.map((record) => (
                <div
                  key={record.id}
                  style={{
                    ...styles.recordCard,
                    ...(selectedRecord?.id === record.id
                      ? styles.recordCardSelected
                      : {}),
                  }}
                  onClick={() => {
                    setSelectedRecord(record);
                    setActualDiagnosis(record.diagnosis);
                  }}
                >
                  <div style={styles.recordHeader}>
                    <span style={styles.recordId}>#{record.id}</span>
                    <span style={styles.recordDate}>
                      {new Date(record.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <div style={styles.recordBody}>
                    <div style={styles.recordRow}>
                      <strong>Triệu chứng:</strong>
                      <span>{record.symptoms.join(", ")}</span>
                    </div>
                    <div style={styles.recordRow}>
                      <strong>AI dự đoán:</strong>
                      <span style={styles.aiPrediction}>
                        {record.diagnosis}
                      </span>
                    </div>
                    <div style={styles.recordRow}>
                      <strong>Độ tin cậy:</strong>
                      <span>{(record.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div style={styles.recordRow}>
                      <strong>Thông tin:</strong>
                      <span>
                        {record.age} tuổi, {record.gender}
                      </span>
                    </div>
                  </div>
                  <div style={styles.recordFooter}>
                    <AlertTriangle size={16} color="#f59e0b" />
                    <span style={styles.warningText}>
                      Cần xác nhận từ bác sĩ
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirmation Form */}
        {selectedRecord && (
          <div style={styles.confirmForm}>
            <h2 style={styles.formTitle}>
              Xác nhận chẩn đoán cho bệnh án #{selectedRecord.id}
            </h2>

            <div style={styles.comparisonRow}>
              <div style={styles.comparisonBox}>
                <div style={styles.comparisonLabel}>🤖 AI dự đoán</div>
                <div style={styles.comparisonValue}>
                  {selectedRecord.diagnosis}
                </div>
                <div style={styles.comparisonMeta}>
                  Độ tin cậy: {(selectedRecord.confidence * 100).toFixed(1)}%
                </div>
              </div>
              <div style={styles.comparisonArrow}>→</div>
              <div style={styles.comparisonBox}>
                <div style={styles.comparisonLabel}>👨‍⚕️ Chẩn đoán thực tế</div>
                <select
                  value={actualDiagnosis}
                  onChange={(e) => setActualDiagnosis(e.target.value)}
                  style={styles.select}
                >
                  <option value="">-- Chọn chẩn đoán --</option>
                  {diagnoses.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Ghi chú bổ sung (tùy chọn)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Thêm ghi chú về chẩn đoán..."
                style={styles.textarea}
              />
            </div>

            <div style={styles.buttonGroup}>
              <button onClick={handleConfirm} style={styles.confirmButton}>
                <CheckCircle size={20} />
                Xác nhận chẩn đoán
              </button>
              <button
                onClick={() => {
                  setSelectedRecord(null);
                  setActualDiagnosis("");
                  setNotes("");
                }}
                style={styles.cancelButton}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Confirmed Records */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            ✅ Bệnh án đã xác nhận ({confirmedRecords.length})
          </h2>
          {confirmedRecords.length === 0 ? (
            <div style={styles.emptyState}>
              <AlertTriangle size={48} color="#f59e0b" />
              <p style={styles.emptyText}>Chưa có bệnh án nào được xác nhận</p>
            </div>
          ) : (
            <div style={styles.recordsGrid}>
              {confirmedRecords.map((record) => (
                <div key={record.id} style={styles.confirmedCard}>
                  <div style={styles.recordHeader}>
                    <span style={styles.recordId}>#{record.id}</span>
                    <span style={{ ...styles.badge, ...styles.badgeSuccess }}>
                      <CheckCircle size={14} />
                      Đã xác nhận
                    </span>
                  </div>
                  <div style={styles.recordBody}>
                    <div style={styles.recordRow}>
                      <strong>Chẩn đoán:</strong>
                      <span style={styles.actualDiagnosis}>
                        {record.actual_diagnosis || record.diagnosis}
                      </span>
                    </div>
                    <div style={styles.recordRow}>
                      <strong>Ngày xác nhận:</strong>
                      <span>
                        {record.confirmed_at
                          ? new Date(record.confirmed_at).toLocaleDateString(
                              "vi-VN"
                            )
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "24px",
  },
  maxWidth: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
  },
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid rgba(255,255,255,0.3)",
    borderTop: "4px solid white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  header: {
    textAlign: "center",
    marginBottom: "32px",
  },
  iconContainer: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "80px",
    height: "80px",
    background: "rgba(255,255,255,0.2)",
    backdropFilter: "blur(10px)",
    borderRadius: "20px",
    marginBottom: "16px",
  },
  title: {
    fontSize: "42px",
    fontWeight: "bold",
    color: "white",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "16px",
    color: "rgba(255,255,255,0.9)",
  },
  message: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "24px",
  },
  messageSuccess: {
    background: "#dcfce7",
    color: "#15803d",
    border: "2px solid #86efac",
  },
  messageError: {
    background: "#fee2e2",
    color: "#dc2626",
    border: "2px solid #fca5a5",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "16px",
    marginBottom: "32px",
  },
  statCard: {
    background: "white",
    borderRadius: "16px",
    padding: "24px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  },
  statValue: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#1f2937",
  },
  statLabel: {
    fontSize: "14px",
    color: "#6b7280",
  },
  section: {
    marginBottom: "32px",
  },
  sectionTitle: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "white",
    marginBottom: "16px",
  },
  emptyState: {
    background: "white",
    borderRadius: "16px",
    padding: "48px",
    textAlign: "center",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  },
  emptyText: {
    color: "#6b7280",
    marginTop: "16px",
    fontSize: "16px",
  },
  recordsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
    gap: "16px",
  },
  recordCard: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    transition: "all 0.3s",
    border: "2px solid transparent",
  },
  recordCardSelected: {
    border: "2px solid #3b82f6",
    boxShadow: "0 4px 12px rgba(59,130,246,0.3)",
  },
  recordHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e5e7eb",
  },
  recordId: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#6b7280",
  },
  recordDate: {
    fontSize: "13px",
    color: "#9ca3af",
  },
  recordBody: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "12px",
  },
  recordRow: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "14px",
  },
  aiPrediction: {
    color: "#3b82f6",
    fontWeight: "600",
  },
  recordFooter: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingTop: "12px",
    borderTop: "1px solid #e5e7eb",
  },
  warningText: {
    fontSize: "13px",
    color: "#f59e0b",
    fontWeight: "500",
  },
  confirmForm: {
    background: "white",
    borderRadius: "16px",
    padding: "32px",
    marginBottom: "32px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  },
  formTitle: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: "24px",
  },
  comparisonRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: "16px",
    marginBottom: "24px",
    alignItems: "center",
  },
  comparisonBox: {
    padding: "20px",
    background: "#f9fafb",
    borderRadius: "12px",
    border: "2px solid #e5e7eb",
  },
  comparisonLabel: {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "8px",
  },
  comparisonValue: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: "8px",
  },
  comparisonMeta: {
    fontSize: "13px",
    color: "#9ca3af",
  },
  comparisonArrow: {
    fontSize: "32px",
    color: "#3b82f6",
    fontWeight: "bold",
  },
  select: {
    width: "100%",
    padding: "12px",
    border: "2px solid #e5e7eb",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    color: "#1f2937",
    outline: "none",
  },
  formGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "8px",
  },
  textarea: {
    width: "100%",
    height: "100px",
    padding: "12px",
    border: "2px solid #e5e7eb",
    borderRadius: "8px",
    fontSize: "14px",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  buttonGroup: {
    display: "flex",
    gap: "12px",
  },
  confirmButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "14px",
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  cancelButton: {
    padding: "14px 24px",
    background: "#f3f4f6",
    color: "#6b7280",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  confirmedCard: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    border: "2px solid #10b981",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "600",
  },
  badgeSuccess: {
    background: "#dcfce7",
    color: "#15803d",
  },
  actualDiagnosis: {
    color: "#10b981",
    fontWeight: "600",
  },
};

export default MedicalRecordConfirmation;
