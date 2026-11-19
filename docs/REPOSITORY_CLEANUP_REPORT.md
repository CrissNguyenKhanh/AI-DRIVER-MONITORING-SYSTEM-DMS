# Repository Cleanup Report

Ngày audit: 2026-11-19

Nhánh: `chore/runtime-flow-repository-cleanup`

Baseline: commit `6eb4116043997a41814e7a4413ea83f4653fd0e7`

## 1. Phạm vi và nguyên tắc

Audit bắt đầu từ worktree sạch, không dùng `git reset`, `git stash`, `git clean` hoặc bulk delete.
File chỉ bị xóa khi có bằng chứng kết hợp: loại file, nội dung, Git history, import/reference graph và
runtime/deployment path. “Không thấy direct import” một mình không được coi là đủ.

Đã bảo toàn toàn bộ model, dataset, database/migration, `.env.example`, test, media/source và tài
liệu lịch sử chưa có bằng chứng an toàn để xóa.

## 2. Inventory và phân loại

Baseline có 211 tracked files. Các nhóm chính:

| Nhóm | Path | Phân loại/quyết định |
|---|---|---|
| DMS runtime | `backend/app.py`, `backend/data/api`, `data/auth.py`, `data/dms`, `data/adas` | giữ |
| Medical runtime | `backend/len.py` | giữ; service legacy độc lập |
| Frontend runtime | `frontend/demothuattoanpro/src`, configs, public assets | giữ |
| Simulation/cockpit | `src/simulation`, `src/adas` | giữ; có test và route thật |
| Tests | `backend/tests`, `frontend/.../tests` | giữ toàn bộ |
| Models | `driver_training/models/*.pkl`, `phone_yolo.onnx` | giữ; runtime assets |
| Training data | CSV dưới `driver_training/collect` và `phone_data.csv` | giữ; không xóa dữ liệu |
| Training/tooling | `driver_training/collect`, `train`, `quicktest.py` | giữ; standalone entrypoints |
| Migration/config | `migrations`, `.env.example`, `render.yaml`, Vite/Vercel configs | giữ/cập nhật an toàn |
| Docs/images | root handoff, `docs/project-audit`, `docs/images` | giữ; provenance/audit history |
| Generated local | `node_modules`, `dist`, untracked `__pycache__` | đã ignore; có thể regenerate |
| Tracked generated/one-off | 4 `.pyc`, `export_log.txt`, `fix_msg.py` | xóa có bằng chứng |
| Duplicate package layer | root package pair và `DiQuaMuaHaa/frontend` package pair | xóa; app package thật nằm sâu hơn |

Ba CSV lớn khoảng 12.9 MiB, 16.1 MiB và 33.7 MiB cùng model ONNX/pickle được giữ nguyên. Kích
thước lớn không phải lý do xóa dữ liệu/model.

## 3. Import graph và dynamic/deployment references

### Frontend

Static graph quét 58 module `.js/.jsx/.mjs`, resolve relative import/export và kiểm tra thêm route,
dynamic import, test và asset reference. Bốn kết quả không có static inbound edge:

- `simulation/RoadDrivingDemo.jsx`: false positive; được lazy-load bằng `import()` trong `App.jsx`.
- `simulation/index.js`: public barrel/API; giữ để không phá consumer ngoài graph hiện tại.
- `User/test.jsx`: legacy page candidate, hiện không có route; giữ vì là source có logic/data flow.
- `hand-dection/video/khanh.js`: file rỗng, không reference; giữ để tránh xóa source chỉ dựa trên
  import graph. Có thể xử lý trong PR legacy cleanup riêng.

`App.jsx` là route composition root. `main.jsx` là entrypoint. `vite.config.js` tạo proxy DMS,
Medical và Socket.IO; `vercel.json` đảm bảo SPA fallback.

Không có file `.cmd`/`.bat` nào được track trong repository tại thời điểm audit. Runbook cũ nằm
ngoài repo (nếu có) không thể được coi là source of truth; hai script PowerShell mới là tooling
đã được đưa vào Git và smoke-test.

### Backend

- `app.py` là production/development DMS entrypoint; `data/api/api.py` chứa Flask app/routes.
- `len.py` là entrypoint Medical riêng, không được coi là dead code vì frontend có các route legacy.
- Các file training/collect và `quicktest.py` là CLI entrypoint, không cần import từ server.
- `render.yaml` trỏ `rootDir=DiQuaMuaHaa/backend` và `app:app`; vì vậy không được xóa `app.py`.
- Model path được resolve từ `Path(__file__).parents[2]`, không phụ thuộc current working directory.
- Identity/driving/auth có dynamic DDL và migration; không xóa vì chỉ thấy call theo endpoint.

### Contract mismatch được giữ lại để xử lý có migration

Frontend `User/vippoint.jsx` gọi `/api/ai/diagnoses` và `PUT /api/records/<id>/confirm`, nhưng
`len.py` chưa cung cấp hai route/schema confirmation tương ứng. Không thêm route ghi dữ liệu nửa
vời trong cleanup này vì `MedicalRecord` chưa có `actual_diagnosis`/doctor audit columns. Đây là
finding P1 của legacy Medical, không phải lý do xóa page.

