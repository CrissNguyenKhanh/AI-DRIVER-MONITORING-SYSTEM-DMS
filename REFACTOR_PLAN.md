# REFACTOR PLAN

## 1) Phan tich hien trang

### 1.1 Van de cau truc thu muc
- Du an dang ton tai nhieu diem vao (entry points) va cap thu muc trung lap:
  - `D:/DACN/package.json` (root) va `D:/DACN/DiQuaMuaHaa/frontend/demothuattoanpro/package.json` (app that su).
  - `D:/DACN/DiQuaMuaHaa/frontend/package.json` gan nhu placeholder.
  - Thu muc rong trung ten: `D:/DACN/DiQuaMuaHaa/DiQuaMuaHaa`.
- Frontend chua module hoa theo domain/feature, nhieu thu muc dat ten khong nhat quan:
  - Vi du: `systeamdetectface`, `hand-dection`, `testdata`, `User`, `admin`.
- Backend dang tron business logic, API route, db bootstrap, training script trong cac file rat lon.

### 1.2 File rac/deprecated/co nguy co bo hoang (can xac nhan truoc khi xoa)
- Thu muc rong: `D:/DACN/DiQuaMuaHaa/DiQuaMuaHaa`.
- Cac Python virtual env trung lap:
  - `D:/DACN/DiQuaMuaHaa/backend/venv`
  - `D:/DACN/DiQuaMuaHaa/backend/.venv`
- Nhom file co kha nang test/experimental dat lan voi production:
  - `D:/DACN/DiQuaMuaHaa/backend/quicktest.py`
  - `D:/DACN/DiQuaMuaHaa/backend/driver_training/collect/test_camp.py`
  - `D:/DACN/DiQuaMuaHaa/frontend/demothuattoanpro/src/User/test.jsx`
  - `D:/DACN/DiQuaMuaHaa/frontend/demothuattoanpro/src/testdata/thucmuctest.jsx`
- Root/frontend-level npm manifests co the la du thua:
  - `D:/DACN/package.json`, `D:/DACN/package-lock.json`
  - `D:/DACN/DiQuaMuaHaa/frontend/package.json`, `D:/DACN/DiQuaMuaHaa/frontend/package-lock.json`

### 1.3 File qua lon, vi pham Single Responsibility (uu tien tach)
- Frontend:
  - `.../src/testdata/thucmuctest.jsx` (~4321 dong)
  - `.../src/systeamdetectface/OtoLiveMapPanel.jsx` (~4366 dong)
  - `.../src/systeamdetectface/face_detect.jsx` (~1385 dong)
  - `.../src/User/test.jsx` (~730 dong)
  - `.../src/User/vippoint.jsx` (~662 dong)
  - `.../src/hand-dection/dectionhand.jsx` (~597 dong)
  - `.../src/chat/DoctorChatbot.jsx` (~464 dong)
- Backend:
  - `D:/DACN/DiQuaMuaHaa/backend/data/api/api.py` (~2473 dong)
  - `D:/DACN/DiQuaMuaHaa/backend/len.py` (~1023 dong)
  - `D:/DACN/DiQuaMuaHaa/backend/data/database.py` (~484 dong)


## 2) Cau truc muc tieu (module hoa, de bao tri)

> Muc tieu: giu nguyen business logic hien tai, chi tai cau truc + tach trach nhiem.

### 2.1 Frontend (React + Vite)
```text
DiQuaMuaHaa/frontend/demothuattoanpro/
  src/
    app/
      App.jsx
      main.jsx
      routes/
    features/
      dms/
        components/
        hooks/
        services/
        utils/
        index.js
      maps/
        components/
        hooks/
        services/
      gestures/
        components/
        hooks/
        services/
      chat/
        components/
        hooks/
        services/
      user/
        components/
        hooks/
        services/
      admin/
        components/
        hooks/
        services/
    shared/
      components/
      hooks/
      utils/
      constants/
      types/
      services/
    assets/
      images/
      icons/
      audio/
    styles/
      globals.css
```

### 2.2 Backend (Flask)
```text
DiQuaMuaHaa/backend/
  src/
    app/
      __init__.py            # app factory
      config.py
      extensions.py
    api/
      routes/
        auth.py
        users.py
        records.py
        prediction.py
      schemas/
    domain/
      auth/
      users/
      records/
      prediction/
      training/
    repositories/
      user_repository.py
      record_repository.py
    services/
      prediction_service.py
      telegram_service.py
      model_service.py
    models/
      user.py
      record.py
    utils/
      validators.py
      decorators.py
  scripts/
    collect/
    train/
    detect/
  tests/
  run.py
  requirements.txt
```


