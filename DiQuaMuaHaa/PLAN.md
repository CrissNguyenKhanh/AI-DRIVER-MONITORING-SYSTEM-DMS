# PLAN — Hệ thống AI Giám sát Tài xế (DMS)

> **Tracking:** Khi hoàn thành một task, báo "Đã xong phần [Tên Task]" để cập nhật và nhận hướng dẫn task tiếp theo.

---

## Phase 0: Hotfix P0 (Ưu tiên cao nhất)

- [x] **P0-1:** Xóa `SMOKING_ENABLED = false` trong `thucmuctest.jsx` (dòng 51)
- [x] **P0-2:** Sửa stub WebSocket `smoking_frame` trong `api.py` (bỏ `return` sớm, chạy pipeline thật)
- [x] **P0-3:** Kết nối API label `drowsy`/`yawning` từ backend vào `setDrowsyAlert()` trong `thucmuctest.jsx`

---

## Phase 1: Thu thập Dữ liệu (Dataset Collection)

> **Mục tiêu:** Đạt ≥ 2000 mẫu/class × 5 class = 10.000 mẫu.
> **Chiến lược:** Dùng engineered features (EAR/MAR/ratio) thay vì 1434 tọa độ thô.

### 1.1 Nâng cấp Feature Extraction

- [ ] **1.1-1:** Thêm hàm `compute_ear(landmarks, eye_indices)` vào `collect_landmarks.py`
  - Công thức: `EAR = (‖p2-p6‖ + ‖p3-p5‖) / (2 × ‖p1-p4‖)`
  - Left eye indices: `[33, 160, 158, 133, 153, 144]`
  - Right eye indices: `[362, 385, 387, 263, 373, 380]`

- [ ] **1.1-2:** Thêm hàm `compute_mar(landmarks, mouth_indices)` vào `collect_landmarks.py`
  - Công thức: `MAR = (‖p2-p8‖ + ‖p3-p7‖ + ‖p4-p6‖) / (3 × ‖p1-p5‖)`
  - Mouth indices: `[61, 291, 0, 17, 13, 14]`

- [ ] **1.1-3:** Thêm hàm `compute_head_pitch(landmarks)` vào `collect_landmarks.py`
  - Tính tỉ lệ `nose_y / face_height` dùng landmarks: mũi (4), trán (10), cằm (152)

- [ ] **1.1-4:** Thay hàm `lms_to_vec()` bằng `lms_to_engineered_vec()` — trả về vector 8 features:
  ```
  [ear_left, ear_right, ear_avg, ear_asymmetry, mar, head_pitch, blink_binary, mouth_open_binary]
  ```

### 1.2 Thu thập Data Tự quay

- [ ] **1.2-1:** Tăng `TARGET = 2000` và `BATCH_SIZE = 50` trong `collect_landmarks.py`
- [ ] **1.2-2:** Thu thập ≥ 500 mẫu cho class `safe` (ngồi thẳng, mắt mở tự nhiên)
- [ ] **1.2-3:** Thu thập ≥ 500 mẫu cho class `drowsy` (mắt lim dim, đầu hơi gật)
- [ ] **1.2-4:** Thu thập ≥ 500 mẫu cho class `yawning` (há miệng to)
- [ ] **1.2-5:** Thu thập ≥ 500 mẫu cho class `angry` (cau mày, nhăn mặt)
- [ ] **1.2-6:** Thu thập ≥ 500 mẫu cho class `stressed` (mắt liếc, căng thẳng)

### 1.3 Tích hợp Data từ Kaggle

- [ ] **1.3-1:** Tải Kaggle API token, cài `pip install kaggle`
- [ ] **1.3-2:** Tải dataset: `kaggle datasets download -d ismailnasri20/driver-drowsiness-dataset-ddd`
- [ ] **1.3-3:** Chạy `convert_dataset_to_landmarks.py` để convert ảnh Kaggle → CSV landmarks
- [ ] **1.3-4:** Gộp `landmarks.csv` (tự thu) + `landmarks_kaggle.csv` → `landmarks_combined.csv`

---

## Phase 2: Training & Đánh giá Model

> **Mục tiêu:** Có model đạt accuracy ≥ 85% trên tập validation.

- [ ] **2-1:** Thêm `RandomForestClassifier` vào `train_landmarks.py` làm baseline model
- [ ] **2-2:** Thêm hàm `compare_models()` — so sánh MLP vs Random Forest vs SVM cùng 1 dataset
- [ ] **2-3:** Train với `landmarks_combined.csv`, xem `classification_report`
- [ ] **2-4:** Phân tích `feature_importances_` của Random Forest — xem EAR hay MAR quan trọng hơn
- [ ] **2-5:** Lưu model tốt nhất → `driver_training/models/landmark_model.pkl`

---

## Phase 3: Tối ưu Backend API

- [ ] **3-1:** Đổi `static_image_mode=False` trong `api.py` → tăng tốc inference video stream
- [ ] **3-2:** Đưa Telegram bot token ra file `.env` (không hardcode trong code)
- [ ] **3-3:** Thêm `fm.close()` cleanup cho MediaPipe FaceMesh trong `thucmuctest.jsx`
- [ ] **3-4:** *(P3)* Tách inference ra worker thread riêng dùng `concurrent.futures.ThreadPoolExecutor`

---

## Phase 4: Refactor Frontend

- [x] **4-1:** Tách camera logic → `src/dms/hooks/useCamera.js`
- [x] **4-2:** Tách MediaPipe/EAR/blink logic → `src/dms/hooks/useDriverAI.js`
- [x] **4-3:** Tách alert/alarm logic (250ms interval) → `src/dms/hooks/useDriverAlerts.js`
- [x] **4-4:** Tách WebSocket phone/smoking → `src/dms/hooks/useDmsSocket.js`
- [x] **4-5:** Tách constants → `src/dms/constants/dmsConfig.js`
- [x] **4-6:** Tách geometry utils → `src/dms/utils/geometry.js`
- [x] **4-7:** Tách 6 overlay components ra `src/dms/components/overlays/`
- [x] **4-8:** Tách alert overlays → `src/dms/components/alerts/`
- [x] **4-9:** Tách HUD panels → `src/dms/components/hud/`
- [x] **4-10:** Tạo `src/dms/index.jsx` — DriverMonitorDMS gọn ~300 dòng dùng các hooks mới

---

## Phase 5: Nâng cao (Advanced)

- [ ] **5-1:** Thử nghiệm pretrained model (dùng MobileNet/EfficientNet thay MLP thuần)
- [ ] **5-2:** Thêm PERCLOS metric (% thời gian mắt nhắm trong 1 phút) → cảnh báo chính xác hơn
- [ ] **5-3:** Export model sang ONNX để inference nhanh hơn
- [ ] **5-4:** Async inference queue với Redis + Celery

---

## Tiến độ tổng quan

| Phase | Tên | Trạng thái | Số task |
|-------|-----|-----------|---------|
| 0 | Hotfix P0 | ⏳ Chưa bắt đầu | 3 tasks |
| 1 | Thu thập Dataset | ⏳ Chưa bắt đầu | 13 tasks |
| 2 | Training & Đánh giá | ⏳ Chưa bắt đầu | 5 tasks |
| 3 | Tối ưu Backend | ⏳ Chưa bắt đầu | 4 tasks |
| 4 | Refactor Frontend | ⏳ Chưa bắt đầu | 4 tasks |
| 5 | Nâng cao | ⏳ Chưa bắt đầu | 4 tasks |
