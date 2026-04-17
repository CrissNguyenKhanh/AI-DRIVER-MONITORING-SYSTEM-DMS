import React, { useState, useEffect } from "react";
import { Activity, AlertCircle, CheckCircle, TrendingUp, Users, Calendar, Save } from "lucide-react";
import { getMedicalApiBase } from "../../../shared/constants/apiEndpoints";

const MedicalDiagnosisAI = () => {
  const [formData, setFormData] = useState({
    symptoms: "",
    age: "",
    gender: "Nam",
    userId: 1, // Tạm thời hardcode, sau này lấy từ login
    notes: ""
  });
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [availableSymptoms, setAvailableSymptoms] = useState([]);
  const [statistics, setStatistics] = useState(null);

  useEffect(() => {
    fetchStatistics();
    fetchSymptoms();
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await fetch(`${getMedicalApiBase()}/api/statistics`);
      const data = await response.json();
      setStatistics(data);
    } catch (error) {
      console.error("Error fetching statistics:", error);
    }
  };

  const fetchSymptoms = async () => {
    try {
      const response = await fetch(`${getMedicalApiBase()}/api/ai/symptoms`);
      const data = await response.json();
      if (data.success) {
        setAvailableSymptoms(data.symptoms);
      }
    } catch (error) {
      console.error("Error fetching symptoms:", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAnalyze = async () => {
    if (!formData.symptoms.trim() || !formData.age) return;

    setIsAnalyzing(true);
    setResult(null);
    setSaveSuccess(false);

    try {
      const symptomsArray = formData.symptoms
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Gọi API /api/records để vừa predict vừa lưu luôn
      const response = await fetch(`${getMedicalApiBase()}/api/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: formData.userId,
          symptoms: symptomsArray,
          age: parseInt(formData.age),
          gender: formData.gender,
          notes: formData.notes || ""
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data.prediction);
        setSaveSuccess(true);
        
        // Refresh statistics sau khi thêm record mới
        setTimeout(() => {
          fetchStatistics();
        }, 500);
        
      } else {
        setResult({
          success: false,
          error: data.error || "Không thể phân tích",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        error: "Lỗi kết nối server: " + error.message,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      "Nhẹ": { bg: "#dcfce7", text: "#15803d", gradient: "linear-gradient(to right, #22c55e, #10b981)" },
      "Trung bình": { bg: "#fef3c7", text: "#b45309", gradient: "linear-gradient(to right, #f59e0b, #eab308)" },
      "Nặng": { bg: "#fee2e2", text: "#dc2626", gradient: "linear-gradient(to right, #ef4444, #f97316)" },
    };
    return colors[severity] || colors["Trung bình"];
  };

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.iconContainer}>
            <Activity style={styles.icon} />
          </div>
          <h1 style={styles.title}>AI Chẩn Đoán Bệnh</h1>
          <p style={styles.subtitle}>
            Hệ thống chẩn đoán thông minh với thuật toán Naive Bayes
          </p>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>
                <Users size={24} color="#3b82f6" />
              </div>
              <div>
                <div style={styles.statValue}>{statistics.totalPatients || 0}</div>
                <div style={styles.statLabel}>Tổng số bệnh nhân</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>
                <TrendingUp size={24} color="#10b981" />
              </div>
              <div>
                <div style={styles.statValue}>
                  {statistics.diagnosisStats?.length || 0}
                </div>
                <div style={styles.statLabel}>Loại bệnh</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>
                <Calendar size={24} color="#f59e0b" />
              </div>
              <div>
                <div style={styles.statValue}>
                  {statistics.trends?.length || 0}
                </div>
                <div style={styles.statLabel}>Ngày hoạt động</div>
              </div>
            </div>
          </div>
        )}

        {/* Save Success Banner */}
        {saveSuccess && (
          <div style={styles.successBanner}>
            <Save size={20} />
            <span>✅ Đã lưu kết quả vào hồ sơ bệnh án</span>
          </div>
        )}

        {/* Main Form Card */}
        <div style={styles.mainCard}>
          <h2 style={styles.cardTitle}>Nhập thông tin triệu chứng</h2>

          <div style={styles.formGroup}>
            <label style={styles.label}>Triệu chứng *</label>
            <textarea
              name="symptoms"
              value={formData.symptoms}
              onChange={handleInputChange}
              placeholder="Nhập các triệu chứng, cách nhau bởi dấu phẩy
VD: đau đầu, sốt, ho, mệt mỏi"
              style={styles.textarea}
            />
            {availableSymptoms.length > 0 && (
              <div style={styles.hint}>
                <small style={styles.hintText}>
                  Gợi ý: {availableSymptoms.slice(0, 5).join(", ")}...
                </small>
              </div>
            )}
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Tuổi *</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleInputChange}
                placeholder="Nhập tuổi"
                min="1"
                max="120"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Giới tính *</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleInputChange}
                style={styles.input}
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Ghi chú (tùy chọn)</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Thêm ghi chú về triệu chứng, tiền sử bệnh..."
              style={{...styles.textarea, height: "80px"}}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={
              !formData.symptoms.trim() || !formData.age || isAnalyzing
            }
            style={{
              ...styles.analyzeButton,
              ...(!formData.symptoms.trim() || !formData.age || isAnalyzing
                ? styles.analyzeButtonDisabled
                : {}),
            }}
          >
            {isAnalyzing ? (
              <>
                <div style={styles.spinner}></div>
                Đang phân tích và lưu...
              </>
            ) : (
              <>
                <Activity style={styles.buttonIcon} />
                Chẩn đoán & Lưu hồ sơ
              </>
            )}
          </button>
        </div>

        {/* Result Card */}
        {result && (
          <div style={styles.resultCard}>
            {result.success ? (
              <>
                <div style={styles.resultHeader}>
                  <div
                    style={{
                      ...styles.resultIcon,
                      background: getSeverityColor(result.severity).gradient,
                    }}
                  >
                    <CheckCircle style={styles.resultIconSvg} />
                  </div>
                  <div style={styles.resultHeaderText}>
                    <h3 style={styles.resultTitle}>Kết quả chẩn đoán</h3>
                    <p style={styles.resultSubtitle}>
                      Dựa trên thuật toán Naive Bayes
                    </p>
                  </div>
                </div>

                <div style={styles.resultBody}>
                  {/* Diagnosis */}
                  <div style={styles.resultSection}>
                    <div style={styles.resultLabel}>🏥 Chẩn đoán</div>
                    <div style={styles.diagnosisBox}>
                      {result.diagnosis || "Không xác định"}
                    </div>
                  </div>

                  {/* Severity */}
                  <div style={styles.resultSection}>
                    <div style={styles.resultLabel}>⚠️ Mức độ</div>
                    <div
                      style={{
                        ...styles.severityBadge,
                        backgroundColor: getSeverityColor(result.severity).bg,
                        color: getSeverityColor(result.severity).text,
                      }}
                    >
                      {result.severity}
                    </div>
                  </div>

                  {/* Confidence */}
                  <div style={styles.resultSection}>
                    <div style={styles.confidenceRow}>
                      <span style={styles.resultLabel}>📊 Độ tin cậy</span>
                      <span style={styles.confidenceValue}>
                        {(result.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={styles.progressBar}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${result.confidence * 100}%`,
                          background: getSeverityColor(result.severity).gradient,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {result.recommendations && (
                    <div style={styles.recommendationBox}>
                      <div style={styles.recommendationTitle}>
                        💡 Khuyến nghị
                      </div>
                      <ul style={styles.recommendationList}>
                        {result.recommendations.map((rec, idx) => (
                          <li key={idx} style={styles.recommendationItem}>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Warning */}
                  <div style={styles.warningBox}>
                    <AlertCircle size={16} />
                    <span style={styles.warningText}>
                      Kết quả chỉ mang tính tham khảo. Vui lòng đến cơ sở y tế
                      để được khám chính xác.
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div style={styles.errorBox}>
                <AlertCircle size={32} color="#dc2626" />
                <p style={styles.errorText}>
                  {result.error || "Đã xảy ra lỗi"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <p>🤖 Sử dụng thuật toán Naive Bayes với Machine Learning</p>
          <p style={styles.footerSecond}>
            Độ chính xác phụ thuộc vào dữ liệu huấn luyện từ hệ thống
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
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
    maxWidth: "900px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: "32px",
    color: "white",
  },
  iconContainer: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "80px",
    height: "80px",
    background: "rgba(255, 255, 255, 0.2)",
    backdropFilter: "blur(10px)",
    borderRadius: "20px",
    marginBottom: "16px",
    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
  },
  icon: {
    width: "40px",
    height: "40px",
    color: "white",
  },
  title: {
    fontSize: "42px",
    fontWeight: "bold",
    marginBottom: "8px",
    color: "white",
    textShadow: "0 2px 10px rgba(0,0,0,0.2)",
  },
  subtitle: {
    fontSize: "16px",
    color: "rgba(255, 255, 255, 0.9)",
  },
  successBanner: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontWeight: "600",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    animation: "slideDown 0.5s ease-out",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "16px",
    marginBottom: "24px",
  },
  statCard: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  statIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    backgroundColor: "#f3f4f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#1f2937",
  },
  statLabel: {
    fontSize: "13px",
    color: "#6b7280",
  },
  mainCard: {
    backgroundColor: "white",
    borderRadius: "24px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    padding: "32px",
    marginBottom: "24px",
  },
  cardTitle: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: "24px",
  },
  formGroup: {
    marginBottom: "20px",
    flex: 1,
  },
  formRow: {
    display: "flex",
    gap: "16px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "8px",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    border: "2px solid #e5e7eb",
    borderRadius: "12px",
    fontSize: "16px",
    color: "#374151",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  textarea: {
    width: "100%",
    height: "120px",
    padding: "12px 16px",
    border: "2px solid #e5e7eb",
    borderRadius: "12px",
    fontSize: "16px",
    color: "#374151",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  hint: {
    marginTop: "8px",
  },
  hintText: {
    color: "#6b7280",
    fontSize: "13px",
  },
  analyzeButton: {
    width: "100%",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    fontWeight: "600",
    padding: "16px",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    boxShadow: "0 4px 14px 0 rgba(102, 126, 234, 0.4)",
    transition: "all 0.3s",
  },
  analyzeButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  buttonIcon: {
    width: "20px",
    height: "20px",
    marginRight: "8px",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid transparent",
    borderBottomColor: "white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginRight: "8px",
  },
  resultCard: {
    backgroundColor: "white",
    borderRadius: "24px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    padding: "32px",
    animation: "fadeIn 0.5s ease-out",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    marginBottom: "24px",
    paddingBottom: "24px",
    borderBottom: "2px solid #f3f4f6",
  },
  resultIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 14px 0 rgba(102, 126, 234, 0.4)",
  },
  resultIconSvg: {
    width: "32px",
    height: "32px",
    color: "white",
  },
  resultHeaderText: {
    flex: 1,
  },
  resultTitle: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: "4px",
  },
  resultSubtitle: {
    fontSize: "14px",
    color: "#6b7280",
  },
  resultBody: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  resultSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  resultLabel: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#6b7280",
  },
  diagnosisBox: {
    padding: "16px",
    backgroundColor: "#f9fafb",
    borderRadius: "12px",
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1f2937",
    border: "2px solid #e5e7eb",
  },
  severityBadge: {
    display: "inline-block",
    padding: "8px 16px",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "600",
  },
  confidenceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  confidenceValue: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1f2937",
  },
  progressBar: {
    width: "100%",
    height: "12px",
    backgroundColor: "#e5e7eb",
    borderRadius: "999px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: "999px",
    transition: "width 1s ease-out",
  },
  recommendationBox: {
    padding: "20px",
    backgroundColor: "#eff6ff",
    borderRadius: "12px",
    border: "2px solid #dbeafe",
  },
  recommendationTitle: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: "12px",
  },
  recommendationList: {
    margin: 0,
    paddingLeft: "20px",
  },
  recommendationItem: {
    color: "#374151",
    marginBottom: "8px",
    lineHeight: "1.6",
  },
  warningBox: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px",
    backgroundColor: "#fef3c7",
    borderRadius: "12px",
    border: "2px solid #fde68a",
  },
  warningText: {
    fontSize: "14px",
    color: "#92400e",
    lineHeight: "1.5",
  },
  errorBox: {
    textAlign: "center",
    padding: "32px",
  },
  errorText: {
    color: "#dc2626",
    fontSize: "16px",
    marginTop: "16px",
  },
  footer: {
    textAlign: "center",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    marginTop: "32px",
  },
  footerSecond: {
    marginTop: "8px",
    opacity: 0.8,
  },
};

export default MedicalDiagnosisAI;