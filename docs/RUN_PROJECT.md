# Chạy dự án DMS trên Windows

Cập nhật: 2026-11-19. Tài liệu này là runbook chuẩn cho repository hiện tại. DMS chính,
Medical API legacy và Integrated Cockpit là ba bề mặt khác nhau; không cần bật Medical API
để chạy DMS.

## 1. Runtime đã kiểm chứng

| Thành phần | Chuẩn repository | Môi trường audit đã chạy |
|---|---|---|
| Python | `3.11.9` trong `backend/.python-version`; mã hỗ trợ 3.10+ | Python 3.10.11 |
| Node.js | nên dùng Node 22 LTS | Node 22.16.0 |
| npm | theo Node/lockfile | npm 10.9.2 |
| Database DMS | MySQL/MariaDB hoặc PostgreSQL | MySQL, health probe PASS |
| Frontend | React 19 + Vite/Rolldown | HTTPS dev server cổng 5173 |

Không dùng Python global cho môi trường lâu dài. Audit phát hiện Python global có package ngoài
dự án xung đột với nhau; virtualenv tách biệt tránh biến các lỗi đó thành lỗi DMS.

## 2. Chuẩn bị source và dependencies

Mở PowerShell tại root repository:

```powershell
cd D:\mirofish\dms-master-v3

py -3.11 -m venv DiQuaMuaHaa\backend\.venv
DiQuaMuaHaa\backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r DiQuaMuaHaa\backend\requirements.txt

# Tùy chọn: phone detector ONNX local.
python -m pip install -r DiQuaMuaHaa\backend\requirements-phone.txt

npm --prefix DiQuaMuaHaa\frontend\demothuattoanpro ci
```

`requirements-phone.txt` không bắt buộc khi `DISABLE_PHONE_YOLO=1`. Không cần cài
Ultralytics/PyTorch để dùng artifact `phone_yolo.onnx`. File `.pt` chỉ được phép load khi bật
chính sách trust và cấu hình SHA-256 đúng.

## 3. Cấu hình môi trường

```powershell
Copy-Item DiQuaMuaHaa\backend\.env.example DiQuaMuaHaa\backend\.env
Copy-Item DiQuaMuaHaa\frontend\demothuattoanpro\.env.example `
  DiQuaMuaHaa\frontend\demothuattoanpro\.env.local
```

Điền `backend/.env` cục bộ; file này đã được ignore. Không commit token, mật khẩu, bootstrap
secret hay database URL. Script `Start-DmsDevelopment.ps1` đọc `.env` mà không in giá trị.
Nếu chạy `python app.py` thủ công, backend **không tự đọc `.env`**; phải set biến trong phiên
PowerShell trước khi chạy.

Ví dụ MySQL local tối thiểu:

```dotenv
DB_BACKEND=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=diquamuaha
DMS_ADMIN_BOOTSTRAP_SECRET=<secret-dài-ngẫu-nhiên>
CORS_ALLOWED_ORIGINS=https://127.0.0.1:5173,https://localhost:5173
FRONTEND_URL=https://127.0.0.1:5173
```

PostgreSQL dùng `DB_BACKEND=postgres` và bắt buộc có `DATABASE_URL`. Telegram chỉ hoạt động
khi có cả `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` và webhook HTTPS được cấu hình đúng.

Frontend development nên để `VITE_API_BASE=` và `VITE_MEDICAL_API_BASE=`: Vite proxy DMS
qua `/api`, `/health`, `/socket.io`, và Medical qua `/api-medical`. Production bắt buộc
`VITE_API_BASE` là HTTPS origin hoặc `/` khi reverse proxy same-origin đã được cấu hình.

## 4. Database và migration

Tạo database rỗng bằng tài khoản chỉ có quyền trên database development:

```sql
CREATE DATABASE diquamuaha CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

DMS tạo các bảng base auth/identity/session theo nhu cầu. Hai migration bảo mật được version hóa
tại `backend/migrations/{mysql,postgres}` và phải chạy `V001` trước `V002`. Chỉ chạy trên database
đã backup và đã xác nhận đúng đích:

```powershell
cd DiQuaMuaHaa\backend

# MySQL/MariaDB development
Get-Content -Raw migrations\mysql\V001__verification_grants.up.sql |
  mysql -h 127.0.0.1 -u root -p diquamuaha
Get-Content -Raw migrations\mysql\V002__biometric_enrollment_privacy.up.sql |
  mysql -h 127.0.0.1 -u root -p diquamuaha

# PostgreSQL development
psql $env:DATABASE_URL -f migrations/postgres/V001__verification_grants.up.sql
psql $env:DATABASE_URL -f migrations/postgres/V002__biometric_enrollment_privacy.up.sql
```

Không tự động chạy file `.down.sql`. Rollback có thể xóa audit/grant data và cần phê duyệt riêng.

## 5. Model/runtime assets

| Artifact | Trạng thái trong Git | Runtime |
|---|---|---|
| `landmark_model.pkl` | có | landmark classifier, lazy-load |
| `hand_model.pkl` | có | hand classifier, lazy-load |
| `phone_yolo.onnx` | có | phone detection nếu cài ONNX Runtime |
| `smoking_model.pkl` | không có | trả `model_unavailable`, không giả kết quả |
| `road_yolo.pt` | không có | ADAS object detector `UNAVAILABLE`; lane OpenCV vẫn chạy |
| Medical `simple_image_model.pkl` + `class_names.pkl` | không có | Medical image inference trả 503 fail-closed |

`.pkl` có khả năng thực thi mã khi deserialize. Chỉ dùng artifact đã review/tin cậy. Không đổi tên
model, CSV dataset hay migration để “dọn repo”.

