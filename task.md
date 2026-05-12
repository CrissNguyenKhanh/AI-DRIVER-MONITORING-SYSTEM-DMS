# DMS Refactor - Master Plan

## 🎯 MỤC TIÊU HIỆN TẠI (AGENT ACTION REQUIRED)
- **Tóm tắt trạng thái:** Dự án đã hoàn tất 100% Giai đoạn 1 (dọn code rác medical/y tế) và Giai đoạn 2 (bóc tách siêu file `thucmuctest.jsx` thành các custom hooks C1, C2, dmsMath, constants và UI components). Đã vá các lỗi bộ nhớ, memory leak và logic Audio/WebSocket.
- **Nhiệm vụ tiếp theo (Giai đoạn 4):** Giai đoạn 4: Deep Clean Kiến trúc Thư mục (Đang chờ duyệt kế hoạch).

## 📜 LỊCH SỬ REFACTOR & BỐI CẢNH DỰ ÁN (CHỈ ĐỌC/THAM KHẢO)

### Giai đoạn 1 - Danh sách đã dọn
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
- [x] Giữ lại: DiQuaMuaHaa/backend/phone_data.csv (lý do: Chưa xác định rõ, tạm giữ)
- [x] Giữ lại: DiQuaMuaHaa/backend/quicktest.py (lý do: Tool test webcam cho DMS training)

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

### Giai đoạn 2 - Tiến độ tái cấu trúc
- [x] Bước 2.1 - Quét và tìm điểm nóng
- [x] Bước 2.2 - Lên kế hoạch bóc tách
- [x] Bước 2.3 - Thực thi tách file

#### Kết quả Bước 2.1 - 3 File "Điểm nóng" vi phạm Single Responsibility

| # | File | Kích thước | Vấn đề chính | Mức độ nghiêm trọng |
|---|---|---|---|---|
| 1 | `frontend/.../testdata/thucmuctest.jsx` | **4333 dòng** | File DMS Dashboard khổng lồ: Ôm đồm UI, Webcam logic, Socket.IO, Canvas 3D/2D overlays, FaceMesh detection, Hand detection, Phone/Smoking detection, Audio/Alarm, Identity verification, Driving Session API | 🔴 **Cao nhất** |
| 2 | `frontend/.../systeamdetectface/face_detect.jsx` | **1386 dòng** | Component xác thực driver: Gộp UI, Webcam, Face detection, Canvas animation (Radar), Identity API calls | 🟡 Cao |
| 3 | `backend/data/api/runtime.py` | **658 dòng** | Backend runtime: Model loading (4 models), Database config, MySQL connection, Telegram config, Constants - quá nhiều trách nhiệm | 🟡 Cao |

#### Chi tiết vi phạm - File #1 (thucmuctest.jsx)
- **20+ useRef**: video, stream, faceMesh, hands, landmarks, eyeData, earHistory, blinkState, phoneDetection, smokingDetection, audioCtx, alarmInterval...
- **10+ useEffect**: WebSocket, Camera init, API polling, Canvas draw loops, Audio setup
- **Nhiều hàm con lồng nhau**: PhoneFOMOOverlay, SmokingFOMOOverlay, FaceMeshOverlay, HandLandmarkOverlay, EyeCanvas, WaveformCanvas, Head3D
- **Xử lý đồng thời**: REST API + Socket.IO + MediaPipe + Canvas 2D/3D + Audio + Session management

---

### Bước 2.2 - KẾ HOẠCH BÓC TÁCH FILE TỆ NHẤT

#### Tên file gốc: `frontend/demothuattoanpro/src/testdata/thucmuctest.jsx` (4333 dòng)

#### Sẽ được bóc tách thành:

##### [1] `hooks/useDmsCamera.js` - Custom hook quản lý Webcam
- **Nhiệm vụ**: Khởi tạo/tắt webcam, quản lý stream, xử lý lỗi camera, cleanup
- **Refs từ gốc**: `videoRef`, `streamRef`, `faceMeshRef`, `handsRef`

##### [2] `hooks/useMediaPipe.js` - Custom hook xử lý MediaPipe
- **Nhiệm vụ**: Khởi tạo FaceMesh và Hands, xử lý landmarks, tính toán EAR/head pose
- **Refs từ gốc**: `landmarksRef`, `eyeDataRef`, `earHistoryRef`, `handLandmarksRef`, `poseRef`

##### [3] `hooks/useWebSocket.js` - Custom hook WebSocket (Socket.IO)
- **Nhiệm vụ**: Kết nối Socket.IO, gửi/nhận frame cho phone/smoking detection
- **Refs từ gốc**: `phoneDetectionRef`, `smokingDetectionRef`

##### [4] `hooks/useDmsAudio.js` - Custom hook quản lý Audio/Alarm
- **Nhiệm vụ**: Khởi tạo AudioContext, phát cảnh báo, rung, quản lý interval
- **Refs từ gốc**: `audioCtxRef`, `alarmIntervalRef`, `vibrateIntervalRef`

##### [5] `hooks/useDrivingSession.js` - Custom hook Driving Session API
- **Nhiệm vụ**: Gọi API start/end session, record alert, quản lý session state
- **Logic từ gốc**: `startDrivingSession`, `endDrivingSession`, `recordDrivingAlert`

##### [6] `components/PhoneFOMOOverlay.jsx` - Component overlay Phone detection
- **Nhiệm vụ**: Vẽ canvas 2D cảnh báo điện thoại (FOMO - Fear Of Missing Out)
- **Từ gốc**: Function `PhoneFOMOOverlay`

##### [7] `components/SmokingFOMOOverlay.jsx` - Component overlay Smoking detection
- **Nhiệm vụ**: Vẽ canvas 2D cảnh báo hút thuốc
- **Từ gốc**: Function `SmokingFOMOOverlay`

##### [8] `components/FaceMeshOverlay.jsx` - Component overlay Face Mesh
- **Nhiệm vụ**: Vẽ canvas 2D face landmarks
- **Từ gốc**: Function `FaceMeshOverlay`

