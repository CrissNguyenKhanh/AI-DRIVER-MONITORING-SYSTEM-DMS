# Kiến trúc DMS + ADAS Integrated Cockpit V2

Ngày xác minh: 2026-11-07 (Asia/Bangkok)  
Nhánh: `feat/dms-adas-integrated-cockpit-v2`  
Base đã xác minh: `origin/main` tại `3069424`, chứa PR #12 và không chứa các commit của PR #11.

## 1. Phạm vi và ranh giới an toàn

Integrated Cockpit V2 là simulator nghiên cứu/trình diễn. Hệ thống không phát lệnh CAN, steering, throttle hoặc brake; mọi khoảng cách, TTC, phanh và chuyển làn chỉ thuộc thế giới ảo deterministic. `productionControlOutput` luôn là `null`.

Hai chế độ đầu vào được tách rõ:

- `OFFLINE_DEMO`: DMS scripted/synthetic, đường và vật cản trong tọa độ ảo đã biết; không cần backend/login/camera.
- `LIVE_DMS`: metrics DMS thật từ surface `/test3`, nhưng đường, planner và xe vẫn hoàn toàn ảo. Không biến input camera thành tuyên bố điều khiển xe thật.

Phiên lái bảo vệ vẫn `BLOCKED`: repository chưa có server-side verification grant của PR B. Không thêm bearer-only fallback, auth bypass hoặc grant giả.

## 2. Luồng dữ liệu

```text
Existing DMS /test3                 Scripted scenarios S01-S20
  camera + backend attention          monotonic simulation clock
            |                                   |
            v                                   v
DriverMonitoringAdapter              VehicleSimulationEngine
            |                                   |
            +---------- normalized events ------+
                                |
                                v
                 NormalizedEventGuard / Timeline
                                |
                   +------------+-------------+
                   v                          v
            SafetyAlertEngine        SimulationOrchestrator
                   |                          |
          visual HUD + Web Audio       virtual brake/lane/stop
                   |                          |
                   +------------+-------------+
                                v
                   IntegratedCockpit + Report
```

Road video giữ hệ tọa độ ảnh riêng. Video không được đổi pixel thành mét/TTC và không cấp steering intent cho virtual planner.

## 3. Event contract chuẩn hóa

Mọi event tích hợp có các trường:

```js
{
  eventId,
  eventType,
  severity,
  source,
  sourceMode,       // SCRIPTED | LIVE_DMS | ROAD_VIDEO_ANALYSIS | VIRTUAL_WORLD
  simulated,
  streamId,
  sessionId,
  occurredAt,       // giây monotonic cho mô phỏng; ISO cho nguồn ngoài
  receivedAt,
  payload,
  confidenceOrStatus,
  reason
}
```

`NormalizedEventGuard` từ chối malformed, duplicate, stale và out-of-order external events. Không tạo confidence khi backend không cung cấp.

## 4. Module mới và module tái sử dụng

Module mới:

- `eventContract.js`: schema, source mode, severity và guard.
- `SafetyAlertEngine.js`: priority, deduplication, acknowledgement, silence, cooldown và recovery.
- `AudioAlertManager.js`: Web Audio tone nguyên bản, speech synthesis tùy chọn, user-gesture unlock và cleanup.
- `DriverMonitoringAdapter.js`: ánh xạ backend state, stale/session guard và bridge metrics an toàn giữa tab.
- `RoadPerceptionAdapter.js`: biến transition vật cản/DMS/maneuver thành event chuẩn hóa.
- `DrivingEventTimeline.js`: timeline bounded/deduplicated.
- `SimulationSessionManager.js`: phiên local ephemeral, không giả persistence.
- `SimulationReport.js`: JSON report và CSV timeline, không chứa ảnh biometric/token.

Module tái sử dụng/mở rộng:

- `SimulationOrchestrator.js`: giữ policy conservative hiện có.
- `roadSimulation.js`: thêm `risk.frontHazard`, phone state, curve metadata và scenario event mới.
- `VirtualRoadScene.jsx`: giữ Three.js lifecycle và mở rộng scene.
- `recording.js`: giữ canvas-only recorder, thêm road risk và warning text.
- `thucmuctest.jsx`: tiếp tục sở hữu webcam/FaceMesh/backend; chỉ publish metrics đã rút gọn.
- `/adas-simulation`: giữ pipeline video hiện có; cockpit chỉ hiển thị video tùy chọn và link đến surface phân tích.

## 5. Chống feedback loop và spam

- Physics chạy fixed-step 50 ms; React không tạo timer quyết định cảnh báo.
- Adapter chỉ phát alert event khi state/phone chuyển trạng thái, không phát mỗi frame DMS.
- UI so sánh snapshot trước/sau và chỉ tạo event từ transition.
- Alert engine deduplicate theo event ID và key, có cooldown âm thanh.
- Timeline giới hạn 500 item.
- Three.js tái sử dụng buffer trajectory và object meshes; dispose geometry/material/renderer khi unmount.
- Audio dùng một context được quản lý và đóng khi rời route.

## 6. Bảo mật và dữ liệu riêng tư

- Broadcast channel chỉ mang attention state, eye state, EAR/PERCLOS, head pose, phone/model status.
- Không truyền frame, landmark, embedding, bearer token hoặc credential sang cockpit.
- Recorder chỉ ghi Three.js canvas và text overlay; không ghi webcam/microphone.
- FaceMesh similarity không được dùng để mở phiên bảo vệ.
- Smoking/hand/object model hiển thị `UNAVAILABLE` nếu không có bằng chứng availability.

## 7. Commit triển khai

- `9dd905b` — scene 3D procedural.
- `7837bc3` — normalized alerts và audio.
- `327d8eb` — Live DMS adapter/metrics bridge.
- `d471813` — S11-S20 và risk state.
- `44f85d9` — cockpit, timeline, report và recording overlay.
- `ede026a` — test V2.

