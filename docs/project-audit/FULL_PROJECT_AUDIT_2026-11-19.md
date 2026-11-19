# Full Project Audit — DMS Master V3

Ngày kiểm tra: 2026-11-19 (Asia/Bangkok)

## Kết luận nhanh

Nhánh làm việc hiện tại là `fix/dms-enrollment-and-cockpit-stabilization`, được tạo
từ nhánh tích hợp `feat/master-completion-v3` mà không reset/stash/clean các thay
đổi có sẵn. Nhánh nền đã chứa toàn bộ Integrated Cockpit V2 và bốn lớp hardening V3: medical
fail-closed, one-time server verification grant, biometric enrollment/privacy và
DMS inference fail-safe.

Các gate tự động chính đều đạt sau audit:

| Gate | Kết quả |
|---|---|
| Frontend Node tests | PASS — 84/84 |
| Backend unittest | PASS — 86/86 |
| ESLint toàn frontend | PASS — 0 error, còn 16 warning |
| Production build | PASS — 2.330 modules |
| `git diff --check` | PASS |
| High-confidence secret pattern scan | PASS — không có finding |
| Browser visual/audio/recording E2E | NOT VERIFIED — không có browser provider hoặc Windows native pipe |

Không nên gọi dự án là production-ready hoặc safety-certified chỉ dựa trên các
gate trên. Các luồng camera thật, Telegram, database thật, model thật và trải
nghiệm WebGL/MediaRecorder vẫn cần smoke/E2E trên môi trường triển khai.

## Những phần đã làm được

### DMS và inference

- Webcam/camera lifecycle có chống duplicate stream, cleanup khi unmount và xử lý
  permission đến muộn.
- Landmark, EAR, PERCLOS, head pose và attention state có test cho hysteresis,
  continuity, face loss và lỗi pose solver.
- Kết quả inference mơ hồ hoặc model thiếu trả trạng thái unavailable/unknown;
  không âm thầm đổi thành trạng thái an toàn.
- Phone detector hỗ trợ ONNX runtime, có nhánh `.pt` được khóa theo trust policy.
- Smoking và hand model chưa được xác minh được công khai là unavailable thay vì
  tạo kết quả giả.

### Xác thực, quyền và dữ liệu sinh trắc

- Bearer session phân biệt admin/driver; endpoint admin kiểm tra role phía server.
- Enrollment code và Telegram bind code là one-time, có hạn dùng và chống replay.
- Driving session cần verification grant đúng driver, auth session và purpose;
  grant được hash và tiêu thụ atomically.
- Callback Telegram sai owner, hết hạn, lặp lại hoặc không hợp lệ không mint grant.
- Biometric enrollment phân biệt initial/replacement, versioned update và rollback
  khi ghi thất bại.
- API profile chỉ trả metadata; frontend không phụ thuộc ảnh khuôn mặt trong
  `localStorage`.

### Medical

- Không còn default admin credential.
- JWT xác định owner/role phía server; client không thể tự gán admin.
- Image model thiếu hoặc inference lỗi trả machine-readable 503/fail-closed và
  không ghi một chẩn đoán giả vào database.

### ADAS simulation và cockpit

- Engine deterministic fixed-step, 20 scenario S01–S20, lane clearance, bounded
  braking, lane change liên tục, abort, safe stop và recovery.
- Simulator không có CAN/actuator output; `productionControlOutput` luôn `null`.
- Cockpit có normalized event contract, ưu tiên alert, audio unlock/cooldown,
  timeline bounded, report JSON/CSV/print và local recording cleanup.
- Live DMS bridge chỉ truyền metrics/state qua `BroadcastChannel`, không truyền
  token, landmark hay ảnh sinh trắc.
- V3 local work bổ sung ba mode rõ nguồn dữ liệu, bộ lọc timeline, replay seed,
  fullscreen, S20 showcase guide và road-video mode tách khỏi DMS metrics.
- Offline report dùng `NOT_APPLICABLE`; live report dùng `NOT_STARTED` cho protected
  session và yêu cầu one-time server grant.

## Root cause và phần đã sửa trong lượt này

### Enrollment và session

- `face_detect.jsx` trước đây chứa một form enrollment thứ hai, tự thay Driver ID
  rỗng thành `driver_001`, chỉ kiểm tra sự tồn tại của token và báo lỗi code chung.
- Backend gộp code sai, hết hạn, đã dùng và không khớp Driver ID vào một response,
  làm frontend không thể hướng dẫn người dùng đúng cách.
- Đã tạo `DmsProtectedRoute`, `DmsEnrollmentPanel` và context session chung. Mọi
  route `/test3`, `/test4`, `/test5`, `/adas-simulation` gọi `/api/auth/me` trước
  khi mount nội dung. Focus lại tab sẽ xác minh lại; 401/403 xóa phiên; lỗi mạng
  khóa quyền nhưng giữ token để thử lại.
- Form mới có hướng dẫn tiếng Việt, validation, Enter submit, hiện/ẩn code,
  loading, single-flight chống double submit và lỗi riêng cho wrong/expired/
  used/replay/mismatch. Logout luôn xóa local session kể cả server mất kết nối.