##### [9] `components/HandLandmarkOverlay.jsx` - Component overlay Hand landmarks
- **Nhiệm vụ**: Vẽ canvas 2D hand landmarks
- **Từ gốc**: Function `HandLandmarkOverlay`

##### [10] `components/EyeCanvas.jsx` - Component hiển thị mắt 3D/2D
- **Nhiệm vụ**: Vẽ canvas cho mắt trái/phải
- **Từ gốc**: Function `EyeCanvas`

##### [11] `components/WaveformCanvas.jsx` - Component hiển thị waveform EAR
- **Nhiệm vụ**: Vẽ biểu đồ EAR history
- **Từ gốc**: Function `WaveformCanvas`

##### [12] `components/Head3D.jsx` - Component hiển thị đầu 3D
- **Nhiệm vụ**: Render Three.js head 3D với pose
- **Từ gốc**: Function `Head3D`

##### [13] `components/DriverMonitorDMS.jsx` - Component giao diện CHÍNH (thuần UI)
- **Nhiệm vụ**: Chỉ còn layout JSX, import và sử dụng các hooks/components trên
- **Giữ lại**: Constants (LABEL_MAP, STATUS_ICONS), Style, Event handlers đơn giản

#### Nguyên tắc bóc tách:
- **Không thay đổi logic**: Chỉ di chuyển code, giữ nguyên algorithrm, state flow
- **Giữ nguyên refs**: Các useRef sẽ được truyền qua props hoặc context
- **Giữ nguyên constants**: LABEL_MAP, STATUS_ICONS, các ngưỡng EAR... giữ nguyên
- **Import/Export đúng chuẩn**: Mỗi file export default một component/hook

---

### Bước 2.3 - BÓC TÁCH NHÓM A (EyeCanvas, WaveformCanvas)

#### PHÂN TÍCH SỬ DỤNG TRONG thucmuctest.jsx

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

#### BẢNG MAPPING PROPS & REFS - NHÓM A

| Component | Props nhận vào | Kiểu dữ liệu | Mô tả | Refs xử lý | Cần forwardRef? |
|---|---|---|---|---|---|
| **EyeCanvas** | `eyeDataRef` | `React.RefObject<{left: EyeData, right: EyeData}>` | Ref chứa dữ liệu mắt trái/phải (ear, yaw, pitch, blinking) | `canvasRef` (internal) - dùng cho `<canvas ref={canvasRef}>` | **Không** - Parent không cần truy cập canvas element |
| **EyeCanvas** | `side` | `string` ("left" \| "right") | Chọn mắt trái hoặc phải để vẽ | - | - |
| **WaveformCanvas** | `earHistoryRef` | `React.RefObject<{left: number[], right: number[]}>` | Ref chứa lịch sử EAR values | `canvasRef` (internal) - dùng cho `<canvas ref={canvasRef}>` | **Không** - Parent không cần truy cập canvas element |
| **WaveformCanvas** | `side` | `string` ("left" \| "right") | Chọn data mắt trái hoặc phải | - | - |
| **WaveformCanvas** | `color` | `string` (optional) | Màu waveform, default "#1e90ff" | - | - |

#### CHI TIẾT LOGIC BÊN TRONG (giữ nguyên khi tách)

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

#### RỦI RO & LƯU Ý

| Rủi ro | Mức độ | Giải pháp |
|---|---|---|
| `EAR_HISTORY` constant dùng chung | Thấp | Import từ file constants hoặc truyền qua props |
| `useEffect` cleanup (cancelAnimationFrame) | Thấp | Đảm bảo giữ nguyên logic cleanup khi tách |
| Canvas ref internal | Không có | Không cần forwardRef vì parent không cần truy cập canvas |
| Ref mutation từ parent | Thấp | Đảm bảo ref luôn là mutable ref object |

---

### Bước 2.4 - BÓC TÁCH NHÓM B (UI Overlay Components)

#### DANH SÁCH COMPONENT NHÓM B

| STT | Component | Mô tả | Độ phức tạp |
|---|---|---|---|
| 1 | **PhoneFOMOOverlay** | Overlay cảnh báo sử dụng điện thoại, vẽ khung bracket xung quanh vùng phát hiện | Cao |
| 2 | **SmokingFOMOOverlay** | Overlay cảnh báo hút thuốc, vẽ khung xung quanh vùng miệng/phát hiện | Cao |
| 3 | **FaceMeshOverlay** | Vẽ mesh khuôn mặt, contour mắt, iris detection | Trung bình |
| 4 | **HandLandmarkOverlay** | Vẽ khung xương tay (hand skeleton) bằng MediaPipe Hands | Trung bình |
| 5 | **Head3D** | Render đầu người 3D bằng Three.js, xoay theo head pose | Cao |

#### PHÂN TÍCH SỬ DỤNG TRONG thucmuctest.jsx

**Vị trí gọi các component:**
```jsx
// Head3D - Line 2202
<Head3D poseRef={poseRef} />

// FaceMeshOverlay - Line 2671-2675
<FaceMeshOverlay
  landmarksRef={landmarksRef}
  eyeDataRef={eyeDataRef}
  videoRef={videoRef}
/>

// HandLandmarkOverlay - Line 2678-2681
<HandLandmarkOverlay
  handLandmarksRef={handLandmarksRef}
  videoRef={videoRef}
/>

// PhoneFOMOOverlay - Line 2690-2694
<PhoneFOMOOverlay
  phoneDetectionRef={phoneDetectionRef}
  landmarksRef={landmarksRef}
  videoRef={videoRef}
/>

// SmokingFOMOOverlay - Line 2697-2700 (có điều kiện SMOKING_ENABLED)
<SmokingFOMOOverlay
  smokingDetectionRef={smokingDetectionRef}
  landmarksRef={landmarksRef}
  videoRef={videoRef}
/>
```

---

#### BẢNG MAPPING PROPS & REFS - NHÓM B

