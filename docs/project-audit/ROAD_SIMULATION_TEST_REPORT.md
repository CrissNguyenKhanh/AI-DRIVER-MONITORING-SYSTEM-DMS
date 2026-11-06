# Báo cáo kiểm thử mô phỏng đường bộ DMS + ADAS

## 1. Kết luận

Standalone road simulator đạt các automated gate áp dụng cho phạm vi feature:

- engine/scenario core: **22/22 PASS**;
- toàn bộ frontend Node suite trên branch sạch từ `main`: **46/46 PASS**;
- toàn bộ backend regression suite trên branch sạch từ `main`: **58/58 PASS**;
- stress deterministic: **1,000/1,000 runs hoàn tất, 0 virtual collision** trên 10 scenario × 100 seed;
- targeted ESLint cho phạm vi simulation: **PASS**;
- production build: **PASS**;
- HTTPS route smoke `/demo/road-driving`: **HTTP 200**.

Kết quả này chỉ cho phép kết luận feature có thể được bàn giao như một **frontend-only deterministic offline simulator**. Nó không chứng minh:

- visual/WebGL/browser E2E hoạt động trên mọi GPU/browser;
- MediaRecorder thực sự encode được trên browser cụ thể;
- khoảng cách, TTC hoặc avoidance trong thế giới thật;
- khả năng điều khiển xe thật;
- secure DMS/session end-to-end.

PR B vẫn absent và PR C vẫn blocked. S10 là local-only rehearsal, không phải authenticated driving session. Mọi metric khoảng cách/thời gian/va chạm trong báo cáo này chỉ thuộc virtual coordinates đã biết trước.

## 2. Baseline kiểm thử

| Thuộc tính | Giá trị |
|---|---|
| Branch | `feat/dms-road-obstacle-avoidance-sim` |
| Feature route | `/demo/road-driving` |
| Existing video route được giữ nguyên | `/adas-simulation` |
| Engine clock | Fixed timestep `0.05 s` |
| Scenario seed dùng cho bảng kết quả | `20261105` |
| External service | Không gọi |
| Real hardware/camera/vehicle | Không dùng |
| Production control output | Luôn `null` |
| Secure workflow | Không tích hợp; blocked bởi PR B/PR C |

Commit SHA và push result không được nhúng trong report này vì report nằm trong chính commit cần định danh. Sau khi commit, dùng `git log -1 --format=%H`; final delivery response là nguồn xác nhận SHA/push status.

## 3. Tổng hợp quality gates

| Gate | Kết quả | Bằng chứng/diễn giải |
|---|---|---|
| Core engine + scenario tests | **PASS — 22/22** | 9 engine tests + 13 scenario/security-boundary tests |
| Full frontend tests | **PASS — 46/46** | 22 core + 8 support tests + 16 regression tests hiện hữu trên `main` |
| Backend regression tests | **PASS — 58/58** | Không có backend source nào được feature sửa |
| Deterministic stress | **PASS — 1,000 runs** | 10 scenario × 100 seed; 0 collision trong virtual world |
| Targeted ESLint | **PASS** | Simulation source/tests và route integration không phát sinh lint finding |
| Repository-wide ESLint | **FAIL — baseline** | 39 errors, 17 warnings; cùng baseline audit trước feature, không phát sinh từ simulation scope |
| Production build | **PASS** | 2.315 modules transformed |
| HTTPS route smoke | **PASS — 200** | Dev server phục vụ SPA route `/demo/road-driving` |
| Visual browser/WebGL E2E | **NOT VERIFIED** | Browser automation/interactive browser không khả dụng trong validation environment |
| Real camera/video detector | **NOT RUN** | Offline demo không dùng camera/model backend |
| Real vehicle/control interface | **NOT APPLICABLE** | Không có actuator/network output |
| Secure session/auth E2E | **BLOCKED** | PR B absent; PR C blocked |

Global lint failure không được che giấu, nhưng cũng không được gán cho simulator: targeted lint của feature pass và repository đã có đúng 39 errors/17 warnings trước khi feature được tạo.

## 4. Cấu trúc automated tests

### 4.1 Core engine — 9 tests

File: `tests/roadSimulationEngine.test.js`.

