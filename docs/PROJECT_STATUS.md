# Project Status — DMS Master V3

Trạng thái tại 2026-11-19, nhánh `chore/runtime-flow-repository-cleanup`.

## Kết luận

Dự án đã có DMS full-stack chạy được, protected enrollment/session, face identity workflow,
Telegram approval/grant, driving history, ADAS image visualization và Integrated Cockpit V2 với
20 scenario deterministic. Code gates hiện đều xanh. Tuy nhiên dự án **chưa production-ready và
không safety-certified** vì webcam/browser/Telegram/model quality/liveness/deployment thật chưa
được E2E.

## Đã hoàn thành

### Runtime và security

- React/Vite frontend, Flask-Socket.IO DMS, MySQL/PostgreSQL abstraction và Medical service tách
  biệt.
- One-time enrollment code, hashed bearer session, admin/driver role và server-side authorization.
- Challenge/grant bound theo driver, auth session, purpose và TTL; atomic one-time consumption.
- Biometric initial/replacement workflow có version, conditional write và rollback khi DB fail.
- Profile API chỉ trả metadata; không phụ thuộc ảnh mặt trong `localStorage`.
- Telegram bind/approve/reject có owner/replay/expiry checks.
- Camera lifecycle có explicit consent, Stop/Retry, late-permission/disconnect cleanup.
- Error response/model unavailable fail-closed; không bịa “safe”/diagnosis.

### DMS/ADAS/cockpit

- Browser MediaPipe FaceMesh/Hands và backend EAR/PERCLOS/head pose/attention pipeline.
- Landmark/hand artifacts và phone ONNX được lazy-load; smoking thiếu model được công khai
  unavailable.
- ADAS lane detection OpenCV, optional road objects, image-space risk và visualization-only planner.
- Cockpit S01–S20 fixed-step deterministic, bounded brake, lane clearance/change/abort/recovery.
- Normalized event contract, stale/dedup guard, alert priority/cooldown, audio unlock, bounded
  timeline, JSON/CSV/print, local recording cleanup.
- Live DMS metrics bridge whitelist; phone/hand metrics đi qua nhưng token/frame/landmark không đi.
- Mọi simulation giữ `simulationOnly=true`, `productionControlOutput=null`.

### Vận hành/audit hiện tại

- Runbook Windows, system runtime flow, cleanup report và status dashboard.
- PowerShell preflight/start/stop đã smoke-test.
- Windows entrypoint được sửa để không phụ thuộc Eventlet/greenlet không cần thiết.
- Render PostgreSQL manifest có `DATABASE_URL`/origin/secret placeholders cần thiết.
- Dọn 10 tracked generated/duplicate/one-off files, không xóa model/data/test/migration.

## Test matrix

| Gate | Trạng thái | Chi tiết |
|---|---|---|
| Frontend dependencies | PASS | `npm ci`, 279 packages |
| Frontend unit/contract | PASS | 84/84 |
| Backend unit/contract | PASS | 86/86 |
| S01–S20 | PASS | reproducible, simulation-only assertions |
| ESLint | PASS_WITH_WARNINGS | 0 error, 16 hook warnings |
| Production build | PASS_WITH_WARNINGS | 2,330 modules; main chunk 1,593.37 kB |
| Backend import/startup | PASS | Windows Socket.IO threading |
| Runtime HTTP smoke | PASS | backend, DB health, SPA shells |
| Safe enrollment fixture | PASS | backend mock/fake DB tests; không ghi DB thật |
| Browser visual/audio/camera | NOT VERIFIED | không có browser provider trong audit |
| Telegram real webhook | NOT VERIFIED | không dùng production token/webhook |
| PostgreSQL/production DB | NOT VERIFIED | không chạy migration trên data thật |

Build warnings hiện tại: `caniuse-lite`/baseline browser data cũ và main chunk >500 kB.

## Trạng thái feature trung thực