| Component | Props nhận vào | Kiểu dữ liệu | Mô tả | Refs xử lý | Cần forwardRef? |
|---|---|---|---|---|---|
| **PhoneFOMOOverlay** | `phoneDetectionRef` | `React.RefObject<{active: boolean, bbox: {x1,y1,x2,y2}}>` | Ref chứa trạng thái phát hiện điện thoại | `canvasRef` (internal), `smoothBoxRef` (internal lerp box), `pulseRef` (animation) | **Không** |
| **PhoneFOMOOverlay** | `landmarksRef` | `React.RefObject<FaceLandmarks>` | Ref landmarks để tính fallback box khi không có bbox | - | - |
| **PhoneFOMOOverlay** | `videoRef` | `React.RefObject<HTMLVideoElement>` | Ref video để lấy kích thước và coordinate mapping | - | - |
| **SmokingFOMOOverlay** | `smokingDetectionRef` | `React.RefObject<{active: boolean, bbox: {x1,y1,x2,y2}}>` | Ref chứa trạng thái phát hiện hút thuốc | `canvasRef`, `smoothBoxRef`, `pulseRef` | **Không** |
| **SmokingFOMOOverlay** | `landmarksRef` | `React.RefObject<FaceLandmarks>` | Ref landmarks để tính mouth box | - | - |
| **SmokingFOMOOverlay** | `videoRef` | `React.RefObject<HTMLVideoElement>` | Ref video để lấy kích thước | - | - |
| **FaceMeshOverlay** | `landmarksRef` | `React.RefObject<FaceLandmarks>` | Ref chứa 468 facial landmarks | `canvasRef` | **Không** |
| **FaceMeshOverlay** | `eyeDataRef` | `React.RefObject<{left: EyeData, right: EyeData}>` | Ref dữ liệu mắt để tô màu blink | - | - |
| **FaceMeshOverlay** | `videoRef` | `React.RefObject<HTMLVideoElement>` | Ref video để lấy kích thước | - | - |
| **HandLandmarkOverlay** | `handLandmarksRef` | `React.RefObject<HandLandmarks[]>` | Ref chứa mảng landmarks của các bàn tay (tối đa 2) | `canvasRef` | **Không** |
| **HandLandmarkOverlay** | `videoRef` | `React.RefObject<HTMLVideoElement>` | Ref video để lấy kích thước | - | - |
| **Head3D** | `poseRef` | `React.RefObject<{yaw, pitch, roll}>` | Ref chứa head pose angles (radians) | `mountRef` (container div), Three.js objects internal | **Không** |

#### CHI TIẾT LOGIC BÊN TRONG (giữ nguyên khi tách)

**PhoneFOMOOverlay:**
- **ResizeObserver**: Theo dõi video resize để cập nhật canvas.width/height
- **RAF Loop**: Vẽ liên tục 60fps
- **Logic vẽ**: 
  - Đọc `phoneDetectionRef.current` để kiểm tra `active`
  - Vẽ bracket corners xung quanh bbox (hoặc fallback box từ landmarks)
  - Hiệu ứng pulse khi phát hiện
  - Màu sắc: vàng (warning) → đỏ (critical) theo thời gian
- **Dependencies**: `videoRef`, `phoneDetectionRef`, `landmarksRef`

**SmokingFOMOOverlay:**
- **ResizeObserver**: Tương tự PhoneFOMO
- **RAF Loop**: Vẽ liên tục
- **Logic vẽ**:
  - Đọc `smokingDetectionRef.current.active`
  - Vẽ box xung quanh vùng miệng (từ landmarks) hoặc bbox
  - Hiệu ứng glow/pulse
- **Dependencies**: `videoRef`, `smokingDetectionRef`, `landmarksRef`

**FaceMeshOverlay:**
- **ResizeObserver**: Theo dõi video
- **RAF Loop**: Vẽ mesh
- **Logic vẽ**:
  - Vẽ toàn bộ 468 landmarks dưới dạng points
  - Vẽ contour mắt (left/right eye indices)
  - Vẽ iris với hiệu ứng blink (dựa trên `eyeDataRef` EAR threshold)
  - Màu thay đổi khi blink (xanh → vàng)
- **Dependencies**: `videoRef`, `landmarksRef`, `eyeDataRef`
- **Constants dùng chung**: `EAR_BLINK_THRESH`, `L_EYE`, `R_EYE` (import từ dmsConstants)

**HandLandmarkOverlay:**
- **ResizeObserver**: Theo dõi video
- **RAF Loop**: Vẽ skeleton
- **Logic vẽ**:
  - Đọc `handLandmarksRef.current` (mảng hands, max 2)
  - Vẽ connections giữa các joints (HAND_CONNECTIONS)
  - Màu khác nhau cho từng hand (xanh lá, hồng)
  - Mirror x-coordinate: `W - x * W`
- **Dependencies**: `videoRef`, `handLandmarksRef`
- **Constants dùng chung**: `HAND_CONNECTIONS` (cần export từ constants)

**Head3D:**
- **Three.js Setup**: Scene, Camera, Renderer, Lights
- **RAF Loop**: `animate()` cập nhật rotation
- **Logic vẽ**:
  - Tạo head mesh từ các SphereGeometry (đầu, mặt, mũi, tai, mắt, miệng)
  - Đọc `poseRef.current` (yaw, pitch, roll)
  - Lerp rotation để mượt
  - Render WebGL
- **Cleanup**: `renderer.dispose()`, `ro.disconnect()`, `cancelAnimationFrame`
- **Dependencies**: `poseRef`
- **External Lib**: `THREE` (three.js)

#### RỦI RO & LƯU Ý ĐẶC BIỆT NHÓM B