## 3) Lo trinh thuc hien (Roadmap)

### Giai doan A - Don dep
- [x] A1. Tao danh sach file/folder nghi ngo rac va kiem tra reference (import/usages) toan repo.
- [x] A2. Danh dau muc "safe to delete" va "need confirmation".
- [x] A3. Xin xac nhan thu cong truoc khi xoa bat ky file/folder nao.
- [x] A4. Xoa tung nhom nho, sau moi nhom chay build/test toi thieu de dam bao an toan.
- [x] A5. Cap nhat `.gitignore` neu can (venv, artefacts, temp outputs).

### Giai doan B - Tai cau truc thu muc
- [x] B1. Chuan hoa naming conventions (feature-based, lowercase/kebab-case cho folder).
- [x] B2. Tao khung thu muc moi (`features`, `shared`, `assets`, `styles` cho frontend; `src/app|api|domain|services|repositories` cho backend).
- [x] B3. Move file theo feature/domain, uu tien file nho truoc.
- [x] B4. Sua import/export theo tung cum thay doi (khong move 1 lan qua lon).
- [x] B5. Sau moi cum move: run lint + build (frontend), run app smoke test (backend).

Tien do B3/B4 (theo batch nho):
- [x] Batch 1 (Frontend leaf nodes): move CSS vao `src/styles`, move `config/apiEndpoints.js` + `utils/*` vao `src/shared/*`, update import lien quan.
- [x] Batch 2 (Frontend feature modules): move `systeamdetectface|hand-dection|User|admin|chat` vao `src/features/*/components`, move `App.jsx` vao `src/app/App.jsx`, update import lien quan, xoa folder cu rong.
- [x] Batch 3 (Frontend auth + Backend leaf/config): move `Login|verify` vao `src/features/auth/components`; move `data/database.py` -> `src/app/database.py`; move `data/patient_data.py` -> `src/utils/patient_data.py`; move cac script doc lap trong `driver_training/collect|train` vao `scripts/collect|train`; cap nhat import frontend lien quan.
- [x] Batch 4 (Backend core): move `data/api/api.py` -> `src/api/routes/api.py`, move `len.py` -> `src/services/len.py`, cap nhat import entrypoint `app.py`, dieu chinh duong dan model path trong `api.py`, xoa `backend/data` rong.

### Giai doan C - Tach file logic lon ✅ HOAN TAT 100%
- [x] C1. Chon 2-3 file rat lon de tach dot 1 (uu tien `thucmuctest.jsx`, `OtoLiveMapPanel.jsx`, `api.py`).
- [x] C2. Tach theo layer: UI / hooks / services / utils / constants / types.
- [x] C3. Tao facade file giu API cu (re-export) de giam break changes.
- [x] C4. Chay regression test/manual smoke test sau moi file tach.
- [x] C5. Lap lai theo dot nho den khi file lon duoi nguong quy dinh.

**Ket qua Phase C:**
- File `thucmuctest.jsx` da duyệt refactor hoàn chỉnh: từ ~2560 dòng giảm xuống ~237 dòng (90% reduction)
- Đã di chuyển vào vị trí chuẩn: `src/features/dms/components/DriverMonitorDMS.page.jsx`
- Route chuẩn: `/dms` thay cho `/test3`
- Cấu trúc module DMS hiện tại:
  - `hooks/useDriverMonitorDMS.hook.js` - Master hook
  - `hooks/useDmsSocketStreams.hook.js`, `useMediaPipeEngines.hook.js`, `useDrivingSession.hook.js`, `useDmsAlerts.hook.js`, `useIdentityGate.hook.js` - Sub-hooks
  - `components/layout/DmsLeftPanel.jsx`, `DmsCameraStage.jsx`, `DmsHudPanel.jsx`, `DmsBottomBar.jsx` - Layout components
  - `components/DriverMonitorDMS.page.jsx` - Page component
  - `components/overlays/*`, `components/telemetry/*` - UI sub-components
  - `constants/`, `utils/`, `services/`, `styles/` - Supporting modules
