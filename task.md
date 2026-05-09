# DMS Refactor Progress

## Trạng thái hiện tại
- Giai đoạn: 1 - Dọn rác (Bước 1.3 - Đã hoàn tất xóa file)
- File đang làm: Hoàn tất xóa file theo phê duyệt
- Bước đang thực hiện: Cập nhật task.md, chờ lệnh commit và chuyển Giai đoạn 2
- Chờ xác nhận từ user: Chờ lệnh commit git và bước sang Giai đoạn 2

## Giai đoạn 1 - Danh sách đã dọn
- [x] Xóa: DiQuaMuaHaa/backend/len.py (lý do: Medical Diagnosis API - không thuộc DMS)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/khanhku.jsx (lý do: MedicalDiagnosisAI component)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/vippoint.jsx (lý do: MedicalRecordConfirmation component)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/test.jsx (lý do: MedicalDiagnosisAI component)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/endhaintstatics.jsx (lý do: EnhancedPatientStatistics)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/admin/PatientStatistics.jsx (lý do: PatientStatistics dashboard)
- [x] Xóa: Hàm getMedicalApiBase() trong apiEndpoints.js (lý do: config cho medical API port 5000)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/chat/DoctorChatbot.jsx (lý do: Chatbot bác sĩ - medical domain)
- [x] Xóa: DiQuaMuaHaa/backend/data/__pycache__/ (lý do: Cache bytecode Python)
- [x] Xóa: DiQuaMuaHaa/backend/data/api/__pycache__/ (lý do: Cache bytecode Python)
- [x] Xóa: DiQuaMuaHaa/backend/driver_training/collect/test_camp.py (lý do: File test camera tạm)
- [ ] Giữ lại: DiQuaMuaHaa/backend/phone_data.csv (lý do: Chưa xác định rõ, tạm giữ)
- [ ] Giữ lại: DiQuaMuaHaa/backend/quicktest.py (lý do: Tool test webcam cho DMS training)

### Kết quả Audit - Nhóm A (Code không thuộc DMS - Medical/Y tế)
| # | File/Đoạn code | Nhóm | Lý do xác định là rác | Đề xuất |
|---|---|---|---|---|
| 1 | DiQuaMuaHaa/backend/len.py | A | Toàn bộ file là Medical Diagnosis API (chẩn đoán bệnh, triệu chứng, bệnh nhân, bệnh án). Database: medical_diagnosis | Xóa |
| 2 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/khanhku.jsx | A | MedicalDiagnosisAI component - chẩn đoán triệu chứng & hình ảnh y tế, dùng getMedicalApiBase | Xóa |
| 3 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/vippoint.jsx | A | MedicalRecordConfirmation - xác nhận chẩn đoán y tế, dùng getMedicalApiBase | Xóa |
| 4 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/test.jsx | A | MedicalDiagnosisAI component - chẩn đoán triệu chứng, dùng getMedicalApiBase | Xóa |
| 5 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/endhaintstatics.jsx | A | EnhancedPatientStatistics - thống kê bệnh nhân, dùng getMedicalApiBase | Xóa |
| 6 | DiQuaMuaHaa/frontend/demothuattoanpro/src/admin/PatientStatistics.jsx | A | PatientStatistics dashboard - thống kê bệnh nhân admin, dùng getMedicalApiBase | Xóa |
| 7 | DiQuaMuaHaa/frontend/demothuattoanpro/src/config/apiEndpoints.js (dòng 26-44) | A | Hàm getMedicalApiBase() - config cho medical API port 5000 | Xóa function |
| 8 | DiQuaMuaHaa/frontend/demothuattoanpro/src/chat/DoctorChatbot.jsx | A | Chatbot bác sĩ - domain medical | Cần xác nhận |

### Kết quả Audit - Nhóm B (Code thừa kỹ thuật)
| # | File/Đoạn code | Nhóm | Lý do xác định là rác | Đề xuất |
|---|---|---|---|---|
| 9 | DiQuaMuaHaa/backend/data/__pycache__/ | B | Cache bytecode Python | Xóa |
| 10 | DiQuaMuaHaa/backend/data/api/__pycache__/ | B | Cache bytecode Python | Xóa |
| 11 | DiQuaMuaHaa/backend/driver_training/collect/test_camp.py | B | File test camera tạm (test_cam.py đổi tên), không liên quan DMS logic | Xóa |

