# Handoff — DMS + ADAS realistic road simulation

## 1. Outcome

Một standalone route `/demo/road-driving` đã được triển khai cho deterministic virtual driving simulation:

- xe EGO di chuyển thực trong Three.js scene;
- phanh/tăng tốc có giới hạn;
- đổi làn liên tục, không teleport;
- kiểm tra target-lane clearance và virtual collision;
- abort khi obstacle mới đi vào target lane;
- safe stop khi không có corridor hợp lệ;
- 10 deterministic scenarios S01–S10;
- split/virtual/video view;
- camera chase/driver/rear;
- local canvas recording qua MediaRecorder khi browser hỗ trợ;
- timeline, DMS synthetic metrics và virtual safety readouts.

Đây là **frontend-only offline simulator**. Không có production control output, không điều khiển xe thật, không dùng virtual distance/TTC như camera measurement và không tạo secure driving authorization.

## 2. Repository và delivery baseline

| Thuộc tính | Trạng thái tại thời điểm viết handoff |
|---|---|
| Branch | `feat/dms-road-obstacle-avoidance-sim` |
| Target branch | `main` qua PR #12 |
| Feature commit | `ccb144e50f15` — cherry-pick sạch từ source commit `c53b923d8335` |
| Validation-doc commit | `671537ab9460` |
| Push | Thành công lên `origin/feat/dms-road-obstacle-avoidance-sim` |
| Pull Request | `https://github.com/CrissNguyenKhanh/AI-DRIVER-MONITORING-SYSTEM-DMS/pull/12` |
| PR state | MERGED |
| Squash merge commit | `025c815dfdf9f9432ab0ee9fdfbe059d538d9860` |
| Post-merge verification | 46/46 frontend, 58/58 backend, targeted lint/build PASS; Vercel success |
| Force push | Không được phép |
| Deploy | Không thực hiện |

Không thể đưa commit SHA của chính commit vào file nằm trong commit đó mà không tạo thêm commit làm thay đổi SHA. Vì vậy:

```powershell
git log -1 --format=%H
git status --short
```

Final delivery response vẫn là nguồn xác nhận trạng thái GitHub mới nhất; merge SHA đã được ghi ở bảng trên.

## 3. Security dependency status

### PR B

**ABSENT.** Chưa có:

- server verification challenge/grant;
- stable auth-session binding;
- purpose `start_driving_session`;
- atomic single-use grant consumption;
- fail-closed session start.

### PR C

**BLOCKED bởi PR B.** Secure biometric enrollment/privacy/fresh-browser work chưa được triển khai.

### Hệ quả cho simulator

- Route offline không yêu cầu bearer và không dùng điều đó để mở protected workflow.
- Không gọi `/api/driving/session/start`.
- Không gọi alert/history/Telegram/biometric endpoint.
- Không persist local session/timeline.
- S10 ghi `UNAVAILABLE_PR_B`, `integrationBlocked=true`, `persisted=false`.
- Không tuyên bố secure E2E.
- Không thêm authentication bypass hoặc một grant framework phía client.

Simulator chỉ được nối protected workflow sau PR B/PR C có implementation evidence, migrations và concurrency/integration tests. Khi đó adapter phải fail closed; core engine vẫn thuần/offline và không nhận control capability.

## 4. Architecture tóm tắt

```text
Scenario + seed
      ↓
SimulationController
      ↓
fixed timestep 0.05 s
      ↓
SimulationOrchestrator
      ↓
maneuver state machine + bounded dynamics
      ↓
virtual collision / clearance metrics
      ↓
React readouts + Three.js renderer + local recorder
```

Các boundary quan trọng:

- Three.js chỉ render snapshot; không quyết định physics.
- `requestAnimationFrame` chỉ cấp elapsed time; physics dùng accumulator/fixed step.
- UI lane readout không thay thế `evaluateLaneClearance` của planner.
- Prerecorded video là immutable; virtual lane change không sửa quỹ đạo video.
- Offline video pane không bịa detections và luôn hiển thị `OBJECT DETECTION UNAVAILABLE`.
- Existing `/adas-simulation` là route/pipeline riêng; không truyền output vào virtual engine.
- Recording chỉ composite virtual scene + simulation labels, không capture webcam/biometric.

Xem chi tiết ở `ROAD_SIMULATION_ARCHITECTURE.md` và `ROAD_SIMULATION_SCENARIOS.md`.

## 5. Source changes thuộc feature

### Route integration

- `DiQuaMuaHaa/frontend/demothuattoanpro/src/App.jsx`
  - import `RoadDrivingDemo`;
  - đăng ký `/demo/road-driving`;
  - giữ nguyên `/adas-simulation`.

### Simulation domain/UI