| # | Test contract | Kết quả |
|---:|---|---|
| 1 | Render-frame partitions khác nhau cho cùng fixed elapsed tạo state giống nhau | PASS |
| 2 | `stepSimulation` functional, không mutate input; static/dynamic obstacle cập nhật đúng | PASS |
| 3 | Acceleration/braking nằm trong config bounds | PASS |
| 4 | Lane clearance từ chối occupied, unknown và out-of-road corridor | PASS |
| 5 | Collision/TTC chỉ dùng synthetic world coordinates | PASS |
| 6 | Lane change liên tục, lateral step nhỏ hơn 1/10 lane width, không teleport | PASS |
| 7 | Controller hỗ trợ pause/resume/rate/scenario/reset | PASS |
| 8 | Invalid input bị reject; không có external side effect/control output | PASS |
| 9 | DMS warning escalation và hướng abort từ target lane phải tạo intent xác định | PASS |

### 4.2 Scenario và safety boundary — 13 tests

File: `tests/roadSimulationScenarios.test.js`.

| # | Test contract | Kết quả |
|---:|---|---|
| 1–10 | S01–S10 đáp ứng expected policy/maneuver/safety outcome | PASS |
| 11 | Scenario immutable, reproducible theo seed; mọi snapshot simulation-only | PASS |
| 12 | Engine source không có fetch/XHR/WebSocket/storage/auth/session/vehicle-control dependency | PASS |
| 13 | Toàn bộ `src/simulation` không có API/storage/camera/auth path | PASS |

Hai nhóm trên tạo tổng **22/22 core tests**.

### 4.3 Support/UI-independent tests — 8 tests

| File | Số test | Phạm vi | Kết quả |
|---|---:|---|---|
| `tests/simulationLoop.test.js` | 2 | Idempotent start, bounded elapsed, stop/cleanup và stale callback | PASS |
| `tests/simulationPresentation.test.js` | 3 | Copy S01–S10, synthetic DMS/UNKNOWN, virtual lane readout | PASS |
| `tests/simulationRecording.test.js` | 3 | MIME/extension, simulation-only overlay, rAF/timer/track cleanup và giới hạn local recording | PASS |

### 4.4 Regression compatibility

16 frontend tests hiện hữu trên `main` vẫn pass. Cộng với 30 test mới của simulation domain/support layer, full frontend suite đạt **46/46** trên branch delivery sạch. Worktree WIP chứa thay đổi camera chưa commit đã từng đạt 47/47, nhưng số đó không được dùng làm evidence cho PR nhắm `main`.

Backend suite của branch delivery sạch đạt **58/58**. Bốn test hand-model bổ sung thuộc PR #11 chưa merge nên không nằm trong target branch; PR #11 được giữ độc lập. Đây là regression signal, không phải bằng chứng các finding bảo mật trước đó đã đóng. Cụ thể, PR B/server verification grant vẫn chưa tồn tại và medical fallback finding vẫn nằm ngoài phạm vi feature.

## 5. Kết quả S01–S10 thực tế

Bảng dưới đây là một deterministic run với seed `20261105` và default config. `m` và `s` là đơn vị **chỉ trong virtual world**. `N/A` nghĩa metric không áp dụng, không phải test bị thiếu.

| ID | Actual path/outcome | Final/observed state | Virtual collision | Min virtual clearance | Time to virtual stop | Kết quả |
|---|---|---|---:|---:|---:|---|
| S01 | Normal drive, giữ làn | Lane 1; `KEEP_LANE`; không maneuver | 0 | N/A — không obstacle | N/A | PASS |
| S02 | Driver distracted, warning only | Lane 1; không lane change | 0 | N/A — không obstacle | N/A | PASS |
| S03 | Brake → left lane 0 → pass → recover | Trở lại lane 1 | 0 | 1.70 m | N/A | PASS |
| S04 | Brake → right lane 2 → pass → recover | Trở lại lane 1 | 0 | 1.70 m | N/A | PASS |
| S05 | Hai bên blocked → brake → stop | Lane 1; speed 0 | 0 | 11.72 m | 5.40 s | PASS |
| S06 | Target lane occupied tại 3.10 s → smooth abort → stop | Quay lại lane 1; speed 0 | 0 | 1.70 m | 6.50 s | PASS |
| S07 | Perception `UNKNOWN`; không maneuver mù | Lane 1; controlled slowdown còn 3.96 m/s | 0 | N/A — không obstacle | N/A | PASS |
| S08 | Driver recover giữa maneuver; hoàn tất left/pass/recover | Trở lại lane 1; không teleport | 0 | 1.70 m | N/A | PASS |
| S09 | Left occupied; chỉ sử dụng right lane | Hai chu kỳ avoidance hoàn tất; trở lại lane 1 | 0 | 1.70 m | N/A | PASS |
| S10 | Local session timeline; hai bên blocked → stop | `ENDED`; alert 1; `persisted=false` | 0 | 11.52 m | 5.90 s | PASS |