- App.jsx đã được dọn dẹp, xóa route rác (`/test1`, `/test2`, `/test4`, `/test5`, `/spam`)
- Thư mục `src/testdata/` đã bị xóa

Tien do C (theo batch nho):
- [x] C-Batch 1: Phan tich + lap blueprint tach `src/testdata/thucmuctest.jsx` (chua code).
- [x] C-Batch 2: Tach nhom Pure Utils/Constants/Services/Styles cho `thucmuctest.jsx` va noi import nguoc de giu hanh vi.
- [x] C-Batch 3: Tach nhom Overlay & Telemetry components ra file rieng va noi import lai vao `thucmuctest.jsx`.
- [x] C-Batch 4: Tach nhom Orchestration Hooks (socket streams, mediapipe engines, driving session, dms alerts, identity gate) ra cac custom hooks va noi call lai tu `thucmuctest.jsx`.
- [x] C-Batch 5: Tach Master Hook (`useDriverMonitorDMS.hook.js`) orchestrating 5 sub-hooks, va tach UI Layout Blocks (`DmsLeftPanel`, `DmsCameraStage`, `DmsHudPanel`, `DmsBottomBar`). File `thucmuctest.jsx` giam tu ~2500 dong xuong ~237 dong. Build + lint pass.
- [x] C-Batch 6: Chot so Phase C - Di chuyen file vao vi tri chuan (`DriverMonitorDMS.page.jsx`), cap nhat route `/dms`, xoa route rac va thu muc `testdata/`.

### Giai doan D - Khoa chat chat luong ✅ HOAN TAT (D2, D3 skipped)
- [x] D1. Them/chuẩn hoa lint rules cho max-lines (300) va complexity (10).
- [~] D2. Them script check nhanh (`npm run lint`, `npm run build`, backend startup check). **[Skipped]**
- [~] D3. Them Husky pre-commit hooks voi lint-staged. **[Skipped]**
- [ ] D4. CI/CD pipeline co ban (GitHub Actions).
- [ ] D5. Cap nhat tai lieu cau truc va huong dan onboarding.


## 4) Nguyen tac tach file

### 4.1 Nguong bat buoc tach
- Frontend component/page:
  - > 300 dong: can lap ke hoach tach.
  - > 450 dong: bat buoc tach ngay.
- Backend route/service:
  - > 250 dong: can lap ke hoach tach.
  - > 400 dong: bat buoc tach ngay.
- Ham:
  - > 60-80 dong hoac > 3 muc trach nhiem ro rang thi tach.

### 4.2 Mau dat ten file sau khi tach
- `FeatureName.ui.tsx`: presentation layer (JSX/UI thuần).
- `FeatureName.logic.ts`: orchestration/business flow.
- `FeatureName.hook.ts`: custom hooks.
- `FeatureName.service.ts`: goi API/external service.
- `FeatureName.utils.ts`: helper functions thuần.
- `FeatureName.constants.ts`: constants/config static.
- `FeatureName.types.ts`: types/interfaces.
- Backend Python:
  - `*_routes.py`, `*_service.py`, `*_repository.py`, `*_model.py`, `*_schema.py`.

### 4.3 Nguyen tac bat bien
- Khong doi hanh vi business logic (chi doi vi tri + chia nho).
- Moi lan tach phai giu nguyen contract import/export tu ben ngoai neu co the.
- Moi PR/commit refactor nho, de review va rollback de dang.


## 5) Huong dan cho AI tiep theo (handover ngan)

### Trang thai HIEN TAI: ✅ PHASE C HOAN TAT 100%

**C-Batch 6 (Chot so Phase C & Don dep Route) - Vua hoan thanh:**
- Di chuyen `src/testdata/thucmuctest.jsx` → `src/features/dms/components/DriverMonitorDMS.page.jsx`
- Cap nhat `App.jsx` voi route `/dms` thay cho `/test3`
- Xoa route rac: `/test1`, `/test2`, `/test4`, `/test5`, `/spam`
- Xoa thu muc `src/testdata/` (da trong)

**Ket qua toan bo Phase C:**
- File `DriverMonitorDMS.page.jsx` (nguyen `thucmuctest.jsx`): ~237 dong (giam 90%)
- Kien truc module hoa hoan chinh theo feature-based structure
- Routes sach se, chuyen nghiep: `/dms`, `/admin`, `/verify`, `/driver-registration`, `/`