- `src/simulation/constants.js`
- `src/simulation/scenarios.js`
- `src/simulation/SimulationOrchestrator.js`
- `src/simulation/roadSimulation.js`
- `src/simulation/simulationLoop.js`
- `src/simulation/VirtualRoadScene.jsx`
- `src/simulation/presentation.js`
- `src/simulation/recording.js`
- `src/simulation/RoadDrivingDemo.jsx`
- `src/simulation/RoadDrivingDemo.css`
- `src/simulation/index.js`

### Tests

- `tests/roadSimulationEngine.test.js`
- `tests/roadSimulationScenarios.test.js`
- `tests/simulationLoop.test.js`
- `tests/simulationPresentation.test.js`
- `tests/simulationRecording.test.js`

### Documentation

- `docs/project-audit/ROAD_SIMULATION_ARCHITECTURE.md`
- `docs/project-audit/ROAD_SIMULATION_SCENARIOS.md`
- `docs/project-audit/ROAD_SIMULATION_TEST_REPORT.md`
- `docs/project-audit/ROAD_SIMULATION_HANDOFF.md`

Không thay đổi backend, database, model, dataset hoặc package manifest. Three.js đã có sẵn trong dependency set.

## 6. Dirty-tree preservation

Các path sau đã dirty trước feature và không thuộc staging allowlist:

- `DiQuaMuaHaa/backend/data/__pycache__/__init__.cpython-310.pyc`;
- `DiQuaMuaHaa/frontend/demothuattoanpro/src/systeamdetectface/face_detect.jsx`;
- `DiQuaMuaHaa/frontend/demothuattoanpro/src/testdata/thucmuctest.jsx`;
- `DiQuaMuaHaa/frontend/demothuattoanpro/src/utils/cameraSession.js`;
- `DiQuaMuaHaa/frontend/demothuattoanpro/tests/cameraSession.test.js`;
- pre-existing `docs/audit/` và project-audit artifacts không được nêu trong feature allowlist.

Không reset, stash, clean, checkout hoặc stage các path này chỉ để làm sạch branch. `cameraSession.test.js` vẫn được full frontend suite chạy, nhưng file không thuộc feature commit.

## 7. Demo operation

### Khởi động

Từ repository root:

```powershell
Set-Location 'DiQuaMuaHaa/frontend/demothuattoanpro'
npm run dev
```

Vite dev server dùng HTTPS và port 5173. Mở:

```text
https://localhost:5173/demo/road-driving
```

Trình duyệt có thể yêu cầu chấp nhận development certificate. Backend không cần chạy cho offline route; không đăng nhập và không gọi API để chạy S01–S10.

### Thao tác

1. Chọn scenario S01–S10.
2. Chọn `Chạy`.
3. Dùng `Tạm dừng` hoặc `Khởi động lại` khi cần.
4. Chọn rate 0,5×, 1×, 2× hoặc 4×.
5. Chọn view `SPLIT`, `VIRTUAL` hoặc `VIDEO`.
6. Chọn camera `CHASE`, `DRIVER` hoặc `REAR`.
7. Có thể đổi DMS input tổng hợp để quan sát policy; đây không phải camera output.
8. Quan sát assistance mode, decision, lane, speed, timeline và virtual metrics.

Scenario fixtures tự hoàn tất theo duration. Reset với cùng seed `20261105` phải tái tạo cùng expected logic result.

## 8. Road video behavior

Video pane là tùy chọn:

1. Chọn file MP4/WebM local.
2. File được phát bằng object URL trong browser.
3. Play/Pause/Reset/rate được điều khiển cùng demo ở mức presentation.
4. Video pixels và quỹ đạo prerecorded không bị sửa.
5. Không có object/lane model trên offline route; UI hiển thị `OBJECT DETECTION UNAVAILABLE`.

Không diễn giải split view là calibrated fusion. Virtual obstacle không ánh xạ vào object trong video. Nếu cần pipeline phân tích frame hiện hữu, mở `/adas-simulation` như route riêng; pipeline đó vẫn image-space/simulation-only và không cung cấp metric mét/TTC cho virtual engine.

## 9. Recording demo

1. Chờ virtual canvas xuất hiện.
2. Chọn `Ghi demo`.
3. Chạy scenario hoặc đổi camera/view theo nhu cầu.
4. Chọn `Dừng & tải video`.

Recorder:

- dùng `canvas.captureStream(30)`;
- ưu tiên WebM VP9, WebM VP8, WebM;
- chỉ dùng MP4/H.264 hoặc MP4 khi `MediaRecorder.isTypeSupported` báo hỗ trợ;
- tạo Blob/download local;
- không cloud upload;
- không capture road video pane, webcam, microphone hoặc biometric image;
- overlay scenario/attention/mode/decision/virtual speed và simulation-only wording.

Nếu `captureStream` hoặc `MediaRecorder` không tồn tại, UI báo unavailable và không giả vờ đã ghi. Browser/encoder manual validation vẫn còn thiếu.

