# Kịch bản mô phỏng đường bộ S01–S10

## 1. Quy ước chung

Mười kịch bản dưới đây là fixture tổng hợp của frontend-only simulator. Chúng không tải video, không gọi model/backend/external service và không phát lệnh điều khiển xe thật.

Mỗi run được xác định bởi:

- scenario ID;
- seed;
- simulation config;
- fixed timestep 0,05 s;
- chuỗi timed events;
- input cục bộ bổ sung, nếu có.

`createScenario` dùng một PRNG có seed để tạo biến thiên nhỏ cho tốc độ/vị trí ban đầu mà không đổi topology hoặc expected outcome. Default seed là `20261105`. Cùng input phải cho cùng logic state và metrics; renderer không bắt buộc pixel-perfect giữa GPU/browser.

### Ranh giới diễn giải

- Tất cả obstacle đều là **synthetic**.
- Tất cả lane/position/speed/distance/TTC/clearance đều thuộc **virtual coordinates**.
- DMS values trong UI là fixture tổng hợp, không phải kết quả model accuracy đã được xác nhận.
- `LOCAL_SESSION` và `LOCAL_ALERT` chỉ là timeline memory cục bộ, `persisted: false`.
- PR B chưa tồn tại và PR C đang blocked; S10 không phải secure E2E và không được gọi session/history API.
- `collisionCount = 0` chỉ có nghĩa engine không phát hiện overlap trong run ảo đó; không phải bảo đảm tránh tai nạn.

## 2. Trạng thái và metric quan sát

### State chính

| Nhóm | Giá trị |
|---|---|
| Driver | `NORMAL`, `DROWSY`, `DISTRACTED`, `HIGH_RISK`, `UNKNOWN` |
| Decision | `KEEP_LANE`, `SLOW_DOWN`, `STOP`, `SHIFT_LEFT`, `SHIFT_RIGHT`, `UNKNOWN` |
| Assistance | `MANUAL_SIMULATED`, `WARNING_DRIVER`, `ASSISTANCE_EVALUATION`, `SIMULATED_BRAKING`, `SIMULATED_LANE_CHANGE`, `SIMULATED_SAFE_STOP`, `RECOVERY`, `UNKNOWN` |
| Maneuver | `NONE`, `BRAKING`, `LANE_CHANGE`, `PASSING`, `RECOVERY`, `ABORTING`, `STOPPING`, `COMPLETE` |
| Run | `RUNNING`, `PAUSED`, `COMPLETE` |

### Metrics

| Metric | Ý nghĩa hợp lệ | Không được diễn giải là |
|---|---|---|
| `collisionCount` | Số obstacle ảo có bounding overlap với EGO, đếm một lần theo ID | Số tai nạn thật dự đoán/tránh được |
| `collidedObstacleIds` | ID fixture ảo đã overlap | Object ID từ camera/model thật |
| `minimumVirtualClearance` | Clearance nhỏ nhất giữa bounding rectangles trong world ảo | Khoảng cách camera đo được |
| `timeToVirtualStop` | Simulation timestamp khi EGO đạt virtual stop | Thời gian phanh của xe thật |
| `maximumAcceleration` | Gia tốc dọc lớn nhất do engine áp dụng | Khả năng actuator thật |
| `maximumBraking` | Độ lớn giảm tốc lớn nhất trong engine | Quãng phanh/thử nghiệm an toàn thật |
| `maximumLateralStep` | Dịch ngang lớn nhất trong một fixed step | Sai số steering hoặc lane detection thật |
| `maximumLateralSpeed` | Tốc độ ngang cực đại trong world ảo | Dynamic performance của xe thật |
| `visitedLanes` | Lane index mà EGO đã hoàn tất chuyển tới | Làn đường nhận diện từ video |

Nếu scenario không có obstacle, `minimumVirtualClearance` có thể là `null`. Nếu scenario không yêu cầu dừng, `timeToVirtualStop` có thể là `null`; đây không phải missing test.

## 3. Bảng expected behavior

