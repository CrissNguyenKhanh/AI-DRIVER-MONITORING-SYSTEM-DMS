# Handoff — DMS + ADAS Integrated Cockpit V2

## 1. Baseline và nhánh

- Repository nguồn được giữ nguyên dirty work; triển khai diễn ra trong worktree riêng `D:\mirofish\dms-integrated-cockpit-v2`.
- Base `origin/main`: `3069424` (sau PR #12/#13).
- Nhánh: `feat/dms-adas-integrated-cockpit-v2`.
- Không chứa commit riêng của PR #11.

## 2. Cách chạy offline demo

```powershell
cd D:\mirofish\AI-DRIVER-MONITORING-SYSTEM-DMS\DiQuaMuaHaa\frontend\demothuattoanpro
npm install
$env:VITE_API_BASE = "/"
npm run dev
```

Mở:

```text
https://localhost:5173/demo/road-driving
```

Nếu chứng chỉ dev HTTPS chưa được browser tin cậy, dùng URL mà Vite in ra và tự xác minh môi trường local; không tắt/bypass security cho môi trường production.

Demo đề nghị:

1. Chọn `S20 — Showcase tích hợp`.
2. Nhấn `Bật âm thanh` (user gesture bắt buộc), tùy chọn bật giọng Việt.
3. Nhấn `Chạy`.
4. Theo dõi DISTRACTED, obstacle warning, BRAKING, trajectory, xi-nhan, lane change, recovery và report.
5. Thử S18 để xem safe stop và S16/S19 để xem UNKNOWN không chuyển làn.
6. Xuất JSON report/CSV timeline hoặc ghi canvas demo.

## 3. Cách chạy Live DMS + Virtual Road

Backend dùng setup hiện có của dự án:

```powershell
cd D:\mirofish\AI-DRIVER-MONITORING-SYSTEM-DMS\DiQuaMuaHaa\backend
python app.py
```

Trong cockpit:

1. Chọn `LIVE DMS + VIRTUAL ROAD`.
2. Nhấn `Mở DMS thật trong tab mới` để vào `/test3`.
3. Hoàn tất camera/auth theo workflow hiện có; không có bypass trong cockpit.
4. DMS surface publish metrics đã rút gọn; cockpit nhận transition qua `BroadcastChannel`.
5. Nếu backend/camera/model không sẵn sàng, cockpit giữ `UNKNOWN/UNAVAILABLE` và không thay bằng fixture giả.

Road và xe vẫn là mô phỏng ngay cả khi DMS input là thật.

## 4. File chính

- Cockpit: `DiQuaMuaHaa/frontend/demothuattoanpro/src/simulation/RoadDrivingDemo.jsx`
- Scene: `.../simulation/VirtualRoadScene.jsx`
- Event/alert/audio: `eventContract.js`, `SafetyAlertEngine.js`, `AudioAlertManager.js`
- DMS bridge: `src/utils/DriverMonitoringAdapter.js`
- Road adapter/physics: `RoadPerceptionAdapter.js`, `roadSimulation.js`, `SimulationOrchestrator.js`
- Session/report: `DrivingEventTimeline.js`, `SimulationSessionManager.js`, `SimulationReport.js`
- Scenarios: `scenarios.js`, `presentation.js`
- Tests: `tests/integratedCockpitV2.test.js`, `tests/driverMonitoringAdapter.test.js` và regression tests cũ.

## 5. Trạng thái validation

- Frontend: 58/58 PASS.
- Backend: 58/58 PASS.
- V2 scoped lint: PASS.
- Production build với `VITE_API_BASE=/`: PASS.
- Global lint: FAIL do baseline debt (39 errors, 17 warnings).
- Browser/visual/audio/recording E2E: NOT VERIFIED do không có browser provider/native UI pipe.

## 6. Phần còn thiếu / roadmap

Ưu tiên tiếp theo:

1. Chạy visual E2E trên Chrome/Edge thật, ghi screenshot/video S20 và kiểm tra console.
2. Đưa webcam preview có consent vào cockpit bằng cách chia sẻ một camera owner/hook chính thức; không mở stream thứ hai.
3. Trích pipeline ADAS video thành adapter tái sử dụng để cockpit nhận lane/object image-space overlays và latency, vẫn không đổi pixel sang mét.
4. Publish hand/model availability từ DMS surface khi artifact thật được load; smoking giữ unavailable cho tới khi backend xác minh model.
5. Giảm main bundle bằng route-level lazy split cho các surface medical/voice/DMS.
6. Trả nợ global lint theo PR riêng, không trộn với V2.
7. Chỉ mở protected session sau khi PR B server grant được thiết kế, test negative/replay/expiry và deploy; sau đó mới thực hiện PR C secure enrollment.

## 7. Git delivery

Functional/test commits:

- `9dd905b`, `7837bc3`, `327d8eb`, `d471813`, `44f85d9`, `ede026a`.

Kết quả remote:

- Push: **PASS**. Nhánh remote `feat/dms-adas-integrated-cockpit-v2` đã được xác minh tại `bd9931f2840b629f1d45da739c8c5e4bc5fe5d70`.
- PR: **BLOCKED BY TOOL PERMISSION**. GitHub connector trả `403 Resource not accessible by integration` khi gọi create-pull-request.
- URL tạo PR đã được GitHub trả về: `https://github.com/CrissNguyenKhanh/AI-DRIVER-MONITORING-SYSTEM-DMS/pull/new/feat/dms-adas-integrated-cockpit-v2`.
- Merge: **NOT ATTEMPTED** vì chưa tạo được PR, chưa có review/required-check state để xác minh. Không dùng admin bypass, credential extraction hoặc force push.

Khi quyền tạo PR có sẵn, dùng base `main`, head `feat/dms-adas-integrated-cockpit-v2`; chỉ merge sau khi review/check gates của GitHub cho phép.

