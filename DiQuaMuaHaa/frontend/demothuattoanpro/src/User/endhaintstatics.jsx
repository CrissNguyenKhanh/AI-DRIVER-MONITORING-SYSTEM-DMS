import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  Activity,
  TrendingUp,
  Brain,
  AlertCircle,
  Database,
  Shield,
  Thermometer,
} from "lucide-react";
import { getMedicalApiBase } from "../config/apiEndpoints";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#6366f1",
];

// Custom Tooltip hiển thị thông tin chi tiết khi hover
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: "white",
          padding: "12px",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        <p style={{ fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
          {label}
        </p>
        {payload.map((entry, index) => (
          <p key={index} style={{ fontSize: "14px", color: entry.color }}>
            {entry.name === "count" || entry.name === "value"
              ? "Số lượng"
              : entry.name}
            :
            <span style={{ fontWeight: "bold", marginLeft: "4px" }}>
              {entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const EnhancedPatientStatistics = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Chỉ gọi 1 API duy nhất đã có bên Backend
    fetch(`${getMedicalApiBase()}/api/statistics`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Lỗi kết nối đến server");
        }
        return response.json();
      })
      .then((data) => {
        setStats(data);
        setIsLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(
          "Không thể kết nối đến server. Hãy đảm bảo Backend đang chạy ở port 5000."
        );
        setIsLoading(false);
        console.error("Error:", err);
      });
  }, []);

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>AI đang phân tích dữ liệu bệnh nhân...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.error}>
        <AlertCircle size={48} color="#ef4444" />
        <h2 style={styles.errorTitle}>Lỗi kết nối</h2>
        <p style={styles.errorMessage}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={styles.retryButton}
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.iconContainer}>
            <Users size={40} color="white" />
          </div>
          <h1 style={styles.title}>Thống Kê Bệnh Nhân</h1>
          <p style={styles.subtitle}>
            Phân tích dữ liệu hồ sơ bệnh án từ hệ thống Medical AI
          </p>
        </div>

        {/* Data Source Banner */}
        <div style={styles.dataSourceBanner}>
          <div style={styles.bannerContent}>
            <Shield size={24} color="#10b981" />
            <div>
              <div style={styles.bannerTitle}>
                ✅ Dữ liệu hệ thống (System Data)
              </div>
              <div style={styles.bannerText}>
                Thống kê được tổng hợp trực tiếp từ cơ sở dữ liệu SQL theo thời
                gian thực.
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <Database size={32} color="#3b82f6" />
            <div>
              <h3 style={styles.summaryValue}>{stats.totalPatients}</h3>
              <p style={styles.summaryLabel}>Tổng hồ sơ</p>
            </div>
          </div>

          <div style={styles.summaryCard}>
            <Activity size={32} color="#10b981" />
            <div>
              <h3 style={styles.summaryValue}>
                {stats.diagnosisStats?.length || 0}
              </h3>
              <p style={styles.summaryLabel}>Loại bệnh lý</p>
            </div>
          </div>

          <div style={styles.summaryCard}>
            <TrendingUp size={32} color="#f59e0b" />
            <div>
              <h3 style={styles.summaryValue}>{stats.prediction || "N/A"}</h3>
              <p style={styles.summaryLabel}>Xu hướng tuần</p>
            </div>
          </div>

          <div style={styles.summaryCard}>
            <Brain size={32} color="#8b5cf6" />
            <div>
              <h3 style={styles.summaryValue}>Naive Bayes</h3>
              <p style={styles.summaryLabel}>Model AI</p>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div style={styles.chartsGrid}>
          {/* Diagnosis Chart (Pie) */}
          {stats.diagnosisStats && stats.diagnosisStats.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Phân bố Chẩn đoán</h2>
              <div style={{ width: "100%", height: 350 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={stats.diagnosisStats}
                      cx="50%"
                      cy="45%"
                      labelLine={false}
                      // Tính toán phần trăm hiển thị
                      label={({ name, percent }) =>
                        `${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.diagnosisStats.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{ paddingTop: "10px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Symptoms Chart (Bar) */}
          {stats.symptomStats && stats.symptomStats.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Triệu chứng phổ biến</h2>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart
                  data={stats.symptomStats}
                  margin={{ bottom: 40, top: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={70}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "#f3f4f6" }}
                    content={<CustomTooltip />}
                  />
                  <Bar
                    dataKey="value"
                    name="Số ca"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trends Chart (Line) - FIX: Dùng dataKey="date" và "count" khớp với Backend */}
          {stats.trends && stats.trends.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Xu hướng theo ngày</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={stats.trends}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="count" // Backend trả về 'count'
                    name="Số hồ sơ"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#8b5cf6" }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Gender Chart (Pie) */}
          {stats.genderStats && stats.genderStats.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Giới tính</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.genderStats}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {stats.genderStats.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? "#3B82F6" : "#EC4899"}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Severity Chart (Bar) */}
          {stats.severityStats && stats.severityStats.length > 0 && (
            <div style={styles.chartCard}>
              <h2 style={styles.chartTitle}>Mức độ nghiêm trọng</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.severityStats} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="value"
                    name="Số lượng"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    barSize={50}
                  >
                    {stats.severityStats.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "Nặng"
                            ? "#ef4444"
                            : entry.name === "Nhẹ"
                            ? "#10b981"
                            : "#f59e0b"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* AI Insights */}
        <div style={styles.insightsCard}>
          <div style={styles.insightsHeader}>
            <Brain size={24} color="#8b5cf6" />
            <h2 style={styles.insightsTitle}>Phân tích tổng quan</h2>
          </div>
          <div style={styles.insightsContent}>
            <p>
              <strong>• Dự đoán xu hướng:</strong>{" "}
              {stats.prediction || "Chưa đủ dữ liệu để dự đoán"}
            </p>
            {stats.diagnosisStats && stats.diagnosisStats.length > 0 && (
              <p>
                <strong>• Bệnh lý phổ biến nhất:</strong>{" "}
                {stats.diagnosisStats[0]?.name} (chiếm tỷ trọng cao nhất trong
                các ca khám)
              </p>
            )}
            {stats.symptomStats && stats.symptomStats.length > 0 && (
              <p>
                <strong>• Triệu chứng thường gặp:</strong>{" "}
                {stats.symptomStats[0]?.name} (xuất hiện{" "}
                {stats.symptomStats[0]?.value} lần)
              </p>
            )}
          </div>
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

// CSS Styles in JS
const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "24px",
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
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
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid rgba(255,255,255,0.3)",
    borderTop: "4px solid white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  loadingText: {
    color: "white",
    marginTop: "16px",
    fontSize: "16px",
    fontWeight: "500",
  },
  error: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "24px",
  },
  errorTitle: {
    color: "white",
    fontSize: "24px",
    marginTop: "16px",
  },
  errorMessage: {
    color: "rgba(255,255,255,0.9)",
    marginTop: "8px",
    textAlign: "center",
  },
  retryButton: {
    marginTop: "24px",
    padding: "12px 24px",
    background: "white",
    color: "#667eea",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
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
    boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
  },
  title: {
    fontSize: "36px",
    fontWeight: "bold",
    color: "white",
    marginBottom: "8px",
    textShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  subtitle: {
    fontSize: "16px",
    color: "rgba(255,255,255,0.9)",
  },
  dataSourceBanner: {
    background: "rgba(255, 255, 255, 0.95)",
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "24px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
    borderLeft: "4px solid #10b981",
  },
  bannerContent: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
  },
  bannerTitle: {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: "4px",
  },
  bannerText: {
    fontSize: "14px",
    color: "#4b5563",
    lineHeight: "1.5",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  summaryCard: {
    background: "white",
    borderRadius: "16px",
    padding: "24px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
    transition: "transform 0.2s",
  },
  summaryValue: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#1f2937",
    margin: 0,
  },
  summaryLabel: {
    fontSize: "14px",
    color: "#6b7280",
    margin: 0,
    marginTop: "4px",
  },
  chartsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))",
    gap: "24px",
    marginBottom: "24px",
  },
  chartCard: {
    background: "white",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
  chartTitle: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#374151",
    marginBottom: "24px",
    borderBottom: "1px solid #f3f4f6",
    paddingBottom: "12px",
  },
  insightsCard: {
    background: "white",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
  insightsHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "20px",
    paddingBottom: "16px",
    borderBottom: "2px solid #f3f4f6",
  },
  insightsTitle: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1f2937",
    margin: 0,
  },
  insightsContent: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    color: "#4b5563",
    fontSize: "15px",
    lineHeight: "1.6",
  },
};

export default EnhancedPatientStatistics;