| ID | Duration | Driver/event chính | Topology tổng hợp | Expected contract |
|---|---:|---|---|---|
| S01 | 12 s | `NORMAL` | Đường trống | `KEEP_LANE` |
| S02 | 12 s | `DISTRACTED` tại 0,5 s | Đường trống | Warning, không đổi làn |
| S03 | 18 s | `DISTRACTED` tại 0,25 s | Front obstacle; phải bị chặn; trái trống | Phanh → trái → vượt → phục hồi |
| S04 | 18 s | `DROWSY` tại 0,25 s | Front obstacle; trái bị chặn; phải trống | Phanh → phải → vượt → phục hồi |
| S05 | 15 s | `DISTRACTED` từ đầu | Front obstacle; hai bên bị chặn | Phanh → dừng |
| S06 | 16 s | `DISTRACTED`; obstacle trái active tại 3,1 s | Đang né trái thì target lane bị chiếm | Abort/re-evaluate → dừng |
| S07 | 10 s | Driver/perception `UNKNOWN` tại 0,5 s | Lane geometry unavailable | Không đổi làn mù; controlled slowdown |
| S08 | 18 s | `DISTRACTED`, về `NORMAL` tại 3,25 s | Front obstacle; trái trống | De-escalate warning, maneuver vẫn nhất quán |
| S09 | 24 s | `DROWSY` | Nhiều obstacle tĩnh/động; trái bị chiếm, phải khả dụng theo horizon | Chỉ dùng corridor phải đã validation; tôn trọng occupancy và hoàn tất recovery |
| S10 | 16 s | Local session/alert timeline | Front obstacle; hai bên bị chặn | Local-only safe stop; secure workflow blocked |

Duration là thời lượng fixture, không phải timeout chứng minh mọi maneuver tùy ý luôn hoàn thành. S09 dùng 24 giây để hai chu kỳ avoidance/recovery của fixture mặc định hoàn tất tự nhiên, không teleport về làn gốc.

## 4. S01 — Normal drive

### Thiết lập

- Driver bắt đầu và giữ `NORMAL`.
- Không obstacle.
- Không timed event.
- EGO bắt đầu ở làn giữa với tốc độ gần cruise speed.

### Diễn biến kỳ vọng

1. Assistance ở `MANUAL_SIMULATED`.
2. Decision giữ `KEEP_LANE`.
3. Speed hội tụ dần về cruise speed trong giới hạn acceleration.
4. EGO tiến dọc đường; lateral position và lane không đổi.

### Tiêu chí chấp nhận

- Không bắt đầu maneuver.
- `visitedLanes` chỉ chứa làn ban đầu.
- `maximumLateralStep = 0`.
- `collisionCount = 0`.
- Không tạo warning hoặc local alert.

### Hành vi bị cấm

- Tự đánh lái khi đường trống.
- Tuyên bố đang dùng lane/object detection thật.

## 5. S02 — Driver distracted, no obstacle

### Thiết lập

- Driver ban đầu `NORMAL`.
- Tại 0,5 s, fixture chuyển thành `DISTRACTED`.
- Không obstacle.

### Diễn biến kỳ vọng

1. Driver transition được ghi vào local timeline.
2. Orchestrator chuyển sang `WARNING_DRIVER`.
3. Decision vẫn `KEEP_LANE` vì không có road hazard.
4. Xe tiếp tục trong làn hiện tại; không tạo maneuver tránh vật cản.

### Tiêu chí chấp nhận

- Có warning state sau event.
- Không xuất hiện `BRAKING`, `LANE_CHANGE`, `ABORTING` hoặc `STOPPING` do distraction đơn lẻ.
- Lane/x không đổi ngoài sai số số học bằng không của fixture.
- `collisionCount = 0`.

### Hành vi bị cấm

- `DISTRACTED` tự động kích hoạt `SHIFT_LEFT`/`SHIFT_RIGHT`.
- Gọi warning là quyền điều khiển xe thật.

## 6. S03 — Distracted + front obstacle, left corridor clear

### Thiết lập

- Driver chuyển `DISTRACTED` tại 0,25 s.
- Static obstacle ở phía trước làn giữa.
- Dynamic blocker ở làn phải.
- Làn trái là candidate corridor hợp lệ ban đầu.

### Diễn biến kỳ vọng