## 10. Scenario behavior

| ID | Expected/validated virtual behavior |
|---|---|
| S01 | Normal, lane 1, keep lane |
| S02 | Distracted warning, no arbitrary steering |
| S03 | Brake → left → pass → recover |
| S04 | Brake → right → pass → recover |
| S05 | Both sides blocked → stop |
| S06 | New target obstacle → smooth abort → stop |
| S07 | Perception unknown → controlled slowdown, no blind lane change |
| S08 | Driver recovers; active maneuver remains consistent |
| S09 | Left occupied; use validated right corridor only |
| S10 | Local-only timeline and safe stop; secure integration blocked |

Seed `20261105` run: tất cả 10 scenario pass, 0 virtual collisions. Chi tiết clearance/stop time nằm trong `ROAD_SIMULATION_TEST_REPORT.md`.

## 11. Test and build results

| Gate | Actual result |
|---|---|
| Engine/scenario core | 22/22 PASS |
| Full frontend (`main`-based delivery branch) | 46/46 PASS |
| Full backend (`main`-based delivery branch) | 58/58 PASS |
| Stress | 1,000 runs / 100 seeds / 0 virtual collisions |
| Targeted ESLint | PASS |
| Global ESLint | FAIL baseline — 39 errors, 17 warnings |
| Production build | PASS — 2315 modules |
| Simulator chunk | CSS 8.63 kB/gzip 2.48; JS 48.14 kB/gzip 15.64 |
| Base chunk | CSS 55.03 kB/gzip 14.49; JS 1555.97 kB/gzip 435.46 |
| Chunk warning | >500 kB remains |
| HTTPS route smoke | 200 |
| Visual browser/WebGL E2E | NOT VERIFIED — browser unavailable |

Test counts và metrics trên là actual validation results, không phải placeholder. Build/HTTP success không thay thế visual/browser evidence.

## 12. Safety claims

Luôn dùng:

- “deterministic virtual-world simulation”;
- “simulation-only decision”;
- “virtual clearance/collision/stop time”;
- “0 collisions trong 1,000 configured virtual runs”.

Không dùng:

- “đã tránh 1,000 tai nạn”;
- “camera đo được khoảng cách/TTC”;
- “xe thật đã phanh/chuyển làn”;
- “autonomous-driving system”;
- “safety validated/certified”;
- “secure E2E complete”.

Engine chỉ dùng known synthetic coordinates. `productionControlOutput` luôn `null`; không có steering/throttle/brake command.

## 13. Known limitations

- Visual/WebGL interaction chưa được chạy vì browser unavailable.
- MediaRecorder/browser MIME compatibility chưa được manual-test.
- Không có real object model trên offline route.
- Video và virtual world không calibrated/sensor-fused.
- Collision model là axis-aligned geometry đơn giản; prediction dùng constant velocity.
- Không có road friction, weather, sensor noise, actuator delay hoặc vehicle dynamics calibration.
- Không có real hardware, camera, CAN bus hoặc test track validation.
- Global lint vẫn fail baseline 39/17.
- Base JS chunk >500 kB; simulator route đã được lazy-load/code-split riêng.
- PR B absent, PR C blocked; no protected workflow integration.
- Không có formal safety case/chứng nhận.

## 14. Manual validation còn cần

Trước khi trình diễn chính thức:

- mở route bằng Chromium/Firefox có WebGL;
- chạy đủ S01–S10 và quan sát motion;
- kiểm tra resize/narrow viewport/zoom;
- kiểm tra keyboard/focus/screen-reader labels;
- test video MP4/WebM và unsupported file;
- test WebM recording/download/playback;
- đổi route lặp lại và theo dõi cleanup/GPU memory;
- xác nhận không network call phát sinh từ offline engine;
- xác nhận warning/security badge luôn hiện.

Không cần và không được dùng ảnh biometric hoặc xe thật cho các bước này.

## 15. Staging allowlist và delivery procedure

Root agent phải stage path cụ thể, không dùng blanket `git add .` trong dirty tree.

Allowlist:

```text
DiQuaMuaHaa/frontend/demothuattoanpro/src/App.jsx
DiQuaMuaHaa/frontend/demothuattoanpro/src/simulation/
DiQuaMuaHaa/frontend/demothuattoanpro/tests/roadSimulationEngine.test.js
DiQuaMuaHaa/frontend/demothuattoanpro/tests/roadSimulationScenarios.test.js
DiQuaMuaHaa/frontend/demothuattoanpro/tests/simulationLoop.test.js
DiQuaMuaHaa/frontend/demothuattoanpro/tests/simulationPresentation.test.js
DiQuaMuaHaa/frontend/demothuattoanpro/tests/simulationRecording.test.js
docs/project-audit/ROAD_SIMULATION_ARCHITECTURE.md
docs/project-audit/ROAD_SIMULATION_SCENARIOS.md
docs/project-audit/ROAD_SIMULATION_TEST_REPORT.md
docs/project-audit/ROAD_SIMULATION_HANDOFF.md
```