| Rủi ro | Mức độ | Giải pháp |
|---|---|---|
| **HAND_CONNECTIONS constant** | Trung bình | Cần thêm vào `dmsConstants.js` - hiện đang nằm trong scope thucmuctest.jsx |
| **Three.js dependency** (Head3D) | Thấp | Giữ nguyên import THREE, đảm bảo Three.js đã có trong package.json |
| **Canvas resize theo video** | Trung bình | Tất cả overlay đều dùng ResizeObserver → giữ nguyên logic, không cần truyền width/height |
| **Mirror X coordinate** | Thấp | Logic `W - x * W` cần giữ nguyên trong tất cả overlay |
| **Color constants** (FOMO pulse) | Thấp | Có thể định nghĩa trong component hoặc truyền qua props |
| **Nhiều RAF loops chạy song song** | Thấp | Mỗi component có RAF riêng, cleanup đúng là ổn |
| **SMOKING_ENABLED flag** | Thấp | Giữ nguyên điều kiện render ở parent, component không cần biết |

---

### Tiêu chuẩn Test Thành Công
- [x] Giao diện load không có lỗi đỏ trong console
- [x] Các canvas overlay hiển thị chính xác như cũ (mắt 3D, waveform EAR)
- [x] Không có warning về thiếu ref, lỗi forwardRef, hoặc re-render bất thường
- [x] Animation vẽ mắt và waveform chạy mượt (60fps)

#### Nhóm A - Đã thực hiện:
- [x] Tạo `constants/dmsConstants.js` - chứa EAR_HISTORY, EAR_BLINK_THRESH, LABEL_MAP, STATUS_ICONS, L_EYE, R_EYE
- [x] Tạo `components/EyeCanvas.jsx` - component vẽ mắt với props: eyeDataRef, side
- [x] Tạo `components/WaveformCanvas.jsx` - component vẽ waveform với props: earHistoryRef, side, color
- [x] Cập nhật `thucmuctest.jsx` - import components mới, xóa các hàm EyeCanvas và WaveformCanvas cũ, xóa constants cũ
- [x] Dọn dẹp file re-export còn sót lại trong `features/` (6 file trỏ đến medical components đã xóa)
- [x] Cập nhật `app/App.jsx` - xóa import và routes cho medical components + Login, redirect / và legacy routes về /test3
- [x] Sửa `Login/Login.jsx` - thay `getMedicalApiBase` → `getDmsApiBase` (import + usage)

#### Nhóm B - Đã thực hiện:
- [x] `PhoneFOMOOverlay.jsx` - props: phoneDetectionRef, landmarksRef, videoRef
- [x] `SmokingFOMOOverlay.jsx` - props: smokingDetectionRef, landmarksRef, videoRef
- [x] `FaceMeshOverlay.jsx` - props: landmarksRef, eyeDataRef, videoRef
- [x] `HandLandmarkOverlay.jsx` - props: handLandmarksRef, videoRef
- [x] `Head3D.jsx` - props: poseRef
- [x] Thêm `HAND_CONNECTIONS`, `LEFT_EYE_IDX`, `RIGHT_EYE_IDX`, `FACE_OVAL_IDX`, `LIPS_IDX` vào `dmsConstants.js`
- [x] Cập nhật `thucmuctest.jsx` - xóa 5 hàm component cũ + constants, import components mới

#### Nhóm C1 - ĐÃ THỰC HIỆN (Custom Hooks):
- [x] `hooks/useDmsCamera.js` - Hook quản lý camera (startCamera, stopCamera, videoRef, streamRef)
- [x] `hooks/useMediaPipe.js` - Hook khởi tạo FaceMesh + Hands (landmarks, handLandmarks, pose, eyeData, v.v.)
- [x] `utils/dmsMath.js` - Các hàm tính toán (computeEAR, estimateHeadPose, distPts, v.v.)
- [x] `thucmuctest.jsx` - Import và sử dụng 2 hooks, xóa ~850 dòng code cũ (5 components + helpers + constants)

#### Bảng Mapping Nhóm C1

##### useDmsCamera Hook

| Aspect | Chi tiết |
|--------|----------|
| **Inputs (Props)** | `{ onError?: (msg: string) => void, onStatusChange?: (status: string) => void }` |
| **Outputs (Return)** | `{ videoRef: React.RefObject<HTMLVideoElement>, streamRef: React.RefObject<MediaStream>, startCamera: () => Promise<void>, stopCamera: () => void, isReady: boolean }` |
| **useEffect chuyển vào** | 1. `startWebcam()` function (gọi getUserMedia)  <br>2. `stopWebcam()` cleanup (stop tracks, reset refs)  <br>3. `useEffect(() => { startWebcam(); return () => stopWebcam(); }, [])` từ line 1061-1063 |
| **Dependencies** | Không phụ thuộc hook khác. Độc lập. |
| **Infinite Loop Risk** | **THẤP** - Chỉ chạy 1 lần khi mount, cleanup khi unmount. Không có state dependencies vòng lặp. |
| **Lưu ý quan trọng** | - Giữ nguyên `getWebcamSupportErrorMessage()` check  <br>- Giữ nguyên video constraints `{ width: 640, height: 480, facingMode: "user" }`  <br>- `streamRef` và `videoRef` trả về dạng refs (không phải state) để tránh re-render không cần thiết |

##### useMediaPipe Hook