| Feature | Status |
|---|---|
| DMS auth/enrollment | Implemented + unit/runtime boundary tested |
| Face register/verify | Implemented; thiếu liveness/PAD validation |
| DMS attention | Implemented + tests; webcam thật chưa E2E |
| Phone ONNX | Artifact present; real quality/camera chưa E2E |
| Hand classifier | Artifact present; real quality/camera chưa E2E |
| Smoking | Unavailable — verified model absent |
| ADAS lane | Implemented on frames; real road/video quality chưa E2E |
| ADAS road objects | Unavailable — `road_yolo.pt` absent |
| Cockpit S01–S20 | Implemented/tested synthetic simulation |
| Cockpit live DMS | Implemented metrics bridge; browser cross-tab chưa E2E |
| Cockpit road-video | Local playback only, chưa embedded ADAS analysis |
| Medical symptom API | Legacy implemented |
| Medical image inference | Unavailable — model artifacts absent |
| Medical confirmation `/test1` | Incomplete contract — backend routes/schema missing |

## Finding ưu tiên

### P1 — trước production claim

1. Thiết kế/đánh giá liveness hoặc PAD; đo FAR/FRR/PAD và threat model cho face identity.
2. Chạy browser E2E thật: responsive UI, WebGL, console, audio autoplay, fullscreen,
   MediaRecorder, cross-tab BroadcastChannel và self-signed/prod TLS.
3. Chạy webcam thật với deny/allow/disconnect, nhiều mặt, ánh sáng/góc mặt và model artifacts thật.
4. Staging E2E MySQL và PostgreSQL: backup, V001/V002, grant race/replay, history ownership.
5. Telegram staging end-to-end với webhook secret, bind, approve/reject/timeout/replay.
6. Hoàn thiện hoặc ẩn route Medical `/test1`: cần schema/audit migration và hai backend contract
   `/api/ai/diagnoses`, `PUT /api/records/<id>/confirm`; không nên vá write route thiếu schema.

### P2 — chất lượng/hiệu năng

1. Xử lý có chủ đích 16 `react-hooks/exhaustive-deps` warnings; tránh thêm dependency máy móc vào
   camera lifecycle.
2. Code-split medical/admin/legacy routes; main production chunk hiện khoảng 1.59 MB minified.
3. Tạo virtualenv chuẩn/CI clean để `pip check` chỉ phản ánh dependency dự án.
4. Quyết định policy cho smoking/road-object/medical image models: provision đã kiểm chứng hoặc ẩn
   feature; không giữ UI gây hiểu nhầm.
5. Đưa CSV/model lớn sang Git LFS/model registry nếu lịch sử tiếp tục tăng.

### P3 — maintainability

1. Tách dần `api.py`, `len.py`, `thucmuctest.jsx` theo bounded modules sau khi có API snapshots.
2. Chuẩn hóa tên route/component legacy trong migration có redirect/import compatibility.
3. Review các candidate orphan/placeholder (`User/test.jsx`, `khanh.js`, empty training scripts)
   bằng owner knowledge trước PR cleanup tiếp theo.
4. Update browser compatibility data/dependencies trong PR riêng, chạy lại full regression.

## Route readiness

| Route | HTTP shell | Auth/runtime expectation |
|---|---|---|
| `/test3` | 200 | DMS bearer; camera user gesture |
| `/test4` | 200 | DMS bearer; camera user gesture |
| `/test5` | 200 | DMS bearer; server-approved biometric grant |
| `/adas-simulation` | 200 | DMS bearer; visualization only |
| `/demo/road-driving` | 200 | public demo shell; protected server session riêng khi dùng flow protected |
| `/dms/admin/enrollment` | 200 shell | bootstrap secret → memory-only admin session |

HTTP shell 200 là Vite SPA fallback, không phải browser component E2E.

## Next recommended delivery sequence

1. Merge audit/cleanup sau review diff/deletion list.
2. Dựng staging database + Telegram test bot, chạy migration và workflow matrix.
3. Thêm Playwright/browser provider và camera fixtures; sau đó test webcam thật thủ công.
4. Chốt model provenance/metrics và liveness design.
5. Xử lý Medical confirmation contract bằng migration + API + authorization tests.
6. Tối ưu bundle/lifecycle warnings rồi mới refactor monolith.

Run instructions: [RUN_PROJECT.md](RUN_PROJECT.md). Runtime diagrams:
[SYSTEM_RUNTIME_FLOW.md](SYSTEM_RUNTIME_FLOW.md). Cleanup evidence:
[REPOSITORY_CLEANUP_REPORT.md](REPOSITORY_CLEANUP_REPORT.md).