1. DMS fixture tạo warning.
2. Front hazard đi vào virtual hazard/prediction horizon.
3. Orchestrator xác nhận trái clear, phải blocked.
4. Engine vào `BRAKING` trước; không đổi `x` tức thời.
5. Sau pre-brake và kiểm tra lại, engine vào `LANE_CHANGE` sang trái.
6. EGO vượt obstacle trong `PASSING`.
7. Khi làn gốc clear, EGO quay lại bằng `RECOVERY` liên tục.

### Tiêu chí chấp nhận

- `visitedLanes` có làn trái sau khi transition hoàn tất.
- Có braking trước lateral transition.
- Mỗi lateral step bị giới hạn và không có teleport.
- Không đi vào làn phải đang bị chặn.
- Không collision trong expected run.

### Hành vi bị cấm

- Chỉ hiển thị chữ `SHIFT_LEFT` trong khi xe không dịch ngang.
- Dùng virtual clearance làm distance đo từ video.

## 7. S04 — Drowsy + front obstacle, right corridor clear

### Thiết lập

- Driver chuyển `DROWSY` tại 0,25 s.
- Static obstacle ở phía trước làn giữa.
- Dynamic blocker ở làn trái.
- Làn phải là candidate corridor hợp lệ ban đầu.

### Diễn biến kỳ vọng

Đối xứng S03: warning → virtual hazard → phanh → kiểm tra lại → chuyển phải liên tục → vượt → recovery khi làn gốc clear.

### Tiêu chí chấp nhận

- `visitedLanes` có làn phải.
- Không đi vào làn trái bị chặn.
- Speed giảm trước/trong maneuver theo giới hạn.
- Không teleport và không collision trong expected run.

### Hành vi bị cấm

- Xem `DROWSY` là đủ để đổi làn nếu không có hazard.
- Tuyên bố đây là phản ứng của xe thật.

## 8. S05 — Both sides blocked

### Thiết lập

- Driver `DISTRACTED` từ đầu.
- Static obstacle phía trước.
- Dynamic blockers chiếm hành lang trái và phải.

### Diễn biến kỳ vọng

1. Front hazard và impairment kích hoạt assistance evaluation.
2. Cả hai lane-clearance checks trả blocked.
3. Orchestrator chọn `STOP`, reason `NO_VALIDATED_VIRTUAL_ESCAPE_CORRIDOR`.
4. Engine vào `STOPPING`, dùng braking bị giới hạn và dừng trước obstacle theo virtual geometry nếu fixture cho phép.

### Tiêu chí chấp nhận

- Không có `LANE_CHANGE`.
- EGO giữ làn giữa.
- Speed đạt 0 trong scenario; `timeToVirtualStop` được ghi.
- `collisionCount = 0` trong expected fixture.

### Hành vi bị cấm

- Chọn một làn bị chặn vì “bên ít nguy hiểm hơn”.
- Teleport xe qua obstacle.

## 9. S06 — Sudden target-lane obstacle

### Thiết lập

- Driver `DISTRACTED` từ đầu.
- Front obstacle ở làn giữa; làn phải bị chặn.
- Obstacle `late-left-blocker` tồn tại nhưng inactive.
- Tại 3,1 s, obstacle này được activate trong target lane trái.

### Diễn biến kỳ vọng

1. Engine ban đầu phanh và chọn trái.
2. Khi target obstacle xuất hiện, lane clearance được đánh giá lại ở fixed step kế tiếp.
3. Nếu progress còn trong abort threshold và source lane có thể quay lại, engine vào `ABORTING` và dịch liên tục về nguồn.
4. Sau abort, engine tiếp tục `STOPPING`.
5. Nếu return không còn an toàn, engine chọn stop thay vì hoàn thành lane change mù.

### Tiêu chí chấp nhận

- Timeline có obstacle activation và re-evaluation/abort hoặc safe-stop reason.
- Không tiếp tục đi sâu vào target lane đã bị chiếm.
- Không đổi `x` tức thời khi abort.
- Expected fixture kết thúc ở dừng ảo, không collision.

### Hành vi bị cấm

- Cache clearance cũ cho toàn maneuver.
- Coi event obstacle tổng hợp là detection từ camera.

## 10. S07 — Camera lost / perception unknown

### Thiết lập

- Driver ban đầu `NORMAL`.
- Tại 0,5 s: driver state thành `UNKNOWN`, perception unavailable và lane geometry unknown.
- Không obstacle fixture.