**BUG FIX (18/04/2026):**
- Khôi phục route đăng ký khuôn mặt `/driver-registration` (component `FaceDetect`)
- Route cũ `/test5` đã bị xóa nhầm trong C-Batch 6, nay đã khôi phục với tên chuyên nghiệp hơn

### Tien do TIEP THEO: 🚀 PHASE D - KHOA CHAT CHAT LUONG

**Muc tieu Phase D:**
- D1. Them/chuan hoa ESLint rules (max-lines: 300, complexity: 10)
- D2. Them script kiem tra nhanh: `npm run lint`, `npm run build`, `npm run test`
- D3. Them Husky pre-commit hooks
- D4. CI/CD pipeline co ban (GitHub Actions hoac tuong duong)
- D5. Cap nhat tai lieu onboarding cho dev moi

**De xuat thu tu thuc hien:**
1. Them ESLint config voi rules chat che hon
2. Chay lint --fix de auto-fix cac van de nho
3. Them pre-commit hook (Husky + lint-staged)
4. Viet lai README.md mo ta kien truc moi
5. Them script test smoke cho backend

**Luu y quan trong:**
- Phase D khong them tinh nang moi, chi tap trung chat luong code va quy trinh
- Moi thay doi can dam bao build pass truoc khi commit
- Neu co loi lint khong fix duoc, ghi chu lai de xu ly sau

**📝 HANDOVER CONTEXT:**
- Phase D kết thúc với D1 hoàn thành (ESLint rules)
- D2 (script check nhanh) và D3 (Husky hooks) đã **BỊ BỎ QUA** theo yêu cầu để tiết kiệm thời gian
- D4, D5 vẫn còn pending (CI/CD, tài liệu) - có thể thực hiện sau nếu cần
- **CHUYỂN SANG PHASE E: TÁI CẤU TRÚC BACKEND**

---

## 6) Phase E: Tái cấu trúc Backend (Đang lập Blueprint)

**Mục tiêu:** Tách file `backend/src/api/routes/api.py` (2474 dòng) thành kiến trúc module chuẩn.

**File cần refactor:** `backend/src/api/routes/api.py` (~2474 dòng)

**Kiến trúc đích:** Layered Architecture (Routes → Services → Repositories → Models)

**Cấu trúc thư mục mục tiêu:**
```text
backend/src/
├── api/
│   ├── __init__.py
│   ├── routes/                    # Controllers (chỉ xử lý HTTP)
│   │   ├── __init__.py
│   │   ├── dms_routes.py         # Routes chính /api/landmark/*, /api/hand/*
│   │   ├── identity_routes.py    # Routes /api/identity/*
│   │   ├── smoking_routes.py     # Routes /api/smoking/*
│   │   ├── phone_routes.py       # Routes /api/phone/* + WebSocket phone
│   │   └── system_routes.py      # Routes /, /api/ping-db
│   └── websocket/                 # WebSocket handlers riêng biệt
│       ├── __init__.py
│       └── dms_websocket.py      # Socket.IO event handlers
├── services/                      # Business Logic Layer
│   ├── __init__.py
│   ├── model_loader_service.py   # Load model (.pkl, .pt)
│   ├── prediction_service.py     # Landmark, hand, smoking prediction
│   ├── identity_service.py       # Face embedding, verification, registration
│   ├── telegram_service.py       # Telegram bot integration
│   └── driving_session_service.py # Quản lý phiên lái xe
├── repositories/                # Data Access Layer
│   ├── __init__.py
│   ├── database.py               # Kết nối MySQL/Postgres
│   ├── identity_repository.py    # CRUD driver_identity, driver_telegram_owner
│   └── driving_session_repository.py # CRUD driving_sessions
├── models/                      # Schemas/Entities
│   ├── __init__.py
│   └── schemas.py                # Pydantic/Type hints schemas
├── core/                        # Core config & utils
│   ├── __init__.py
│   ├── config.py                 # Environment variables, constants
│   └── exceptions.py             # Custom exceptions
└── utils/                       # Pure utilities
    ├── __init__.py
    ├── image_processing.py       # Face mesh, hand landmarks
    ├── embeddings.py             # Cosine similarity, normalize
    └── validators.py             # Input validation
```

### E-Batch 1: Phân tích & Blueprint ✅ ĐANG THỰC HIỆN

**Phân tích api.py hiện tại:**