- Trang `/dms/admin/enrollment` xác thực bootstrap secret với backend, giữ admin
  token trong memory của tab, xóa secret khỏi state sau submit, cấp/copy mã một
  lần và hiển thị thời hạn. Secret/token/code không vào URL hay browser storage.
- Backend trả machine-readable code/status riêng và `/api/auth/me` trả cả thời
  hạn server session. Endpoint admin vẫn yêu cầu principal role `admin`.

### Face identity và camera

- Trạng thái đăng ký được tải từ `/api/identity/driver_profile`; ảnh local cũ
  `driver_owner_image_v1` chỉ bị xóa khỏi browser sau enrollment/session validation
  và không bao giờ được dùng làm bằng chứng xác thực hoặc xóa hồ sơ server.
- Đăng ký thành công chỉ đặt `REGISTERED`; không đặt `isOwner=true`, không gán
  similarity giả và không auto-redirect. Người dùng chọn rõ `CONTINUE TO DMS`.
- `VERIFIED`/`REJECTED` lấy trực tiếp từ `is_owner` do backend trả về. Smoothing
  chỉ phục vụ hiển thị. No-face, multi-face, invalid image, timeout, backend/camera
  disconnect đi về `UNAVAILABLE` hoặc trạng thái lỗi, không được coi là an toàn.
- FaceMesh identity cho phép phát hiện tối đa hai khuôn mặt và từ chối request có
  nhiều mặt bằng code `multiple_faces`. Initial enroll/replacement vẫn dùng grant
  đúng purpose, conditional write và replay protection ở server.
- Camera DMS/Face/Hand không tự mở; Start là consent rõ ràng, audio luôn false,
  có Stop/Retry, thông báo permission/device error, track-ended handling và cleanup
  khi unmount. Request verify/enrollment có timeout, AbortController và generation
  guard để response cũ không cập nhật session mới.
- Nút `CLEAR LOCAL DISPLAY` chỉ reset score/UI và ghi rõ không xóa biometric profile.

### Live DMS và Cockpit

- DMS/Face/ADAS dùng cùng server-validated principal; token có mặt trong storage
  không còn đủ để mở protected route.
- Live bridge vẫn chỉ gửi metrics/state qua `BroadcastChannel`, không gửi token,
  landmark, frame hoặc embedding. UNKNOWN/UNAVAILABLE, stale/session guard,
  dedup/cooldown, audio unlock/cleanup, timeline/report và S01–S20 đều giữ regression.
- Simulator vẫn `simulationOnly = true`, `realVehicleControlCapable = false` và
  `productionControlOutput = null`; không có CAN/steering/throttle/brake output.

## Luồng enrollment mới

1. Admin mở `/dms/admin/enrollment`, nhập bootstrap secret và nhận admin bearer
   session chỉ trong memory của tab.
2. Admin nhập Driver ID, gọi endpoint admin để tạo code một lần, xem/copy code và
   thời hạn rồi chia sẻ qua kênh tin cậy.
3. Driver mở route DMS. Protected route gọi `/api/auth/me`; nếu session còn hợp lệ
   thì vào thẳng, nếu không mới hiện form Driver ID + Enrollment Code.
4. Enrollment thành công lưu opaque driver session. Reload, chuyển route và focus
   lại tab đều kiểm tra server; không mint token từ Driver ID hoặc face result.
5. Face enrollment là bước riêng cần server approval grant. Thành công chỉ nghĩa
   là `REGISTERED`; verification tiếp theo mới có thể là `VERIFIED`/`REJECTED`.

## Finding còn mở

### P1 — cần làm trước khi gọi production-ready

1. Face identity hiện **chưa có liveness/anti-spoofing được kiểm chứng**. Kết quả
   face match không tự cấp protected driving session; server verification grant
   và approval workflow vẫn là boundary bắt buộc. Cần PAD/liveness design,
   threat model và FAR/FRR/PAD evaluation riêng trước production claim.
2. Browser E2E chưa chạy được. Cần xác minh trực quan WebGL, audio autoplay gate,
   fullscreen, local video, MediaRecorder, responsive layout và console runtime.
3. Cần E2E với MySQL/PostgreSQL thật, Telegram webhook thật, camera thật và model
   artifact thật. Unit tests hiện dùng mock/fake cho phần lớn dependency ngoài.
4. Medical image model hiện unavailable trong runtime audit; hành vi fail-closed
   là đúng, nhưng tính năng chẩn đoán ảnh không hoạt động cho tới khi provision
   model hợp lệ.
5. Road Video trong cockpit V3 hiện là local playback và link sang route ADAS
   riêng; lane/object detector trong cockpit vẫn `UNAVAILABLE`. Không nên mô tả
   đây là embedded road-video analysis cho tới khi hai pipeline được nối thật.

### P2 — chất lượng và hiệu năng

1. ESLint còn 16 warning `react-hooks/exhaustive-deps`, chủ yếu ở vòng camera/ref
   trong `thucmuctest.jsx`; cần refactor lifecycle có chủ đích, không nên thêm
   dependency máy móc.