### Cần xác nhận thêm
| # | File/Đoạn code | Lý do |
|---|---|---|
| 12 | DiQuaMuaHaa/backend/phone_data.csv | File CSV gần như trống (26 bytes), không rõ có dùng không |
| 13 | DiQuaMuaHaa/backend/quicktest.py | File test live webcam, nhưng có vẻ là tool hỗ trợ DMS training - cần xác nhận có giữ lại không |

## Giai đoạn 2 - Tiến độ tái cấu trúc
- [ ] Bước 2.1 - Quét và tìm điểm nóng (đang thực hiện)
- [ ] Bước 2.2 - Lên kế hoạch bóc tách (chờ phê duyệt)
- [ ] Bước 2.3 - Thực thi tách file (chưa bắt đầu)

### Kết quả Bước 2.1 - 3 File "Điểm nóng" vi phạm Single Responsibility

| # | File | Kích thước | Vấn đề chính | Mức độ nghiêm trọng |
|---|---|---|---|---|
| 1 | `frontend/.../testdata/thucmuctest.jsx` | **4333 dòng** | File DMS Dashboard khổng lồ: Ôm đồm UI, Webcam logic, Socket.IO, Canvas 3D/2D overlays, FaceMesh detection, Hand detection, Phone/Smoking detection, Audio/Alarm, Identity verification, Driving Session API | 🔴 **Cao nhất** |
| 2 | `frontend/.../systeamdetectface/face_detect.jsx` | **1386 dòng** | Component xác thực driver: Gộp UI, Webcam, Face detection, Canvas animation (Radar), Identity API calls | 🟡 Cao |
| 3 | `backend/data/api/runtime.py` | **658 dòng** | Backend runtime: Model loading (4 models), Database config, MySQL connection, Telegram config, Constants - quá nhiều trách nhiệm | 🟡 Cao |

### Chi tiết vi phạm - File #1 (thucmuctest.jsx)
- **20+ useRef**: video, stream, faceMesh, hands, landmarks, eyeData, earHistory, blinkState, phoneDetection, smokingDetection, audioCtx, alarmInterval...
- **10+ useEffect**: WebSocket, Camera init, API polling, Canvas draw loops, Audio setup
- **Nhiều hàm con lồng nhau**: PhoneFOMOOverlay, SmokingFOMOOverlay, FaceMeshOverlay, HandLandmarkOverlay, EyeCanvas, WaveformCanvas, Head3D
- **Xử lý đồng thời**: REST API + Socket.IO + MediaPipe + Canvas 2D/3D + Audio + Session management

---

## Bước 2.2 - KẾ HOẠCH BÓC TÁCH FILE TỆ NHẤT

### Tên file gốc: `frontend/demothuattoanpro/src/testdata/thucmuctest.jsx` (4333 dòng)

### Sẽ được bóc tách thành:

#### [1] `hooks/useDmsCamera.js` - Custom hook quản lý Webcam
- **Nhiệm vụ**: Khởi tạo/tắt webcam, quản lý stream, xử lý lỗi camera, cleanup
- **Refs từ gốc**: `videoRef`, `streamRef`, `faceMeshRef`, `handsRef`

#### [2] `hooks/useMediaPipe.js` - Custom hook xử lý MediaPipe
- **Nhiệm vụ**: Khởi tạo FaceMesh và Hands, xử lý landmarks, tính toán EAR/head pose
- **Refs từ gốc**: `landmarksRef`, `eyeDataRef`, `earHistoryRef`, `handLandmarksRef`, `poseRef`

#### [3] `hooks/useWebSocket.js` - Custom hook WebSocket (Socket.IO)
- **Nhiệm vụ**: Kết nối Socket.IO, gửi/nhận frame cho phone/smoking detection
- **Refs từ gốc**: `phoneDetectionRef`, `smokingDetectionRef`

#### [4] `hooks/useDmsAudio.js` - Custom hook quản lý Audio/Alarm
- **Nhiệm vụ**: Khởi tạo AudioContext, phát cảnh báo, rung, quản lý interval
- **Refs từ gốc**: `audioCtxRef`, `alarmIntervalRef`, `vibrateIntervalRef`

