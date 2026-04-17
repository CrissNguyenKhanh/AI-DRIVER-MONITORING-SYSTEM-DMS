import React, { useState, useEffect, useRef, useCallback } from "react";
import { getMedicalApiBase } from "../../../shared/constants/apiEndpoints";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Users,
  Calendar,
  Camera,
  Upload,
  Image as ImageIcon,
  FileText,
  X,
  PlayCircle,
  StopCircle,
  RefreshCw
} from "lucide-react";
import DoctorChatbot from "../../chat/components/DoctorChatbot";

const MedicalDiagnosisAI = () => {
  // --- States cho Chẩn đoán Triệu chứng ---
  const [formData, setFormData] = useState({
    symptoms: "",
    age: "",
    gender: "Nam",
  });

  // --- States cho Chẩn đoán Hình ảnh ---
  const [activeTab, setActiveTab] = useState("text"); // 'text' hoặc 'image'
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // --- STATES CHO CAMERA & AUTO SCAN ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // --- States Chung ---
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [availableSymptoms, setAvailableSymptoms] = useState([]);
  const [statistics, setStatistics] = useState(null);

  // Load statistics on mount
  useEffect(() => {
    fetchStatistics();
    fetchSymptoms();

    // Cleanup khi component unmount
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      stopCamera(); // Đảm bảo tắt camera khi thoát
    };
  }, []);

  // --- API CALLS ---
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

  // --- XỬ LÝ INPUT ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file) => {
    setSelectedImage(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setResult(null);
    stopCamera(); // Tắt camera nếu đang bật
  };

  // --- CORE ANALYZE FUNCTION (Dùng chung cho cả Auto và Manual) ---
  const analyzeImageFile = useCallback(async (file, isAuto = false) => {
    if (isAnalyzing && !isAuto) return; // Chặn spam click nếu manual
    
    // Nếu là manual thì hiện loading, auto thì không hiện để tránh giật
    if (!isAuto) setIsAnalyzing(true);

    try {
      const formDataImage = new FormData();
      formDataImage.append("image", file);

      const response = await fetch(`${getMedicalApiBase()}/api/ai/predict-image`, {
        method: "POST",
        body: formDataImage,
      });

      const data = await response.json();

      if (data.success || data.prediction) {
        setResult({
          success: true, // QUAN TRỌNG: Flag để hiển thị UI
          ...data.prediction,
          record_id: data.record_id,
          type: 'image'
        });
      }
    } catch (error) {
      console.error("Lỗi phân tích:", error);
      if (!isAuto) {
        setResult({ success: false, error: "Lỗi kết nối server" });
      }
    } finally {
      if (!isAuto) setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  // --- LOGIC CAMERA ---
  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      setResult(null);
      setImagePreview(null);
      setSelectedImage(null);
      
      // Mở camera (ưu tiên camera sau, độ phân giải vừa phải để nhanh)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Không thể truy cập camera. Vui lòng cấp quyền!");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    stopAutoAnalysis(); // Dừng quét trước
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  // Helper: Chụp frame hiện tại từ video ra Blob
  const getFrameAsBlob = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      return new Promise(resolve => {
        // Quality 0.7 để nhẹ mạng
        canvas.toBlob(resolve, 'image/jpeg', 0.7);
      });
    }
    return null;
  };

  // --- LOGIC AUTO SCAN ---
  const startAutoAnalysis = () => {
    if (!isCameraOpen) return;
    setIsAutoAnalyzing(true);
    
    // Scan mỗi 2 giây
    intervalRef.current = setInterval(async () => {
      const blob = await getFrameAsBlob();
      if (blob) {
        const file = new File([blob], "auto_scan.jpg", { type: "image/jpeg" });
        // Gọi hàm phân tích với cờ isAuto = true
        analyzeImageFile(file, true);
      }
    }, 2000); 
  };

  const stopAutoAnalysis = () => {
    setIsAutoAnalyzing(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // --- MANUAL ANALYZE (Nút bấm) ---
  const handleManualAnalyze = async () => {
    setIsAnalyzing(true);
    setResult(null);

    try {
      if (activeTab === "text") {
        if (!formData.symptoms.trim() || !formData.age) return;
        const symptomsArray = formData.symptoms.split(",").map(s => s.trim()).filter(s => s.length > 0);

        const response = await fetch(`${getMedicalApiBase()}/api/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: 1,
            symptoms: symptomsArray,
            age: parseInt(formData.age),
            gender: formData.gender,
            notes: "",
          }),
        });
        const data = await response.json();
        if (data.success && data.prediction) {
           setResult({ success: true, ...data.prediction, record_id: data.record_id, type: 'text' });
        } else {
           setResult({ success: false, error: data.error });
        }
      } else {
        // Image Manual
        if (selectedImage) {
            await analyzeImageFile(selectedImage, false);
        }
      }
    } catch (error) {
      setResult({ success: false, error: error.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      Nhẹ: { bg: "#dcfce7", text: "#15803d", gradient: "linear-gradient(to right, #22c55e, #10b981)" },
      "Trung bình": { bg: "#fef3c7", text: "#b45309", gradient: "linear-gradient(to right, #f59e0b, #eab308)" },
      Nặng: { bg: "#fee2e2", text: "#dc2626", gradient: "linear-gradient(to right, #ef4444, #f97316)" },
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
          <h1 style={styles.title}>AI Chẩn Đoán Y Khoa</h1>
          <p style={styles.subtitle}>Hệ thống hỗ trợ chẩn đoán thông minh</p>
        </div>

        {/* Statistics Cards (Giữ nguyên) */}
        {statistics && (
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><Users size={24} color="#3b82f6" /></div>
              <div>
                <div style={styles.statValue}>{statistics.totalPatients || 0}</div>
                <div style={styles.statLabel}>Bệnh nhân</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><TrendingUp size={24} color="#10b981" /></div>
              <div>
                <div style={styles.statValue}>{statistics.diagnosisStats?.length || 0}</div>
                <div style={styles.statLabel}>Loại bệnh</div>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><Calendar size={24} color="#f59e0b" /></div>
              <div>
                <div style={styles.statValue}>{statistics.trends?.length || 0}</div>
                <div style={styles.statLabel}>Ngày hoạt động</div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={styles.tabContainer}>
          <button
            style={activeTab === "text" ? styles.activeTab : styles.tab}
            onClick={() => { setActiveTab("text"); setResult(null); stopCamera(); }}
          >
            <FileText size={18} /> Chẩn đoán Triệu chứng
          </button>
          <button
            style={activeTab === "image" ? styles.activeTab : styles.tab}
            onClick={() => { setActiveTab("image"); setResult(null); }}
          >
            <Camera size={18} /> Chẩn đoán Hình ảnh
          </button>
        </div>

        {/* Main Form */}
        <div style={styles.mainCard}>
          <h2 style={styles.cardTitle}>
            {activeTab === "text" ? "Nhập thông tin lâm sàng" : "Chụp hoặc Tải lên hình ảnh"}
          </h2>

          {/* FORM TEXT */}
          {activeTab === "text" && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Triệu chứng *</label>
                <textarea
                  name="symptoms"
                  value={formData.symptoms}
                  onChange={handleInputChange}
                  placeholder="VD: đau đầu, sốt, ho..."
                  style={styles.textarea}
                />
                {availableSymptoms.length > 0 && (
                   <div style={styles.hint}><small style={styles.hintText}>Gợi ý: {availableSymptoms.slice(0, 5).join(", ")}...</small></div>
                )}
              </div>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Tuổi *</label>
                  <input type="number" name="age" value={formData.age} onChange={handleInputChange} min="1" style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Giới tính *</label>
                  <select name="gender" value={formData.gender} onChange={handleInputChange} style={styles.input}>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* FORM IMAGE & CAMERA */}
          {activeTab === "image" && (
            <div style={styles.imageUploadContainer}>
              
              {isCameraOpen ? (
                // --- CAMERA VIEW ---
                <div style={styles.cameraContainer}>
                  {/* Overlay kết quả Realtime */}
                  {result && isAutoAnalyzing && (
                    <div style={{
                        position: 'absolute', top: 10, left: 10, right: 10, zIndex: 20,
                        backgroundColor: 'rgba(255,255,255,0.95)', padding: '12px', borderRadius: '12px',
                        borderLeft: `6px solid ${getSeverityColor(result.severity).text}`,
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{fontWeight: '800', fontSize: '16px', color: getSeverityColor(result.severity).text, marginBottom: '4px'}}>
                            {result.diagnosis} ({result.severity})
                        </div>
                        <div style={{fontSize: '12px', color: '#334155'}}>
                            Độ tin cậy: <span style={{fontWeight: 'bold'}}>{(result.confidence * 100).toFixed(0)}%</span>
                        </div>
                    </div>
                  )}

                  <video ref={videoRef} autoPlay playsInline style={styles.videoPreview} />
                  <canvas ref={canvasRef} style={{display: 'none'}} />

                  <div style={styles.cameraControls}>
                    {!isAutoAnalyzing ? (
                      <button onClick={startAutoAnalysis} style={styles.controlBtnPrimary}>
                        <PlayCircle size={24} /> Bắt đầu quét
                      </button>
                    ) : (
                      <button onClick={stopAutoAnalysis} style={styles.controlBtnDanger}>
                        <StopCircle size={24} /> Dừng quét
                      </button>
                    )}
                    <button onClick={stopCamera} style={styles.controlBtnSecondary}>
                      <X size={24} />
                    </button>
                  </div>
                  <p style={{position: 'absolute', bottom: 80, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '12px'}}>
                    {isAutoAnalyzing ? "Đang tự động phân tích..." : "Nhấn Bắt đầu để quét liên tục"}
                  </p>
                </div>
              ) : (
                // --- UPLOAD VIEW ---
                <div style={styles.uploadBox}>
                  {!imagePreview ? (
                    <div style={styles.actionButtons}>
                      <button onClick={startCamera} style={styles.cameraBtn}>
                        <Camera size={24} />
                        <span>Mở Camera Chẩn đoán</span>
                      </button>
                      <div style={styles.orDivider}>- hoặc -</div>
                      <label style={styles.uploadBtn}>
                        <Upload size={20} />
                        <span>Tải ảnh từ máy</span>
                        <input type="file" accept="image/*" onChange={handleImageChange} style={styles.hiddenInput} />
                      </label>
                    </div>
                  ) : (
                    <div style={styles.previewContainer}>
                      <img src={imagePreview} alt="Preview" style={styles.imagePreview} />
                      <div style={styles.previewActions}>
                        <button onClick={() => { setImagePreview(null); setSelectedImage(null); setResult(null); }} style={styles.removeImageBtn}>
                          <X size={16} /> Xóa ảnh
                        </button>
                        <button onClick={startCamera} style={styles.retakeBtn}>
                          <RefreshCw size={16} /> Chụp lại
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MANUAL ANALYZE BUTTON (Ẩn khi đang Auto Scan) */}
          {!isAutoAnalyzing && (
            <button
              onClick={handleManualAnalyze}
              disabled={
                isAnalyzing ||
                (activeTab === "text" && (!formData.symptoms.trim() || !formData.age)) ||
                (activeTab === "image" && !selectedImage)
              }
              style={{
                ...styles.analyzeButton,
                ...((isAnalyzing || (activeTab === "text" && (!formData.symptoms || !formData.age)) || (activeTab === "image" && !selectedImage)) ? styles.analyzeButtonDisabled : {})
              }}
            >
              {isAnalyzing ? (
                <><div style={styles.spinner}></div> Đang phân tích...</>
              ) : (
                <>
                  {activeTab === "text" ? <Activity size={20} /> : <ImageIcon size={20} />}
                  {activeTab === "text" ? "Chẩn đoán ngay" : "Phân tích ảnh này"}
                </>
              )}
            </button>
          )}
        </div>

        {/* RESULT CARD (Chỉ hiện khi KHÔNG Auto Scan để tránh rối) */}
        {result && !isAutoAnalyzing && (
          <div style={styles.resultCard}>
            {result.success ? (
              <>
                <div style={styles.resultHeader}>
                  <div style={{ ...styles.resultIcon, background: getSeverityColor(result.severity).gradient }}>
                    <CheckCircle style={styles.resultIconSvg} />
                  </div>
                  <div style={styles.resultHeaderText}>
                    <h3 style={styles.resultTitle}>Kết quả chẩn đoán</h3>
                    <p style={styles.resultSubtitle}>{activeTab === "text" ? "Naive Bayes Algorithm" : "Machine Learning Model"}</p>
                  </div>
                </div>

                <div style={styles.resultBody}>
                  <div style={styles.resultSection}>
                    <div style={styles.resultLabel}>🏥 Kết quả</div>
                    <div style={styles.diagnosisBox}>{result.diagnosis || "Không xác định"}</div>
                  </div>

                  <div style={styles.resultSection}>
                    <div style={styles.resultLabel}>⚠️ Mức độ</div>
                    <div style={{
                      ...styles.severityBadge,
                      backgroundColor: getSeverityColor(result.severity).bg,
                      color: getSeverityColor(result.severity).text,
                    }}>
                      {result.severity}
                    </div>
                  </div>

                  <div style={styles.resultSection}>
                    <div style={styles.confidenceRow}>
                      <span style={styles.resultLabel}>📊 Độ tin cậy</span>
                      <span style={styles.confidenceValue}>{(result.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div style={styles.progressBar}>
                      <div style={{
                        ...styles.progressFill,
                        width: `${result.confidence * 100}%`,
                        background: getSeverityColor(result.severity).gradient,
                      }}></div>
                    </div>
                  </div>

                  {result.recommendations && (
                    <div style={styles.recommendationBox}>
                      <div style={styles.recommendationTitle}>💡 Khuyến nghị</div>
                      <ul style={styles.recommendationList}>
                        {result.recommendations.map((rec, idx) => (
                          <li key={idx} style={styles.recommendationItem}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={styles.errorBox}>
                <AlertCircle size={32} color="#dc2626" />
                <p style={styles.errorText}>{result.error || "Đã xảy ra lỗi"}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <p>🤖 Hệ thống Hybrid AI (NLP & Computer Vision)</p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <DoctorChatbot />
    </div>
  );
};

// --- STYLES ---
const styles = {
  container: { minHeight: "100vh", backgroundColor: "#f8fafc", fontFamily: "'Segoe UI', sans-serif", padding: "20px", display: "flex", justifyContent: "center" },
  maxWidth: { width: "100%", maxWidth: "800px" },
  header: { textAlign: "center", marginBottom: "30px" },
  iconContainer: { display: "inline-flex", padding: "12px", backgroundColor: "#dbeafe", borderRadius: "16px", marginBottom: "16px" },
  icon: { width: "40px", height: "40px", color: "#2563eb" },
  title: { fontSize: "28px", fontWeight: "800", color: "#1e293b", margin: 0 },
  subtitle: { color: "#64748b", margin: 0 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" },
  statCard: { backgroundColor: "white", padding: "16px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "12px" },
  statIcon: { padding: "10px", backgroundColor: "#f1f5f9", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: "20px", fontWeight: "bold", color: "#0f172a" },
  statLabel: { fontSize: "12px", color: "#64748b" },
  tabContainer: { display: "flex", gap: "10px", marginBottom: "20px", backgroundColor: "#e2e8f0", padding: "4px", borderRadius: "12px" },
  tab: { flex: 1, padding: "10px", border: "none", borderRadius: "8px", backgroundColor: "transparent", color: "#64748b", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
  activeTab: { flex: 1, padding: "10px", border: "none", borderRadius: "8px", backgroundColor: "white", color: "#2563eb", fontWeight: "bold", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
  mainCard: { backgroundColor: "white", borderRadius: "20px", padding: "30px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", marginBottom: "24px" },
  cardTitle: { fontSize: "20px", fontWeight: "700", color: "#334155", marginBottom: "24px" },
  formGroup: { marginBottom: "20px", flex: 1 },
  formRow: { display: "flex", gap: "20px" },
  label: { display: "block", fontSize: "14px", fontWeight: "600", color: "#475569", marginBottom: "8px" },
  textarea: { width: "100%", height: "100px", padding: "12px", borderRadius: "12px", border: "2px solid #e2e8f0", fontSize: "16px", outline: "none", boxSizing: 'border-box' },
  input: { width: "100%", padding: "12px", borderRadius: "12px", border: "2px solid #e2e8f0", fontSize: "16px", outline: "none", boxSizing: 'border-box' },
  hint: { marginTop: "6px" },
  hintText: { color: "#94a3b8" },
  imageUploadContainer: { marginBottom: "20px" },
  uploadBox: { border: "2px dashed #cbd5e1", borderRadius: "16px", minHeight: "240px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", padding: "20px" },
  actionButtons: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", width: "100%" },
  uploadBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "12px 24px", backgroundColor: "white", border: "1px solid #cbd5e1", borderRadius: "12px", cursor: "pointer", fontWeight: "600", color: "#475569", width: "240px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  cameraBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "14px 24px", backgroundColor: "#2563eb", border: "none", borderRadius: "12px", cursor: "pointer", fontWeight: "600", color: "white", width: "240px", boxShadow: "0 4px 10px rgba(37, 99, 235, 0.3)" },
  hiddenInput: { display: "none" },
  orDivider: { color: "#94a3b8", fontSize: "14px", fontWeight: "500" },
  cameraContainer: { position: "relative", backgroundColor: "#000", borderRadius: "16px", overflow: "hidden", height: "400px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  videoPreview: { width: "100%", height: "100%", objectFit: "cover" },
  cameraControls: { position: "absolute", bottom: "20px", display: "flex", gap: "15px", alignItems: "center", zIndex: 10 },
  controlBtnPrimary: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", borderRadius: "30px", border: "none", backgroundColor: "#2563eb", color: "white", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.2)" },
  controlBtnDanger: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", borderRadius: "30px", border: "none", backgroundColor: "#dc2626", color: "white", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.2)" },
  controlBtnSecondary: { display: "flex", alignItems: "center", gap: "8px", padding: "10px", borderRadius: "50%", border: "none", backgroundColor: "rgba(0,0,0,0.6)", color: "white", cursor: "pointer" },
  previewContainer: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  imagePreview: { maxWidth: "100%", maxHeight: "300px", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", marginBottom: "16px" },
  previewActions: { display: "flex", gap: "10px" },
  removeImageBtn: { padding: "8px 16px", borderRadius: "8px", border: "1px solid #ef4444", backgroundColor: "white", color: "#ef4444", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" },
  retakeBtn: { padding: "8px 16px", borderRadius: "8px", border: "1px solid #2563eb", backgroundColor: "white", color: "#2563eb", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" },
  analyzeButton: { width: "100%", padding: "16px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", transition: "all 0.2s" },
  analyzeButtonDisabled: { backgroundColor: "#94a3b8", cursor: "not-allowed" },
  spinner: { width: "20px", height: "20px", border: "3px solid #ffffff", borderTop: "3px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite", marginRight: "10px" },
  resultCard: { backgroundColor: "white", borderRadius: "20px", overflow: "hidden", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", animation: "fadeIn 0.5s ease-out" },
  resultHeader: { padding: "24px", backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "16px" },
  resultIcon: { width: "48px", height: "48px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", color: "white" },
  resultIconSvg: { width: "28px", height: "28px" },
  resultHeaderText: { flex: 1 },
  resultTitle: { fontSize: "18px", fontWeight: "700", color: "#1e293b", margin: 0 },
  resultSubtitle: { fontSize: "14px", color: "#64748b", margin: "4px 0 0 0" },
  resultBody: { padding: "24px" },
  resultSection: { marginBottom: "20px" },
  resultLabel: { fontSize: "12px", textTransform: "uppercase", fontWeight: "700", color: "#94a3b8", marginBottom: "8px", display: "block" },
  diagnosisBox: { fontSize: "24px", fontWeight: "800", color: "#1e293b", padding: "16px", backgroundColor: "#f1f5f9", borderRadius: "12px" },
  severityBadge: { display: "inline-block", padding: "8px 16px", borderRadius: "20px", fontSize: "14px", fontWeight: "700" },
  confidenceRow: { display: "flex", justifyContent: "space-between", marginBottom: "8px" },
  confidenceValue: { fontWeight: "700", color: "#1e293b" },
  progressBar: { height: "10px", backgroundColor: "#e2e8f0", borderRadius: "5px", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: "5px", transition: "width 1s ease-out" },
  recommendationBox: { marginTop: "24px", padding: "16px", backgroundColor: "#eff6ff", borderRadius: "12px", border: "1px solid #dbeafe" },
  recommendationTitle: { fontSize: "15px", fontWeight: "700", color: "#1e40af", marginBottom: "12px" },
  recommendationList: { margin: 0, paddingLeft: "20px", color: "#1e3a8a" },
  recommendationItem: { marginBottom: "6px" },
  errorBox: { padding: "40px", textAlign: "center", color: "#ef4444" },
  errorText: { marginTop: "16px", fontWeight: "600" },
  footer: { marginTop: "30px", textAlign: "center", color: "#94a3b8", fontSize: "14px" },
};

export default MedicalDiagnosisAI;