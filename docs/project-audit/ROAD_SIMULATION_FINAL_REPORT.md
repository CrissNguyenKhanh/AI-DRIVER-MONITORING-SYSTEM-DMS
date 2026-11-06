# Báo cáo cuối — DMS + ADAS realistic road simulation

## A. Chức năng đã hoàn thiện

- Route offline `/demo/road-driving`, lazy-loaded khỏi bundle khởi động chính.
- Three.js scene có đường ba làn, vạch đường, cảnh quan, EGO, xe/vật cản tĩnh và động.
- EGO di chuyển theo fixed timestep `0,05 s`; phanh/tăng tốc có giới hạn và chuyển làn liên tục.
- `SimulationOrchestrator` kết hợp trạng thái DMS tổng hợp với hazard/corridor của thế giới ảo.
- Avoidance engine hỗ trợ phanh, clearance theo swept horizon, chuyển làn trái/phải, pass, recovery, abort và stop.
- Split/video/virtual views, camera chase/driver/rear, playback rate, play/pause/reset.
- EAR/PERCLOS/head pose tổng hợp, decision/mode, lane availability, timeline và virtual metrics.
- Local MediaRecorder: WebM ưu tiên, MP4 chỉ khi browser hỗ trợ, giới hạn 10 phút/250 MiB và cleanup rAF/timer/tracks.

## B. Demo route và cách chạy

```powershell
cd DiQuaMuaHaa/frontend/demothuattoanpro
npm install
npm run dev
```

Mở `/demo/road-driving`. Vite route/module smoke trả HTTP 200. Visual WebGL browser E2E chưa được xác minh vì môi trường kiểm thử không cung cấp browser surface.

## C. Kịch bản S01–S10

| ID | Kết quả deterministic |
|---|---|
| S01 | Normal, giữ làn |
| S02 | Distracted, warning only, không swerving |
| S03 | Phanh → trái → pass → recover |
| S04 | Phanh → phải → pass → recover |
| S05 | Hai bên blocked → dừng, 0 collision |
| S06 | Target lane mới bị chiếm → smooth abort → dừng |
| S07 | Perception unknown → slowdown, không đổi làn mù |
| S08 | Driver recover, maneuver vẫn nhất quán |
| S09 | Nhiều obstacle, chỉ dùng corridor phải hợp lệ, recovery hoàn tất |
| S10 | Local-only timeline, alert 1, persisted=false, dừng |

Stress 100 seed × 10 scenario = 1.000 runs, 0 virtual collisions. Đây chỉ là kết quả trong tọa độ mô phỏng.

## D. Kết quả test thực tế

| Gate trên branch sạch từ `main` | Kết quả |
|---|---|
| Frontend Node tests | 46/46 PASS |
| Backend unittest | 58/58 PASS |
| Engine/scenario | 22/22 PASS |
| Support/lifecycle/presentation/recording | 8/8 PASS |
| Targeted ESLint | PASS |
| Deterministic stress | 1.000/1.000 runs, 0 virtual collisions |
| HTTPS route/module smoke | HTTP 200 |
| Visual WebGL/MediaRecorder E2E | NOT VERIFIED — browser unavailable |

## E. Lint và build

- `npm run build`: PASS, 2.315 modules.
- Simulator chunk: JS 48,14 kB (gzip 15,64 kB), CSS 8,63 kB (gzip 2,48 kB).
- Base JS chunk: 1.555,97 kB (gzip 435,46 kB), vẫn có warning >500 kB.
- `npm run lint` toàn repo: FAIL baseline 39 errors/17 warnings ở file legacy ngoài feature.
- Targeted lint cho `App.jsx`, simulator và test mới: PASS.

## F. Source thay đổi

- `src/App.jsx`: đăng ký route lazy-loaded.
- `src/simulation/`: engine, orchestrator, scenarios, Three.js scene, UI, loop, recording và presentation.
- `tests/`: 30 test mới cho engine/scenario/security/lifecycle/presentation/recording.
- `docs/project-audit/ROAD_SIMULATION_*.md`: kiến trúc, scenario, test, handoff và final report.

## G–L. Git, PR và verification

| Trường | Giá trị tại thời điểm tạo báo cáo |
|---|---|
| Feature commit trên branch sạch | `ccb144e50f15` |
| Validation docs commit | `671537ab9460` |
| Remote branch | `origin/feat/dms-road-obstacle-avoidance-sim` |
| Remote branch URL | `https://github.com/CrissNguyenKhanh/AI-DRIVER-MONITORING-SYSTEM-DMS/tree/feat/dms-road-obstacle-avoidance-sim` |
| Pull Request | `https://github.com/CrissNguyenKhanh/AI-DRIVER-MONITORING-SYSTEM-DMS/pull/12` |
| Base/head | `main` ← `feat/dms-road-obstacle-avoidance-sim` |
| PR state tại snapshot này | OPEN — đang đánh giá checks/reviews trước auto-merge |
| Merge commit | Chưa có tại snapshot pre-merge; final response là nguồn trạng thái sau merge |
| PR #11 isolation | PASS — branch delivery xuất phát trực tiếp từ `main`; không chứa commit PR #11 |

## M. Finding còn mở

- Global lint baseline 39 errors/17 warnings.
- Visual WebGL/MediaRecorder browser E2E chưa có browser để chạy.
- PR B absent; PR C blocked; S10 chưa phải secure authenticated driving session.
- Real detector/model không được nối vào offline route; UI hiển thị unavailable.
- Base bundle legacy >500 kB.
- Medical fallback warning thuộc baseline backend, ngoài feature.

## N. Giới hạn real-world driving

Simulator không điều khiển xe thật, không có CAN/actuator output và không đo khoảng cách/TTC từ camera. `productionControlOutput` luôn `null`. Không được gọi feature này là autonomous-driving system, accident-avoidance guarantee hoặc safety-certified product.

Trạng thái merge/post-merge cuối cùng phải được xác minh từ GitHub và final response; không suy ra từ snapshot pre-merge này.