2. Main production chunk khoảng 1.574 MB (gzip 441 KB), vượt warning 500 KB. Nên
   lazy-load thêm medical, map, chatbot và các dashboard legacy.
3. `caniuse-lite`/Browserslist data đã cũ; cần cập nhật trong một dependency PR
   riêng và chạy lại regression.
4. Repo đang track ba CSV lớn khoảng 12,88 MiB, 16,12 MiB, 32,19 MiB; model
   `landmark_model.pkl` khoảng 6,15 MiB và `phone_yolo.onnx` khoảng 11,6 MiB.
   Cần cân nhắc Git LFS hoặc release/model registry nếu lịch sử tăng nhanh.

### P3 — tài liệu và vận hành

1. Các báo cáo V2 cũ vẫn ghi PR B/C bị block vì chúng phản ánh thời điểm trước khi
   nhánh V3 tích hợp hardening. Báo cáo này là trạng thái mới hơn cho nhánh hiện tại.
2. Không tìm thấy file `.cmd`/`.bat` thuộc source trong workspace audit (chỉ có
   activation/helper script trong virtualenv). Nếu có runbook `.cmd` ở ngoài repo,
   cần đưa đúng file vào workspace để đối chiếu.
3. Delivery Git của nhánh `fix/dms-enrollment-and-cockpit-stabilization` được ghi
   ở báo cáo cuối sau khi toàn bộ gate và diff review hoàn tất.

## Nhóm file thay đổi chính

- Backend auth/identity: `backend/data/api/api.py`, `backend/data/auth.py`,
  `backend/tests/test_auth.py`.
- Frontend auth: `src/utils/authApi.js`, `src/auth/DmsProtectedRoute.jsx`,
  `src/auth/DmsSessionContext.js`, `src/auth/DmsEnrollmentPanel.jsx`,
  `src/auth/DmsAdminEnrollment.jsx`, `src/auth/DmsAuth.css`, `src/App.jsx`.
- Face/camera/DMS: `src/systeamdetectface/face_detect.jsx`,
  `src/systeamdetectface/OwnerVerifyGate.jsx`, `src/utils/cameraSession.js`,
  `src/utils/identityEnrollmentApi.js`, `src/utils/drivingSessionApi.js`,
  `src/testdata/thucmuctest.jsx`, `src/hand-dection/dectionhand.jsx`,
  `src/adas/ADASSimulation.jsx`.
- Regression: `tests/authApi.test.js`, `tests/cameraSession.test.js`,
  `tests/identityEnrollmentApi.test.js` và các test Cockpit/simulation sẵn có.

Ngoài nhóm trên, worktree kế thừa một số thay đổi audit/Cockpit V3 có sẵn trước
khi tạo nhánh. Chúng được bảo toàn đúng yêu cầu, không reset hoặc ghi đè.

## Asset và security note

Không phát hiện token dạng OpenAI/GitHub/AWS/Telegram có độ tin cậy cao trong source
scan. Tuy vậy, đây không thay thế secret scanner trong CI.

Repo hiện allow-list và track:

- `driver_training/models/landmark_model.pkl`
- `driver_training/models/hand_model.pkl`
- `driver_training/models/phone_yolo.onnx`

Pickle là định dạng có khả năng thực thi khi deserialize. Chỉ load artifact được
review/provision từ nguồn tin cậy và giữ loader fail-closed như hiện tại.

## Lệnh xác minh

```powershell
cd DiQuaMuaHaa/frontend/demothuattoanpro
node --test tests/*.test.js
npm run lint
$env:VITE_API_BASE='/'; npm run build

cd ../../backend
python -B -m unittest discover -s tests -v
```

Lưu ý: backend cần Python runtime có OpenCV, Pillow, joblib và dependency ML theo
`requirements.txt`. Virtualenv tối giản `.dms-test-env` ở workspace không đủ các
package này; Python runtime chính của workspace đã chạy đủ 86 test.

## Kiểm tra thủ công đề xuất

1. Cấu hình `DMS_ADMIN_BOOTSTRAP_SECRET`, database và frontend API base theo README.
2. Mở `/dms/admin/enrollment`, xác thực admin, cấp code cho một Driver ID thử nghiệm.
3. Mở `/test5` ở fresh browser profile, nhập Driver ID/code, reload và xác nhận
   không bị hỏi code lại khi `/api/auth/me` còn hợp lệ.
4. Chọn Start Camera, thử deny/allow/Stop/Retry; đăng ký mặt bằng approval thật,
   xác nhận UI dừng ở REGISTERED và chỉ vào DMS khi bấm nút.
5. Mở `/test3`, xác minh owner, thử camera disconnect/backend timeout/session revoke;
   trạng thái phải là UNKNOWN/UNAVAILABLE hoặc quay về enrollment, không báo safe.
6. Mở `/demo/road-driving`, unlock audio bằng user gesture, chạy S20 và kiểm tra
   thứ tự alert → virtual brake/lane change → recovery, Pause/Resume/Reset/report.