#### [5] `hooks/useDrivingSession.js` - Custom hook Driving Session API
- **Nhiệm vụ**: Gọi API start/end session, record alert, quản lý session state
- **Logic từ gốc**: `startDrivingSession`, `endDrivingSession`, `recordDrivingAlert`

#### [6] `components/PhoneFOMOOverlay.jsx` - Component overlay Phone detection
- **Nhiệm vụ**: Vẽ canvas 2D cảnh báo điện thoại (FOMO - Fear Of Missing Out)
- **Từ gốc**: Function `PhoneFOMOOverlay`

#### [7] `components/SmokingFOMOOverlay.jsx` - Component overlay Smoking detection
- **Nhiệm vụ**: Vẽ canvas 2D cảnh báo hút thuốc
- **Từ gốc**: Function `SmokingFOMOOverlay`

#### [8] `components/FaceMeshOverlay.jsx` - Component overlay Face Mesh
- **Nhiệm vụ**: Vẽ canvas 2D face landmarks
- **Từ gốc**: Function `FaceMeshOverlay`

#### [9] `components/HandLandmarkOverlay.jsx` - Component overlay Hand landmarks
- **Nhiệm vụ**: Vẽ canvas 2D hand landmarks
- **Từ gốc**: Function `HandLandmarkOverlay`

#### [10] `components/EyeCanvas.jsx` - Component hiển thị mắt 3D/2D
- **Nhiệm vụ**: Vẽ canvas cho mắt trái/phải
- **Từ gốc**: Function `EyeCanvas`

#### [11] `components/WaveformCanvas.jsx` - Component hiển thị waveform EAR
- **Nhiệm vụ**: Vẽ biểu đồ EAR history
- **Từ gốc**: Function `WaveformCanvas`

#### [12] `components/Head3D.jsx` - Component hiển thị đầu 3D
- **Nhiệm vụ**: Render Three.js head 3D với pose
- **Từ gốc**: Function `Head3D`

#### [13] `components/DriverMonitorDMS.jsx` - Component giao diện CHÍNH (thuần UI)
- **Nhiệm vụ**: Chỉ còn layout JSX, import và sử dụng các hooks/components trên
- **Giữ lại**: Constants (LABEL_MAP, STATUS_ICONS), Style, Event handlers đơn giản

### Nguyên tắc bóc tách:
- **Không thay đổi logic**: Chỉ di chuyển code, giữ nguyên algorithrm, state flow
- **Giữ nguyên refs**: Các useRef sẽ được truyền qua props hoặc context
- **Giữ nguyên constants**: LABEL_MAP, STATUS_ICONS, các ngưỡng EAR... giữ nguyên
- **Import/Export đúng chuẩn**: Mỗi file export default một component/hook

---

## Trạng thái hiện tại
- **Giai đoạn**: 2 - Tái cấu trúc (Bước 2.3 - Đã hoàn tất bóc tách Nhóm A)
- **Chờ xác nhận từ user**: Kiểm tra/test code sau khi bóc tách Nhóm A
- **Lưu ý**: Đã tách EyeCanvas.jsx, WaveformCanvas.jsx và constants/dmsConstants.js. Đã cập nhật thucmuctest.jsx để import các component mới.

---

## Bước 2.3 - CHUẨN BỊ BÓC TÁCH NHÓM A (EyeCanvas, WaveformCanvas)

### PHÂN TÍCH SỬ DỤNG TRONG thucmuctest.jsx

**Vị trí gọi EyeCanvas:**
```jsx
// Line 2568
<EyeCanvas eyeDataRef={eyeDataRef} side={side} />
// Trong loop: side = "left" | "right"
```

**Vị trí gọi WaveformCanvas:**
```jsx
// Line 2675-2678
<WaveformCanvas
  earHistoryRef={earHistoryRef}
  side={side}
  color="#1e90ff"
/>
// Trong loop: side = "left" | "right"
```

---

### BẢNG MAPPING PROPS & REFS - NHÓM A