| Aspect | Chi tiết |
|--------|----------|
| **Inputs (Props)** | `{ videoRef: React.RefObject<HTMLVideoElement>, status: string, enabled?: boolean }` |
| **Outputs (Return)** | `{ faceMeshRef: React.RefObject<any>, handsRef: React.RefObject<any>, isLoaded: boolean, landmarksRef: React.RefObject<any[]>, handLandmarksRef: React.RefObject<any[][]>, poseRef: React.RefObject<Pose>, eyeDataRef: React.RefObject<EyeData>, earHistoryRef: React.RefObject<EarHistory>, blinkStateRef: React.RefObject<BlinkState>, blinkTimesRef: React.RefObject<number[]>, frameCount: number }` |
| **useEffect chuyển vào** | 1. **Init Effect** (line 757-962): Load scripts FaceMesh + Hands, khởi tạo instances, setup `onResults` callbacks  <br>2. **Processing Loop** (line 965-996): RAF loop gọi `fm.send()` và `hs.send()` với video frame  <br>3. **Display Update** (line 897-962): `setInterval` cập nhật `displayPose`, `displayEye` cho UI |
| **Dependencies** | **PHỤ THUỘC VÀO useDmsCamera** - Cần `videoRef` từ useDmsCamera để:  <br>- Kiểm tra `vid.readyState >= 2` trong processing loop  <br>- Truyền vào `fm.send({ image: vid })`  <br>- Hook này phải nhận `videoRef` từ bên ngoài (props), không tự tạo |
| **Infinite Loop Risk** | **TRUNG BÌNH** - Cần cẩn thận với:  <br>- `status` dependency: Processing loop chỉ chạy khi `status === "active"` (line 966)  <br>- `faceMeshRef`, `handsRef` là refs (không trigger re-render)  <br>- `frameCount` là state (dùng để trigger re-render UI) nhưng chỉ tăng mỗi 33ms  <br>- **Tránh**: Không đưa `landmarksRef.current` vào dependency array (luôn thay đổi) |
| **Lưu ý quan trọng** | - Giữ nguyên `loadScript()` logic để tránh load script duplicate  <br>- Giữ nguyên `estimateHeadPose()`, `computeEAR()`, `computePupilRadius()` calls trong `onResults`  <br>- Giữ nguyên `EAR_BLINK_THRESH`, `EAR_HISTORY` từ `dmsConstants.js`  <br>- `onResults` callbacks vẫn cập nhật refs (không state) để tránh re-render quá nhiều  <br>- `setFrameCount` chỉ để UI biết đang processing |

##### Flow tích hợp 2 Hooks
```jsx
// Trong DriverMonitorDMS:
const { videoRef, streamRef, startCamera, stopCamera, isReady } = useDmsCamera({
  onError: setErrorMsg,
  onStatusChange: setStatus
});

const { 
  faceMeshRef, handsRef, isLoaded,
  landmarksRef, handLandmarksRef, poseRef, eyeDataRef, earHistoryRef,
  frameCount 
} = useMediaPipe({
  videoRef,        // ← Truyền từ useDmsCamera
  status,          // ← Trạng thái app
  enabled: isReady // ← Chỉ chạy khi camera ready
});
```

##### Checklist Nhóm C1:
- [x] Phê duyệt Input/Output của `useDmsCamera`
- [x] Phê duyệt Input/Output của `useMediaPipe`
- [x] Phê duyệt cách truyền `videoRef` từ useDmsCamera → useMediaPipe
- [x] Phê duyệt việc chuyển 3 useEffects (init, loop, display) vào useMediaPipe
- [x] Xác nhận không có infinite loop risk
- [x] **Sau phê duyệt**: Tạo 2 file hooks và cập nhật thucmuctest.jsx

### Ghi chú / Rủi ro
- Project có code liên quan medical/y tế cần tách bỏ
- Cần kiểm tra cẩn thận để không xóa nhầm code DMS thật sự

### Lịch sử thay đổi
- [2025-05-09] Session 1: Khởi động session, tạo task.md, bắt đầu Giai đoạn 1 - Audit toàn dự án
- [2025-05-09] Session 1 (tiếp): Hoàn tất Giai đoạn 1.3 - Đã xóa 11 file/thư mục theo phê duyệt (Nhóm A + Nhóm B + DoctorChatbot.jsx)
- [2025-05-09] Session 2: Hoàn tất Giai đoạn 2.3 - Bóc tách Nhóm A (EyeCanvas.jsx, WaveformCanvas.jsx, dmsConstants.js)
- [2025-05-09] Session 3: Hoàn tất Giai đoạn 2.4 - Bóc tách Nhóm B (5 overlay components + constants)
- [2025-05-09] Session 4: Hoàn tất Giai đoạn 2.5 - Bóc tách Nhóm C1 (useDmsCamera.js, useMediaPipe.js, dmsMath.js)
- [2026-05-09] Session 5: Hoàn tất Giai đoạn 2.7 - Bóc tách Nhóm C2 (useWebSocket.js, useDmsAudio.js, useDrivingSession.js)
- [2026-05-09] Session 6: Vá lỗi tích hợp C2 - tăng identity burst frames, khôi phục alert/alarm effect, warm-up AudioContext, bật smoking detection
- [2026-05-09] Session 7: Tinh chỉnh C2 - safe vibrate, chỉ chạy alert loop sau user gesture, thêm log debug gửi phone frame WebSocket

---

### Bước 2.6 - BÓC TÁCH NHÓM C2 (Mạng & Cảnh báo)

#### Mục tiêu
Chuẩn bị tách phần logic còn lại trong `frontend/demothuattoanpro/src/testdata/thucmuctest.jsx` thành 3 hooks:

1. `hooks/useWebSocket.js` - Socket.IO cho phone/smoking detection
2. `hooks/useDmsAudio.js` - AudioContext, beep alarm, vibration
3. `hooks/useDrivingSession.js` - API start/end driving session, record alert, session log

#### Bảng Mapping Input / Output - Nhóm C2