## 4. Danh sách xóa chính xác

Tổng cộng 10 tracked files:

1. `DiQuaMuaHaa/backend/data/__pycache__/__init__.cpython-310.pyc`
2. `DiQuaMuaHaa/backend/data/__pycache__/__init__.cpython-313.pyc`
3. `DiQuaMuaHaa/backend/data/__pycache__/database.cpython-313.pyc`
4. `DiQuaMuaHaa/backend/data/__pycache__/patient_data.cpython-313.pyc`
5. `export_log.txt` — console log của lần export `phone_yolo.onnx`, có absolute path máy cũ.
6. `fix_msg.py` — callback hai dòng dùng một lần để sửa metadata `Made-with` trong commit cũ.
7. `package.json` — package root chỉ chứa `three`, không có script/workspace; app thật đã khai báo
   cùng dependency trong `demothuattoanpro/package.json`.
8. `package-lock.json` — lockfile đi kèm package root thừa.
9. `DiQuaMuaHaa/frontend/package.json` — file `{}` không có script/dependency.
10. `DiQuaMuaHaa/frontend/package-lock.json` — lockfile rỗng tương ứng.

Các package file thật tại `DiQuaMuaHaa/frontend/demothuattoanpro/` được giữ và `npm ci` thành công.
Không có model/dataset/database/user data/migration/test nào bị xóa.

## 5. `.gitignore` và generated artifacts

Repository đã ignore `node_modules/`, `dist/`, `.env*` (allow `.env.example`), virtualenv,
`__pycache__/`, `*.py[cod]`, training runs/datasets và untrusted `.pt`. Audit thêm `.runtime/` để
start/stop script có thể lưu PID/log mà không pollute Git.

`node_modules` đã được tạo lại bằng `npm ci` và được giữ để có thể chạy ngay. `dist`, `.runtime`
và các thư mục `__pycache__` cục bộ được xóa sau khi test/build/smoke hoàn tất. Chúng không được
commit và đều có thể tái tạo. Cache npm phục vụ audit nằm ngoài repository, không thuộc source tree.

## 6. Các chỉnh sửa nhỏ có bằng chứng

- Windows DMS entrypoint không còn import/monkey-patch Eventlet. Flask-Socket.IO dùng threading
  đúng như `data/api/api.py`; Linux/Render vẫn dùng Eventlet worker.
- `render.yaml` khai báo `DATABASE_URL` khi `DB_BACKEND=postgres`, cùng các secret/origin cần cấu
  hình thay vì để deployment fail ngầm.
- `.env.example` bổ sung TTL, frontend origin và Medical bootstrap variables đang được source đọc.
- Frontend `.env.example` bổ sung landing/map integration variables đang được source đọc.
- Live DMS BroadcastChannel truyền thêm `phone_usage`/`hand_gesture` dạng metrics; vẫn loại raw
  image, landmark và token. Test regression kiểm tra whitelist này.
- Thêm PowerShell preflight/start/stop với PID start-time guard; không tự install/migrate và không
  in secret.

## 7. Những gì cố ý không làm

- Không chia nhỏ monolith `api.py`, `len.py`, `thucmuctest.jsx`; đây là refactor rủi ro cao.
- Không đổi tên thư mục legacy/misspelled (`systeamdetectface`, `hand-dection`, `testdata`) vì sẽ
  làm rộng diff/import contract.
- Không xóa `User/test.jsx`, empty training placeholders, barrel export, hand video hay docs cũ.
- Không chạy migration/down migration hoặc tạo enrollment record trên database thật.
- Không update dependency hàng loạt/caniuse database trong cleanup PR.
- Không claim browser/webcam/Telegram production E2E.

## 8. Verification

| Gate | Kết quả |
|---|---|
| `npm ci` từ lockfile | PASS — 279 packages |
| Frontend Node tests | PASS — 84/84 |
| Backend unittest | PASS — 86/86 |
| ESLint | PASS — 0 error, 16 warning |
| Vite production build | PASS — 2,330 modules |
| PowerShell script parse/preflight | PASS |
| Windows `import app` | PASS — Socket.IO `threading` |
| DMS root/health/db probe | PASS — HTTP 200, MySQL available |
| Protected auth without token | PASS — HTTP 401 |
| SPA route shell `/`, `/test3`, `/test5`, `/adas-simulation`, `/demo/road-driving` | PASS — HTTP 200 |
| Browser/camera visual E2E | NOT VERIFIED |

Global `pip check` có conflict từ các package ngoài DMS (JAX/TensorFlow/audio/dev tooling). Test
DMS vẫn PASS; runbook yêu cầu virtualenv sạch để loại nhiễu nền này.

## 9. Rollback

Cleanup chỉ là Git changes; có thể revert commit cleanup sau khi review. Không có database/data
mutation cần rollback. Không dùng `.down.sql` để rollback source cleanup.