### Diễn biến kỳ vọng

1. Orchestrator trả mode/decision `UNKNOWN`.
2. `requestedTargetLane = null`.
3. Engine yêu cầu controlled slowdown về ngưỡng unknown-perception thay vì tăng tốc/đổi làn.
4. EGO giữ lane hiện tại.

### Tiêu chí chấp nhận

- Không `LANE_CHANGE` hoặc corridor-clear claim sau perception loss.
- Speed giảm có giới hạn; không cần đạt 0 nếu policy chỉ yêu cầu controlled slowdown.
- UI không hiển thị road safe.
- `collisionCount = 0` cho fixture không obstacle.

### Hành vi bị cấm

- Mặc định UNKNOWN thành `safe`.
- Dùng lane geometry trước sự kiện để bắt đầu maneuver mới.

## 11. S08 — Driver recovers during maneuver

### Thiết lập

- Driver `DISTRACTED` từ đầu.
- Front obstacle ở làn giữa; phải bị chặn; trái clear.
- Tại 3,25 s, driver trở lại `NORMAL` trong lúc maneuver đang diễn ra.

### Diễn biến kỳ vọng

1. Hazard đã làm engine phanh/chuyển trái.
2. Recovery của driver dừng tích lũy/escalation warning mới.
3. Maneuver đang hoạt động được hoàn tất hoặc abort theo world safety state; không reset tức thời.
4. Sau khi vượt, EGO recovery về làn gốc nếu clear.
5. Policy cuối trở lại `MANUAL_SIMULATED`/`KEEP_LANE` khi maneuver complete.

### Tiêu chí chấp nhận

- Driver event không làm lane/x/speed teleport.
- Không bỏ qua obstacle chỉ vì driver đã `NORMAL`.
- Không khởi tạo thêm maneuver không cần thiết.
- Expected fixture không collision.

### Hành vi bị cấm

- Reset xe về center lane ngay tại 3,25 s.
- Duy trì warning impaired vô hạn sau recovery.

## 12. S09 — Multiple static and moving obstacles

### Thiết lập

- Driver `DROWSY`.
- Front static obstacle ở làn giữa.
- Làn trái có obstacle gần và xa.
- Làn phải có obstacle xa; làn giữa còn dynamic obstacle xa hơn.

### Diễn biến kỳ vọng

1. Planner đánh giá cả front/rear swept clearance theo velocity tương đối.
2. Làn trái bị các obstacle gần/xa ràng buộc; engine không được chọn trái chỉ vì đó là hướng ưu tiên mặc định.
3. Corridor phải chỉ được dùng sau khi clearance trong horizon hiện tại hợp lệ.
4. Trong `PASSING`/`RECOVERY`, occupancy tiếp tục được đánh giá.
5. Fixture 24 giây cho phép lần recovery thứ hai hoàn tất tự nhiên; nếu engine chậm hơn do thay config, state vẫn phải giữ tiến độ thật và không teleport.

### Tiêu chí chấp nhận

- Không đi vào lane bị occupied theo clearance contract.
- Expected fixture ghi nhận làn phải là adjacent lane hợp lệ và kết thúc trở lại làn gốc.
- Mọi lane change đều đi qua `BRAKING` và transition liên tục.
- Dynamic obstacle position tăng đúng theo speed × fixed time.
- Không duplicate collision count theo nhiều frame.

### Hành vi bị cấm

- Chỉ kiểm tra static snapshot ban đầu.
- Ép `COMPLETE` maneuver bằng cách gán lane/x khi hết scenario duration.

## 13. S10 — Offline end-to-end timeline

### Thiết lập

- Driver ban đầu `NORMAL`, chuyển `DISTRACTED` tại 0,75 s.
- Local session event `STARTED` tại 0,1 s.
- Local alert `DISTRACTION_WARNING` tại 1,8 s.
- Local session event `ENDED` tại 13,5 s.
- Front obstacle và blockers hai bên buộc safe stop.
- `security.integrationBlocked = true`.
- `security.reason = PR_B_SERVER_VERIFICATION_GRANT_NOT_AVAILABLE`.

### Diễn biến kỳ vọng