| Hook | Inputs | Outputs | Logic / useEffect sẽ di chuyển | Phụ thuộc chéo |
|---|---|---|---|---|
| `useWebSocket` | `{ apiBase, videoRef, status, smokingEnabled, constants? }` gồm các ngưỡng `PHONE_WS_FPS`, `PHONE_YOLO_MIN_PROB`, `PHONE_HISTORY_LEN`, `PHONE_STABLE_FRAMES`, `PHONE_OFF_FRAMES`, `SMOKING_WS_FPS`, `SMOKING_MIN_PROB`, `SMOKING_HISTORY_LEN`, `SMOKING_STABLE_FRAMES`, `SMOKING_OFF_FRAMES` | `{ socketRef, wsConnected, phoneDetectionRef, smokingDetectionRef, phoneActive, smokingActive, phoneError, smokingHistory, phoneHistory }` | 1. WebSocket setup `io(apiBase)` và handlers `connect`, `disconnect`, `connect_error`, `phone_result`, `smoking_result`. 2. Phone send loop RAF ~20fps, emit `phone_frame`. 3. Smoking send loop RAF ~4fps, emit `smoking_frame`. 4. Hysteresis refs: `phoneActiveFilteredRef`, `phoneOnStreakRef`, `phoneOffStreakRef`, `phoneLastBoxRef`, `smokingActiveRef`, pending refs. | Phụ thuộc `useDmsCamera` qua `videoRef`. Không phụ thuộc `useDmsAudio`; chỉ trả detection state/ref để parent hoặc hook cảnh báo khác dùng. |
| `useDmsAudio` | Không bắt buộc. Có thể nhận `{ enabled?: boolean }` nếu cần khóa audio khi status không active. | `{ audioCtxRef, startAlarm, stopAlarm, playBeep }` | 1. Helper `getAudioCtx()`. 2. Helper `playBeep(freq, dur, vol)`. 3. `startAlarm()` phát beep 880/660Hz, tạo `alarmIntervalRef`, kích hoạt `navigator.vibrate`. 4. `stopAlarm()` clear interval và tắt rung. 5. Cleanup unmount nên gọi `stopAlarm()`. | Không nên đọc trực tiếp `phoneDetectionRef` từ `useWebSocket`. Hook này chỉ là tầng phát âm/rung. Parent vẫn quyết định khi nào gọi `startAlarm/stopAlarm` dựa trên `phoneAlert`, `smokingAlert`, `drowsyAlert` để tránh coupling vòng. |
| `useDrivingSession` | `{ apiBase, status, driverId, phoneAlert, smokingAlert, drowsyAlert }` | `{ drivingSessionIdRef, drivingSessionId, drivingSessionStartedAt, sessionAlertCounts, sessionLogOpen, setSessionLogOpen, sessionLogLoading, sessionLogItems, refreshSessionLog }` | 1. Effect start/end session khi `status` chuyển vào/ra `"active"`. 2. Effect baseline alert khi vừa có `drivingSessionId`. 3. Effect record alert khi `phoneAlert/smokingAlert/drowsyAlert` chuyển từ `null` sang non-null. 4. `refreshSessionLog()` gọi `listDrivingSessions`. 5. Effect refresh log khi mở session log. | Phụ thuộc alert states do parent quản lý. Không phụ thuộc `useWebSocket` trực tiếp; chỉ nhận `phoneAlert/smokingAlert`. Không phụ thuộc audio. |

#### Logic giữ lại tạm thời trong `thucmuctest.jsx`
- UI state và render JSX.
- Identity callbacks `handleIdentityUnlock`, `handleIdentityLock`, `handleUpdateIdentity`. Riêng `handleIdentityLock` cần nhận `stopAlarm` từ `useDmsAudio` sau khi tách.
- REST landmark loop và Hand API loop chưa thuộc C2; nên để nguyên cho bước sau.
- Alert duration refs `phoneSinceRef`, `smokingSinceRef`, `eyesClosedSinceRef/eyesClosedSecRef` cần rà lại trước khi đưa vào hook riêng vì file hiện tại chưa thấy effect tự động bật `phoneAlert/smokingAlert/drowsyAlert` từ các ngưỡng `PHONE_WARN_MS`, `SMOKING_WARN_MS`, `EYES_CLOSED_WARN_MS`.

#### Checklist Nhóm C2
- [x] Phê duyệt `useWebSocket` nhận `videoRef/status/apiBase` và trả về `phoneDetectionRef/smokingDetectionRef` cùng state UI liên quan
- [x] Phê duyệt `useDmsAudio` chỉ quản lý beep/rung, không đọc trực tiếp detection refs
- [x] Phê duyệt `useDrivingSession` nhận alert states và tự quản lý start/end/record/log
- [x] Xác nhận phần REST landmark + Hand API chưa tách trong Nhóm C2
- [x] Sau phê duyệt: tạo 3 hooks và cập nhật `thucmuctest.jsx` theo từng bước nhỏ

---

### Bước 2.7 - HOÀN TẤT BÓC TÁCH NHÓM C2 (Mạng & Cảnh báo)

#### Nhóm C2 - Đã thực hiện
- [x] Di chuyển hằng số C2 sang `constants/dmsConstants.js`: REST interval, WebSocket FPS, phone/smoking thresholds, `PHONE_WARN_MS`, `SMOKING_WARN_MS`, `EYES_CLOSED_WARN_MS`
- [x] Tạo `hooks/useWebSocket.js` - Socket.IO setup, phone/smoking result handlers, RAF send loops, hysteresis/pending refs
- [x] Tạo `hooks/useDmsAudio.js` - AudioContext, `playBeep`, `startAlarm`, `stopAlarm`, vibration cleanup
- [x] Tạo `hooks/useDrivingSession.js` - start/end session, baseline alert, record alert, session log refresh
- [x] Cập nhật `thucmuctest.jsx` để import/lắp 3 hook mới và xóa logic Socket/Audio/Driving Session cũ

#### Kiểm tra sau refactor
- [x] `npm.cmd run build` trong `frontend/demothuattoanpro` - PASS
- [x] `npx.cmd eslint src/testdata/hooks/useDmsAudio.js src/testdata/hooks/useDrivingSession.js src/testdata/hooks/useWebSocket.js` - PASS
- [x] `npm.cmd run lint` toàn repo - Bỏ qua lỗi cũ ngoài phạm vi C2

---

### Bước 2.8 - FIX BUG TÍCH HỢP SAU NHÓM C2