Lưu ý về clearance 1.70 m trong một số scenario: đây là khoảng cách giữa bounding volumes ảo, thường bao gồm phương tiện ở làn kề; nó không phải distance dọc tới front obstacle và không phải camera measurement.

### Security assertions riêng của S10

Kết quả thực tế của S10:

- `security.offlineOnly = true`;
- `security.secureWorkflowAvailable = false`;
- `security.integrationBlocked = true`;
- `security.protectedWorkflowStatus = UNAVAILABLE_PR_B`;
- `localSession.status = ENDED`;
- `localSession.alertCount = 1`;
- `localSession.persisted = false`;
- mọi timeline event có `localSimulationOnly = true`;
- không có request tới session/history/alert/Telegram/biometric API;
- `productionControlOutput = null`.

S10 không được đổi nhãn thành secure end-to-end cho tới khi PR B và PR C thực sự được triển khai, migration/integration tests pass và bearer-only session start bị loại bỏ.

## 6. Stress test deterministic

Stress validation chạy toàn bộ 10 scenario trên 100 seed, tổng **1,000 complete runs**.

| Metric | Kết quả |
|---|---:|
| Scenario executions | 1,000 |
| Seed values | 100 |
| Scenario per seed | 10 |
| Incomplete/exception runs | 0 |
| Virtual collisions | 0 |

Stress này kiểm tra reproducibility, bounded transition và collision invariant trong catalog đã thiết kế. Nó không phải Monte Carlo safety validation vì không mô hình hóa:

- sensor noise hoặc camera uncertainty;
- tire/road friction, weather hoặc actuator latency;
- arbitrary traffic actors;
- real-world map/road geometry;
- hardware timing hoặc control bus;
- distribution ngoài fixture/config hiện tại.

Do đó “1,000 runs, 0 virtual collision” chỉ là measured simulation result, không phải probability of accident avoidance.

## 7. Lint và source-quality gates

### Targeted lint

Targeted ESLint cho feature scope pass. Phạm vi gồm:

- `src/simulation/*`;
- route import/registration trong `src/App.jsx`;
- năm simulation test files.

Không có lint finding mới từ simulator.

### Global lint

`npm run lint` trên toàn repository vẫn fail:

- 39 errors;
- 17 warnings;
- tổng 56 findings.

Đây là baseline đã được audit trước feature và nằm ngoài scope commit mô phỏng. Không được báo “all lint green”; wording đúng là “targeted simulation lint pass, repository-wide lint remains red at the inherited baseline”.

## 8. Production build

Production build pass với:

| Artifact/gate | Kết quả |
|---|---:|
| Modules transformed | 2315 |
| Simulator CSS chunk | 8.63 kB; gzip 2.48 kB |
| Base CSS | 55.03 kB; gzip 14.49 kB |
| Simulator JS chunk | 48.14 kB; gzip 15.64 kB |
| Base JavaScript | 1555.97 kB; gzip 435.46 kB |
| Build status | PASS |

Build vẫn phát warning base chunk lớn hơn 500 kB. Warning này không chặn build nhưng là performance debt có sẵn. Route simulator đã dùng `React.lazy`, nên Three.js/simulator được tách thành chunk riêng thay vì tăng initial route bundle.

Build pass chứng minh module graph/transpile/bundle hợp lệ, không chứng minh WebGL render, animation hoặc recording hoạt động trên browser cụ thể.

## 9. HTTPS route smoke

Dev server dùng HTTPS qua Vite basic SSL. Request tới:

```text
https://127.0.0.1:5174/demo/road-driving
```

trả **HTTP 200** trong route smoke.

Gate này chứng minh Vite dev server và SPA fallback phục vụ route. Nó không chứng minh:

- React component mount không lỗi trong browser;
- WebGL context tạo thành công;
- Three.js frame thực sự render;
- interaction Play/Pause/Reset hoạt động bằng pointer/keyboard;
- local video decode/playback;
- fullscreen/layout trên viewport thật;
- MediaRecorder/canvas capture/download;
- visual accessibility/contrast/focus order.