1. Timeline local bắt đầu, nhưng không có authentication/grant/API call.
2. Driver distracted tạo warning fixture.
3. Front obstacle được đánh giá; hai hành lang blocked.
4. Engine phanh và dừng ảo.
5. Local alert count tăng theo event.
6. Local session chuyển `ENDED`, không persist history.

### Tiêu chí chấp nhận

- `offlineOnly = true`.
- `secureWorkflowAvailable = false`.
- `protectedWorkflowStatus = UNAVAILABLE_PR_B`.
- `localSession.persisted = false` ở mọi snapshot.
- Không gọi `/api/driving/session/start`, alert/history/Telegram hoặc biometric endpoint.
- Không có production control output.

### Hành vi bị cấm

- Gọi S10 là authenticated driving session hoặc secure E2E.
- Ghi local timeline vào production history bằng bearer-only fallback.
- Tạo verification grant giả phía client.

## 14. Ma trận invariants xuyên kịch bản

| Invariant | S01 | S02 | S03 | S04 | S05 | S06 | S07 | S08 | S09 | S10 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Deterministic với cùng seed/config | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Không production output | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Không arbitrary swerving | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lane-clearance gate | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Smooth lateral transition | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — |
| Safe-stop path | — | — | fallback | fallback | ✓ | ✓ | controlled slowdown | fallback | fallback | ✓ |
| Local security boundary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ đặc biệt |

“Fallback” nghĩa là safe stop phải còn khả dụng nếu corridor trở nên không hợp lệ; không có nghĩa scenario bắt buộc đi qua stop trong expected path.

## 15. Cách đánh giá scenario

Một scenario chỉ được báo PASS khi đồng thời:

1. Expected policy/maneuver sequence xảy ra hoặc safe fallback được kích hoạt đúng lý do.
2. Không vi phạm lane boundary/clearance invariant.
3. Không teleport hoặc vượt acceleration/braking config.
4. `collisionCount` đúng với fixture; expected catalog hiện yêu cầu không collision.
5. Timeline có event theo thứ tự simulation timestamp.
6. Re-run cùng seed/config cho cùng final logic snapshot/metrics.
7. Mọi output vẫn có simulation-only boundary.
8. Không có network/hardware/production authorization side effect.

Actual result, số test pass/fail, collision/clearance/stop-time đo được và behavior chưa hoàn chỉnh phải được ghi trong `ROAD_SIMULATION_TEST_REPORT.md`. Không điền kết quả dự kiến vào cột actual và không dùng tài liệu scenario này để thay thế test evidence.

## 16. Manual presentation checklist

- Xe EGO tiến liên tục trong scene, camera theo xe.
- S03/S04 cho thấy phanh trước rồi mới dịch ngang; không chỉ đổi label.
- S05/S10 cho thấy speed giảm dần tới 0.
- S06 cho thấy target obstacle xuất hiện và xe re-evaluate/abort liên tục.
- S07 hiển thị UNKNOWN và không tuyên bố lane safe.
- S08 không teleport khi driver phục hồi.
- Split view ghi rõ video prerecorded là bất biến và virtual world là synthetic.
- Khi object detector thật không sẵn sàng, hiển thị `OBJECT DETECTION UNAVAILABLE`.
- Status có text/icon, không phụ thuộc màu.
- Pause/Resume/Reset và playback rate không làm sai fixed-step result.
- Camera driver/rear/external không thay đổi physics.
- Recording luôn có watermark simulation-only; không thu biometric/camera nếu chưa có consent riêng.

## 17. Safety wording

Được phép báo cáo:

- “S05 kết thúc với zero virtual collision trong deterministic fixture X.”
- “Minimum virtual clearance là metric của synthetic world.”
- “Engine đã thực hiện chuyển làn liên tục trong Three.js scene.”
- “Unknown perception chặn lane-change initiation.”

Không được báo cáo:

- “ADAS bảo đảm tránh tai nạn.”
- “Khoảng cách/TTC đã được camera đo.”
- “Xe thật đã phanh hoặc chuyển làn.”
- “DMS đã được chứng minh chính xác/an toàn.”
- “S10 hoàn tất secure authentication/session/history.”
- “Simulator đã được validation như autonomous-driving system.”