#### Đã thực hiện
- [x] `OwnerVerifyGate.jsx`: tăng `BURST_FRAMES` từ 2 lên 5 để `/api/identity/verify` có nhiều frame hơn, giảm lỗi 400 do thiếu frame face hợp lệ
- [x] `thucmuctest.jsx`: tăng `IDENTITY_BURST_FRAMES` từ 2 lên 5 cho REST landmark loop dùng chung helper capture burst
- [x] `useDmsAudio.js`: thêm `warmUpAudio()` để resume AudioContext trong user gesture
- [x] `thucmuctest.jsx`: destructure `startAlarm`, `stopAlarm`, `warmUpAudio` từ `useDmsAudio`
- [x] `thucmuctest.jsx`: thêm `handleStartCamera()` để warm-up audio khi user bấm Start/Retry/Activate Camera
- [x] `thucmuctest.jsx`: khôi phục effect cảnh báo polling 250ms, theo dõi `eyesClosedSecRef`, `phoneDetectionRef/phoneActive`, `smokingDetectionRef/smokingActive`, set `drowsyAlert/phoneAlert/smokingAlert`, và bật/tắt alarm
- [x] `thucmuctest.jsx`: bật `SMOKING_ENABLED = true`

#### Kiểm tra sau sửa
- [x] `npm.cmd run build` trong `frontend/demothuattoanpro` - PASS
- [x] `npx.cmd eslint src/testdata/hooks/useDmsAudio.js src/testdata/hooks/useWebSocket.js src/systeamdetectface/OwnerVerifyGate.jsx` - PASS

---

### Bước 2.9 - TINH CHỈNH UX/DEBUG SAU TEST C2

#### Đã thực hiện
- [x] `useDmsAudio.js`: bọc mọi lệnh `navigator.vibrate()` qua `safeVibrate()` để tránh lỗi đỏ khi Chrome chặn vibrate
- [x] `useDmsAudio.js`: `warmUpAudio()` gọi `ctx.resume()` và `safeVibrate(1)` trong user gesture, rồi set `audioUnlocked = true`
- [x] `thucmuctest.jsx`: alert polling loop chỉ chạy khi `status === "active"` và `audioUnlocked === true`
- [x] `useWebSocket.js`: thêm log debug có throttle 3 giây trước `sock.emit("phone_frame", { image })`

#### Kiểm tra
- [x] `npm.cmd run build` - PASS
- [x] `npx.cmd eslint src/testdata/hooks/useDmsAudio.js src/testdata/hooks/useWebSocket.js src/testdata/thucmuctest.jsx` - Đã xác nhận

---

### Bước 2.10 - HOTFIX CUỐI SAU AUDIT GIAI ĐOẠN 2

#### Đã thực hiện
- [x] `Head3D.jsx`: dispose geometry/material trong Three.js scene cleanup để giảm GPU memory leak
- [x] `useMediaPipe.js`: cleanup FaceMesh/Hands bằng `close()` và reset refs khi effect unmount/disable
- [x] `useDrivingSession.js`: end driving session trong cleanup nếu session ref còn tồn tại
- [x] `thucmuctest.jsx`: xóa dead destructuring/state: `streamRef`, `handsRef`, `mediaPipeLoaded`, `blinkStateRef`, `blinkTimesRef`, `identityThreshold`

---

### Giai đoạn 3 - Chuẩn hóa cấu trúc thư mục

#### Bước 3.1 - Danh sách cấu trúc lại thư mục

##### Phần A: Frontend - Xóa folder rỗng & file rác
- [x] Xóa folder `User/` (rỗng)
- [x] Xóa folder `chat/` (rỗng)
- [x] Xóa folder `features/admin/components/` (rỗng)
- [x] Xóa folder `features/chat/components/` (rỗng)
- [x] Xóa folder `features/user/components/` (rỗng)
- [x] Xóa folder `hand-dection/video/` (chứa file test cá nhân khanh.js, khanhvideo.mp4)
- [x] Xóa file `app/App.jsx` (trùng với root App.jsx)
- [x] Xóa file `shared/utils/cameraContext.js` (stub, trùng với utils/)
- [x] Xóa file `shared/utils/drivingSessionApi.js` (stub, trùng với utils/)
- [x] Xóa file `shared/utils/speakOwnerGreeting.js` (stub, trùng với utils/)
- [x] Xóa file `shared/constants/apiEndpoints.js` (stub, trùng với config/)

##### Phần B: Frontend - Đổi tên folder & file
- [x] Đổi tên folder `hand-dection` → `hand-detection`
- [x] Đổi tên folder `systeamdetectface` → `face-detection-system`
- [x] Đổi tên file `thucmuctest.jsx` → `DmsDashboard.jsx`
- [x] Đổi tên file `dectionhand.jsx` → `handDetection.jsx`
- [x] Đổi tên file `verifypro.jsx` → `verification.jsx` (cả 2 vị trí)

##### Phần C: Frontend - Tổ chức lại file vào vị trí đúng
- [x] Di chuyển `Login/Login.jsx` → `features/auth/components/Login.jsx` (ghi đè file stub)
- [x] Di chuyển `Login/Login.css` → `features/auth/components/Login.css`
- [x] Di chuyển `verify/verification.jsx` → `features/auth/components/verification.jsx` (ghi đè file stub)
- [x] Di chuyển `admin/PatientStatistics.css` → `features/admin/PatientStatistics.css`
- [x] Di chuyển toàn bộ folder `systeamdetectface/` → `features/dms/components/` (ghi đè file stub)
- [x] Di chuyển `hand-detection/dectionhand.jsx` → `features/gestures/components/handDetection.jsx` (ghi đè file stub)
- [x] Di chuyển `testdata/components/*` → `features/dms/components/` (7 file DMS components)
- [x] Di chuyển `testdata/constants/dmsConstants.js` → `shared/constants/dmsConstants.js`
- [x] Di chuyển `testdata/hooks/*` → `shared/hooks/` (5 file custom hooks)
- [x] Di chuyển `testdata/utils/dmsMath.js` → `shared/utils/dmsMath.js`
- [x] Di chuyển `testdata/DmsDashboard.jsx` → `features/dms/DmsDashboard.jsx`
- [x] Xóa folder `testdata/` sau khi di chuyển xong
- [x] Tách folder `voice/` thành:
    - `voice/components/FakeYouTubeLayout.jsx`
    - `voice/components/VoiceCarAssistant.jsx`
    - `voice/utils/parseVoiceCommand.js`
    - `voice/utils/speakReply.js`