| Component | Props nhận vào | Kiểu dữ liệu | Mô tả | Refs xử lý | Cần forwardRef? |
|---|---|---|---|---|---|
| **EyeCanvas** | `eyeDataRef` | `React.RefObject<{left: EyeData, right: EyeData}>` | Ref chứa dữ liệu mắt trái/phải (ear, yaw, pitch, blinking) | `canvasRef` (internal) - dùng cho `<canvas ref={canvasRef}>` | **Không** - Parent không cần truy cập canvas element |
| **EyeCanvas** | `side` | `string` ("left" \| "right") | Chọn mắt trái hoặc phải để vẽ | - | - |
| **WaveformCanvas** | `earHistoryRef` | `React.RefObject<{left: number[], right: number[]}>` | Ref chứa lịch sử EAR values | `canvasRef` (internal) - dùng cho `<canvas ref={canvasRef}>` | **Không** - Parent không cần truy cập canvas element |
| **WaveformCanvas** | `side` | `string` ("left" \| "right") | Chọn data mắt trái hoặc phải | - | - |
| **WaveformCanvas** | `color` | `string` (optional) | Màu waveform, default "#1e90ff" | - | - |

### CHI TIẾT LOGIC BÊN TRONG (giữ nguyên khi tách)

**EyeCanvas:**
- Sử dụng `requestAnimationFrame` loop để vẽ liên tục
- Đọc `eyeDataRef.current[side]` để lấy: `ear`, `yaw`, `pitch`, `blinking`
- Canvas size cố định: width=200, height=100
- Vẽ: nền đen, hình mắt (oval), iris, pupil, hiệu ứng blinking

**WaveformCanvas:**
- Sử dụng `requestAnimationFrame` loop để vẽ liên tục
- Đọc `earHistoryRef.current[side]` để lấy array EAR values
- Sử dụng constant `EAR_HISTORY` (được import từ file cha)
- Vẽ: nền đen, các bar thể hiện history, đường threshold ngang
- Canvas size cố định: width=280, height=50

### RỦI RO & LƯU Ý

| Rủi ro | Mức độ | Giải pháp |
|---|---|---|
| `EAR_HISTORY` constant dùng chung | Thấp | Import từ file constants hoặc truyền qua props |
| `useEffect` cleanup (cancelAnimationFrame) | Thấp | Đảm bảo giữ nguyên logic cleanup khi tách |
| Canvas ref internal | Không có | Không cần forwardRef vì parent không cần truy cập canvas |
| Ref mutation từ parent | Thấp | Đảm bảo ref luôn là mutable ref object |

---

## Tiêu chuẩn Test Thành Công (sau khi code)
- [ ] Giao diện load không có lỗi đỏ trong console
- [ ] Các canvas overlay hiển thị chính xác như cũ (mắt 3D, waveform EAR)
- [ ] Không có warning về thiếu ref, lỗi forwardRef, hoặc re-render bất thường
- [ ] Animation vẽ mắt và waveform chạy mượt (60fps)

### Nhóm A - Đã thực hiện:
- [x] Tạo `constants/dmsConstants.js` - chứa EAR_HISTORY, EAR_BLINK_THRESH, LABEL_MAP, STATUS_ICONS, L_EYE, R_EYE
- [x] Tạo `components/EyeCanvas.jsx` - component vẽ mắt với props: eyeDataRef, side
- [x] Tạo `components/WaveformCanvas.jsx` - component vẽ waveform với props: earHistoryRef, side, color
- [x] Cập nhật `thucmuctest.jsx` - import components mới, xóa các hàm EyeCanvas và WaveformCanvas cũ, xóa constants cũ
- [x] Dọn dẹp file re-export còn sót lại trong `features/` (6 file trỏ đến medical components đã xóa)

## Ghi chú / Rủi ro
- Project có code liên quan medical/y tế cần tách bỏ
- Cần kiểm tra cẩn thận để không xóa nhầm code DMS thật sự

## Lịch sử thay đổi
- [2025-05-09] Session 1: Khởi động session, tạo task.md, bắt đầu Giai đoạn 1 - Audit toàn dự án
- [2025-05-09] Session 1 (tiếp): Hoàn tất Giai đoạn 1.3 - Đã xóa 11 file/thư mục theo phê duyệt (Nhóm A + Nhóm B + DoctorChatbot.jsx), cập nhật task.md, chờ lệnh git commit để sang Giai đoạn 2
- [2025-05-09] Session 2: Hoàn tất Giai đoạn 2.3 - Bóc tách Nhóm A (EyeCanvas.jsx, WaveformCanvas.jsx, dmsConstants.js), cập nhật thucmuctest.jsx để import các component mới