## 6. Khởi động khuyến nghị

Từ root repository:

```powershell
# Chỉ kiểm tra phiên bản, package, config và model path; không start/migrate/install.
powershell -ExecutionPolicy Bypass -File scripts\Start-DmsDevelopment.ps1 -CheckOnly

# DMS backend + frontend.
powershell -ExecutionPolicy Bypass -File scripts\Start-DmsDevelopment.ps1

# Thêm Medical API legacy nếu đã cấu hình MEDICAL_DATABASE_URL + JWT_SECRET_KEY.
powershell -ExecutionPolicy Bypass -File scripts\Start-DmsDevelopment.ps1 -IncludeMedical
```

Các process chạy ẩn, log và PID ở `.runtime/` (đã ignore):

- Frontend: `https://127.0.0.1:5173`
- DMS backend: `http://127.0.0.1:8000`
- Medical API tùy chọn: `http://127.0.0.1:5000`
- Health DMS: `http://127.0.0.1:8000/health`
- DB probe: `http://127.0.0.1:8000/api/ping-db`

Chứng chỉ Vite development là self-signed; trình duyệt có thể yêu cầu xác nhận lần đầu.

### Chạy thủ công

```powershell
# Terminal 1, sau khi đã set biến môi trường hoặc activate/import cấu hình riêng.
cd DiQuaMuaHaa\backend
python -B app.py

# Terminal 2, tùy chọn.
cd DiQuaMuaHaa\backend
python -B len.py

# Terminal 3.
cd DiQuaMuaHaa\frontend\demothuattoanpro
npm run dev -- --host 127.0.0.1
```

Trên Windows, DMS dùng Flask-Socket.IO `threading`; Linux/Render dùng Eventlet worker.

## 7. URL và luồng đăng nhập

| URL frontend | Chức năng |
|---|---|
| `/` | landing/register form ngoài DMS |
| `/dms/admin/enrollment` | admin tạo one-time Enrollment Code |
| `/test3` | DMS cockpit/webcam chính, protected |
| `/test4` | hand detection, protected |
| `/test5` | face enrollment/verify, protected |
| `/adas-simulation` | ADAS video-frame visualization, protected |
| `/demo/road-driving` | Integrated Cockpit S01–S20/live bridge/road-video |
| `/login`, `/admin`, `/spam`, `/test1`, `/test2` | Medical legacy surfaces |

Enrollment chuẩn:

1. Admin vào `/dms/admin/enrollment`, nhập `DMS_ADMIN_BOOTSTRAP_SECRET` và lấy admin session
   chỉ nằm trong memory của tab.
2. Admin cấp one-time code cho đúng Driver ID và chuyển code qua kênh tin cậy.
3. Driver vào `/test3`, `/test4`, `/test5` hoặc `/adas-simulation`; protected route gọi
   `/api/auth/me`. Nếu chưa có phiên, driver nhập Driver ID + code.
4. Face enrollment là bước riêng: cần challenge/grant server-approved. `REGISTERED` không đồng
   nghĩa `VERIFIED`.
5. Muốn bind owner Telegram, tạo bind code và nhắn `/bind <code>` cho bot.
6. Bắt đầu driving session cần challenge/grant đúng driver, auth session và purpose; grant chỉ
   dùng một lần.

Không đưa admin secret, bearer token, enrollment code hoặc Telegram token vào URL/Vite variable.

## 8. Tắt dịch vụ

```powershell
powershell -ExecutionPolicy Bypass -File scripts\Stop-DmsDevelopment.ps1
```

Script chỉ dừng PID do start script ghi lại và kiểm tra start time để tránh PID reuse. Nếu chạy
thủ công, dùng `Ctrl+C` trong từng terminal.

## 9. Verification commands

```powershell
cd DiQuaMuaHaa\frontend\demothuattoanpro
node --test tests/*.test.js
npm run lint
$env:VITE_API_BASE='/'; npm run build

cd ..\..\backend
python -B -m unittest discover -s tests -v
python -B -c "import app; print(app.socketio.async_mode)"
```

## 10. Troubleshooting

- `401 /api/auth/me`: bình thường khi chưa enrollment/không có bearer; không phải health failure.
- `/health` trả `503 degraded`: database chưa chạy/sai `DB_BACKEND` hoặc credential. Xem
  `database.available`, không coi model lazy `loaded:false` lúc startup là model hỏng.
- `model_unavailable`: kiểm tra đúng artifact, optional requirements và các cờ disable; không
  thay bằng kết quả “safe” giả.
- `DATABASE_URL is required`: đang chọn PostgreSQL nhưng chưa cấu hình URL.
- Vite HTTPS/cert: mở URL bằng browser và trust cert development; production phải dùng cert thật.
- Camera: chỉ hoạt động trên secure context và sau user gesture; kiểm tra Windows Privacy > Camera.
- Port 5173/8000/5000 bận: tắt instance cũ bằng stop script hoặc đổi cấu hình có chủ đích.
- `pip check` báo package ngoài DMS: tạo virtualenv mới, chỉ cài hai requirements của backend.
- Telegram không callback: kiểm tra webhook HTTPS, header secret, bot token và binding owner.
- Frontend build yêu cầu `VITE_API_BASE`: đặt HTTPS origin hoặc `/`; không dùng HTTP cho production.

## 11. Giới hạn xác minh hiện tại

Audit đã smoke-test process và HTTP shell, nhưng chưa chạy browser E2E, webcam thật, audio,
MediaRecorder, Telegram thật hoặc database production. Xem `PROJECT_STATUS.md` và
`SYSTEM_RUNTIME_FLOW.md` trước khi đưa ra claim production/safety.