##### Phần D: Frontend - Tổ chức lại utils
- [x] Di chuyển `utils/cameraContext.js` → `shared/contexts/cameraContext.js`
- [x] Di chuyển `utils/drivingSessionApi.js` → `shared/api/drivingSessionApi.js`
- [x] Di chuyển `utils/speakOwnerGreeting.js` → `shared/utils/speakOwnerGreeting.js`
- [x] Xóa folder `utils/` sau khi di chuyển xong

##### Phần E: Backend - Xóa file rỗng
- [x] Xóa file `driver_training/main.py` (rỗng)
- [x] Xóa file `driver_training/train/train_drowsy.py` (rỗng)
- [x] Xóa file `driver_training/train/train_emotion.py` (rỗng)
- [x] Xóa file `driver_training/train/train_posture.py` (rỗng)
- [x] Xóa file `driver_training/utils/alert.py` (rỗng)
- [x] Xóa file `driver_training/utils/common_detect.py` (rỗng)
- [x] Xóa file `driver_training/utils/common_train.py` (rỗng)

##### Phần F: Backend - Đổi tên & tổ chức lại
- [x] Đổi tên file `data/patient_data.py` → `data/driver_data.py`
- [x] Di chuyển `data/database.py` → `src/repositories/database.py` (ghi đè file stub)
- [x] Xóa folder `data/` sau khi di chuyển database.py (chỉ giữ lại data/api/)

---

### Giai đoạn 4 - Deep Clean Kiến trúc Thư mục (Chờ duyệt)

#### Nhiệm vụ 1: Dọn sạch tàn dư Medical (Hoàn tất)
- [x] Xóa `backend/src/repositories/database.py` (Medical DB class)
- [x] Xóa `backend/data/driver_data.py` (PATIENT_DATA y tế)
- [x] Xóa `backend/src/utils/patient_data.py` (bridge file)
- [x] Xóa `backend/src/services/len.py` (bridge Medical service)
- [x] Xóa `backend/src/app/database.py` (bridge tới Medical DB)
- [x] Xóa `frontend/src/features/admin/` (PatientStatistics.css)
- [x] Sửa `Login.jsx`: Đổi "Medical AI" → "DMS - Driver Monitoring System"

#### Nhiệm vụ 2: Deep Clean Frontend (`src/`)
- [x] Thêm Barrel Pattern: Tạo `index.js` cho `features/dms/components/`
- [x] Thêm Barrel Pattern: Tạo `index.js` cho `shared/hooks/`
- [x] Thêm Barrel Pattern: Tạo `index.js` cho `shared/utils/`
- [x] Thêm Barrel Pattern: Tạo `index.js` cho `shared/constants/`
- [x] Phân nhóm `features/dms/components/` (15 file) thành sub-folders: `overlays/`, `panels/`, `core/`
- [x] Xóa folder rỗng: `features/chat/`, `features/user/`
- [x] Xóa `Login.css` (0 bytes) và folder `styles/` (chỉ có re-import rộng)
- [x] Sửa `features/gestures/components/dectionhand.jsx` (stub sai path → `./handDetection`)

#### Nhiệm vụ 3: Deep Clean Backend (`backend/`)
- [x] Bóc tách `data/api/runtime.py`: Tách `src/core/config.py` (MYSQL_CONFIG, constants)
- [x] Bóc tách `data/api/runtime.py`: Tách `src/services/model_loader.py` (5 ML models)
- [x] Bóc tách `data/api/runtime.py`: Tách `src/repositories/db_connection.py` (DB helpers)
- [x] Refactor `runtime.py` để import từ các module mới
- [x] Fix lỗi 500: Thêm import PATHs và auto-load models
- [x] Xóa các folder rỗng: `src/repositories/`, `src/services/`, `src/utils/`, `src/app/`, `src/api/` (nếu chỉ còn `__init__.py`)

#### Nhiệm vụ 4: Sprint 4 - Chuẩn hóa và Đổi tên API Routes ✅
**Backend Changes:**
- [x] Tạo `backend/src/api/routers/auth_routes.py` (từ `routes_identity.py`)
  - Đổi `/api/identity/*` → `/api/auth/*`
  - Giữ `/api/telegram/webhook`
- [x] Tạo `backend/src/api/routers/monitor_routes.py` (từ `routes_prediction.py`)
  - Đổi `/api/landmark/predict_from_frame` → `/api/monitor/face`
  - Đổi `/api/landmark/predict` → `/api/monitor/face/predict`
  - Đổi `/api/hand/predict_from_frame` → `/api/monitor/hand`
  - Đổi `/api/hand/predict` → `/api/monitor/hand/predict`
  - Đổi `/api/smoking/predict_from_frame` → `/api/monitor/smoking`
  - Đổi `/api/phone/predict_from_frame` → `/api/monitor/phone`
  - Đổi `/api/phone/detect_from_frame` → `/api/monitor/phone/detect`
  - Giữ `/health`
- [x] Tạo `backend/src/api/routers/session_routes.py` (từ `routes_driving.py`)
  - Đổi `/api/driving/session/start` → `/api/session/start`
  - Đổi `/api/driving/session/end` → `/api/session/end`
  - Đổi `/api/driving/session/alert` → `/api/session/alert`
  - Đổi `/api/driving/sessions` → `/api/session/list`
  - Đổi `/api/driving/session/<id>` → `/api/session/<id>`
- [x] Cập nhật `backend/data/api/api.py` để import từ routers mới

**Frontend Changes:**
- [x] Cập nhật `shared/api/drivingSessionApi.js` (4 endpoints)
- [x] Cập nhật `features/dms/DmsDashboard.jsx` (3 endpoints)
- [x] Cập nhật `features/gestures/components/handDetection.jsx` (1 endpoint)
- [x] Cập nhật `features/dms/components/core/OwnerVerifyGate.jsx` (3 endpoints + comment)
- [x] Cập nhật `features/dms/components/core/face_detect.jsx` (3 endpoints + comment)