Trước commit:

1. Kiểm tra `git status --short`.
2. Stage đúng allowlist.
3. Kiểm tra `git diff --cached --name-status`.
4. Chạy `git diff --cached --check`.
5. Scan staged diff cho secrets, `.env`, token, biometric, private data, pyc, DB, video và model artifact.
6. Xác nhận không stage pre-existing dirty files.
7. Commit message đề xuất:

```text
feat(dms): add realistic road obstacle avoidance simulation
```

Sau commit:

```powershell
git log -1 --format=%H
git status --short
git push -u origin HEAD
```

Không force push, merge hoặc deploy. Nếu staged diff khác allowlist, gate fail hoặc secret scan phát hiện dữ liệu nhạy cảm, bỏ staging của path sai một cách không phá hủy và không commit/push cho tới khi được xử lý.

## 16. Recommended next steps

### Feature-local

1. Chạy manual browser/WebGL matrix.
2. Thêm browser E2E khi project có Playwright/Cypress/jsdom-equivalent infrastructure.
3. Tiếp tục tách các route legacy khác để giảm base chunk; simulator đã lazy-load.
4. Thêm recording lifecycle test trên browser thật.
5. Thêm visual regression cho S03/S05/S06/S07.

### Security/product dependencies

1. Hoàn thành PR B server verification grant trước.
2. Hoàn thành PR C secure enrollment/privacy/fresh-browser sau PR B.
3. Chỉ sau đó thiết kế một adapter protected-session riêng, fail closed.
4. Không đưa virtual metrics vào backend history như camera measurements.
5. Không mở rộng thành real vehicle control trong repository này nếu chưa có một safety program độc lập.

## 17. Handoff cho agent tiếp theo

=== COPY TO CHATGPT ===

Tiếp quản branch `feat/dms-road-obstacle-avoidance-sim` của repository `AI-DRIVER-MONITORING-SYSTEM-DMS`.

Đọc trước:

- `docs/project-audit/ROAD_SIMULATION_ARCHITECTURE.md`
- `docs/project-audit/ROAD_SIMULATION_SCENARIOS.md`
- `docs/project-audit/ROAD_SIMULATION_TEST_REPORT.md`
- `docs/project-audit/ROAD_SIMULATION_HANDOFF.md`

Feature đã triển khai một simulator frontend-only/offline tại `/demo/road-driving`. Engine fixed-step 0,05 s, seeded S01–S10, bounded acceleration/braking, smooth lane changes, swept lane clearance, target-lane abort, virtual collision metrics và Three.js visualization. Video local là immutable và tách khỏi virtual world. Recording chỉ lấy virtual canvas + simulation labels.

Validation hiện tại:

- engine/scenario 22/22 pass;
- full frontend 46/46 pass trên branch sạch từ `main`;
- backend 58/58 pass trên branch sạch từ `main`;
- stress 1,000 runs trên 100 seed, 0 virtual collisions;
- targeted ESLint pass;
- production build pass: 2315 modules; simulator chunk CSS 8.63 kB/gzip 2.48, JS 48.14 kB/gzip 15.64; base JS còn warning >500 kB;
- repository global lint vẫn fail baseline 39 errors/17 warnings;
- HTTPS route smoke 200;
- visual browser/WebGL E2E chưa xác minh vì browser unavailable.

Security boundary:

- PR B absent, PR C blocked.
- S10 local-only, `UNAVAILABLE_PR_B`, `persisted=false`.
- Không gọi session/history/alert/Telegram/biometric API.
- Không secure-E2E claim.
- Không production control output hoặc vehicle-control command.
- Mọi distance/TTC/clearance chỉ hợp lệ trong virtual coordinates.

Working tree có pre-existing dirty files. Không reset/stash/clean/overwrite. Chỉ stage feature allowlist trong section 15; không dùng `git add .`. Root/delivery agent phải review staged diff, chạy `git diff --cached --check`, secret/sensitive-data scan, rồi commit bằng `feat(dms): add realistic road obstacle avoidance simulation` và push `git push -u origin HEAD` nếu mọi gate vẫn đạt. Không force push, merge hoặc deploy.

Commit SHA không thể được ghi vào chính commit mà không làm thay đổi SHA. Sau commit dùng `git log -1 --format=%H`; final response là nguồn push status thực tế.

Ưu tiên tiếp theo là manual browser/WebGL/MediaRecorder validation. Route-level lazy loading đã hoàn tất. Không nối protected workflow cho tới khi PR B và PR C hoàn tất và được test.

=== END COPY ===