## 10. Visual/browser validation chưa hoàn tất

Interactive browser/WebGL E2E không được thực hiện vì browser không khả dụng trong validation environment. Trạng thái phải là **NOT VERIFIED**, không phải PASS hay FAIL.

Manual/browser follow-up tối thiểu:

1. Mở `/demo/road-driving` trên Chromium và Firefox có WebGL.
2. Xác nhận road, lane markers, EGO, blockers và camera follow xuất hiện.
3. Quan sát S03/S04: phanh trước, rồi chuyển làn liên tục, không teleport.
4. Quan sát S05/S10: speed giảm dần tới 0.
5. Quan sát S06: late obstacle xuất hiện, EGO abort liên tục và dừng.
6. Quan sát S07: `UNKNOWN`, không lane change.
7. Quan sát S08: driver recovery không reset maneuver tức thời.
8. Đổi `SPLIT`/`VIRTUAL`/`VIDEO`, camera `CHASE`/`DRIVER`/`REAR`.
9. Chọn MP4/WebM local; xác nhận video bất biến và warning `OBJECT DETECTION UNAVAILABLE`.
10. Test Pause/Resume/Reset và rate 0,5×/1×/2×/4×.
11. Ghi WebM, dừng và mở file download; xác nhận watermark/state overlay.
12. Test unsupported MediaRecorder/captureStream để xác nhận fail message.
13. Test keyboard focus, screen reader labels, zoom và narrow viewport.
14. Theo dõi console, GPU memory và cleanup khi đổi route nhiều lần.

Không dùng webcam/biometric/real driver image khi chạy các bước này.

## 11. Negative/security tests và giới hạn

Automated source-boundary test xác nhận core engine không chứa:

- `fetch`, `XMLHttpRequest`, `WebSocket`;
- `localStorage`, `sessionStorage`;
- `Authorization`, `Bearer`, driving-session path;
- steering/throttle/brake command symbol.

Mọi snapshot được kiểm tra có:

- `simulationOnly = true`;
- `realVehicleControlCapable = false`;
- `virtualDistancesOnly = true`;
- `modelAccuracyClaim = null`;
- engine và orchestrator `productionControlOutput = null`.

Source scanning là defense-in-depth cho isolated engine, không thay thế runtime CSP/network inspection của toàn frontend. Route vẫn có navigation link tới existing `/adas-simulation`; link đó không truyền state/detection vào offline engine.

## 12. Defect và debt còn mở

| Hạng mục | Trạng thái | Tác động |
|---|---|---|
| Repository-wide ESLint | OPEN — 39 errors/17 warnings | Không chặn scoped feature, nhưng CI toàn repo chưa xanh |
| Base bundle >500 kB | OPEN | Initial-load/performance debt lịch sử; simulator đã được lazy-load thành chunk riêng |
| Visual/WebGL E2E | NOT VERIFIED | Chưa có bằng chứng hình ảnh/interaction trên browser |
| MediaRecorder compatibility | NOT VERIFIED | MIME/encoder thay đổi theo browser |
| Real road object model/video overlay | UNAVAILABLE trên offline route | UI nói rõ, không fabricate |
| PR B | ABSENT | Không server verification grant/secure session start |
| PR C | BLOCKED | Không secure enrollment/privacy/fresh-browser integration |
| Real vehicle/hardware | OUT OF SCOPE | Không có control interface, không được thêm |
| Formal safety validation | NOT PERFORMED | Không được gọi autonomous/safety-certified |

## 13. Release interpretation

Feature gate: **PASS cho isolated offline demo, với browser visual validation còn thiếu**.

Production/security gate: **NO-GO** cho:

- protected driving-session integration;
- persistent alert/history flow;
- biometric authorization claim;
- real vehicle-control deployment;
- camera-derived distance/TTC claim;
- autonomous-driving hoặc accident-avoidance assurance.

Nguồn thiết kế và expected contract:

- `docs/project-audit/ROAD_SIMULATION_ARCHITECTURE.md`;
- `docs/project-audit/ROAD_SIMULATION_SCENARIOS.md`.

Nguồn vận hành/delivery:

- `docs/project-audit/ROAD_SIMULATION_HANDOFF.md`;
- final response sau commit/push, cùng `git log -1 --format=%H`.