| Phân vùng | Dòng | Chức năng | Tách vào |
|-----------|------|-----------|----------|
| **Config & Constants** | 1-90 | Flask app, CORS, DB config, model paths, Telegram config | `core/config.py` |
| **Database Connection** | 115-121 | get_mysql_conn(), PostgreSQL fallback | `repositories/database.py` |
| **Database Schema** | 123-195 | CREATE TABLE driver_identity, driver_telegram_owner, driving_sessions | `repositories/identity_repository.py`, `repositories/driving_session_repository.py` |
| **Model Loading** | 290-450 | load_model(), load_hand_model(), load_smoking_model(), load_phone_model(), load_phone_yolo_model() | `services/model_loader_service.py` |
| **Telegram Integration** | 201-265 | _telegram_call(), _telegram_send_decision_message(), _telegram_answer_callback() | `services/telegram_service.py` |
| **Image Processing** | 457-625 | _ensure_face_mesh_loaded(), _ensure_models_loaded(), _image_base64_to_landmarks(), _image_base64_to_hand_landmarks() | `utils/image_processing.py` |
| **Embeddings & Math** | 627-715 | _cosine_similarity(), _normalize_face_embedding(), _get_face_embedding_from_image() | `utils/embeddings.py` |
| **Identity Logic** | 1234-1450 | /api/identity/register, verify, driver_profile, request_decision, decision_status | `api/routes/identity_routes.py` + `services/identity_service.py` |
| **Prediction Routes** | 775-948 | /api/landmark/predict, predict_from_frame | `api/routes/dms_routes.py` |
| **Smoking Routes** | 956-1050 | /api/smoking/predict_from_frame | `api/routes/smoking_routes.py` |
| **Hand Routes** | 1058-1150 | /api/hand/predict_from_frame | `api/routes/dms_routes.py` |
| **Phone Routes** | 2300-2400 | WebSocket phone_frame, smoking_frame | `api/websocket/dms_websocket.py` + `api/routes/phone_routes.py` |
| **System Routes** | 719-757 | /, /api/ping-db | `api/routes/system_routes.py` |

**Nguyên tắc tách:**
1. **Routes** chỉ xử lý HTTP (request/response), parse JSON, trả kết quả
2. **Services** chứa business logic (predict, verify, gửi Telegram)
3. **Repositories** chỉ làm việc với database (SQL)
4. **Utils** là pure functions (image processing, math)
5. **Core** chứa config, constants, exceptions

**🚦 TRẠNG THÁI E-BATCH 1: ✅ HOÀN TẤT (Blueprint đã duyệt)**
- ✅ Đã phân tích api.py (2474 dòng)
- ✅ Đã lập cấu trúc thư mục đích
- ✅ Đã phân chia chức năng vào từng layer
- ✅ Blueprint đã được duyệt

**🚦 TRẠNG THÁI E-BATCH 2: ✅ HOÀN TẤT (Tách lớp đáy)**
- ✅ Đã tạo thư mục: `backend/src/core`, `repositories`, `utils`, `services`
- ✅ Đã tạo `core/config.py`: Chứa Flask app, CORS, env vars, constants
- ✅ Đã tạo `core/exceptions.py`: Custom exceptions
- ✅ Đã tạo `repositories/database.py`: Database connection, DRIVING_ALERT_TYPES
- ✅ Đã tạo `repositories/identity_repository.py`: CRUD driver_identity, telegram_owner, decision_requests
- ✅ Đã tạo `repositories/driving_session_repository.py`: CRUD driving_sessions, alerts
- ✅ Đã tạo `utils/image_processing.py`: Face mesh, hand landmarks, image preprocessing
- ✅ Đã tạo `utils/embeddings.py`: Cosine similarity, normalize embedding
- ✅ Đã tạo `services/model_loader_service.py` (placeholder): Load .pkl models
- ✅ Đã thêm imports mới vào `api.py`
- ✅ **Test cú pháp PASS**: `python -m py_compile src/api/routes/api.py`

**⏳ E-BATCH 3: Tách Services & Routes (tiếp theo)**
- Tạo `services/prediction_service.py`, `identity_service.py`, `telegram_service.py`
- Tạo `api/routes/*.py` (dms_routes, identity_routes, smoking_routes, phone_routes, system_routes)
- Chuyển endpoints từ `api.py` sang các route mới
- Code cũ trong `api.py` sẽ được thay thế hoàn toàn ở batch này
