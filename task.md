# DMS Refactor Progress

## Trạng thái hiện tại
- Giai đoạn: 1 - Dọn rác (Bước 1.3 - Đã hoàn tất xóa file)
- File đang làm: Hoàn tất xóa file theo phê duyệt
- Bước đang thực hiện: Cập nhật task.md, chờ lệnh commit và chuyển Giai đoạn 2
- Chờ xác nhận từ user: Chờ lệnh commit git và bước sang Giai đoạn 2

## Giai đoạn 1 - Danh sách đã dọn
- [x] Xóa: DiQuaMuaHaa/backend/len.py (lý do: Medical Diagnosis API - không thuộc DMS)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/khanhku.jsx (lý do: MedicalDiagnosisAI component)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/vippoint.jsx (lý do: MedicalRecordConfirmation component)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/test.jsx (lý do: MedicalDiagnosisAI component)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/User/endhaintstatics.jsx (lý do: EnhancedPatientStatistics)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/admin/PatientStatistics.jsx (lý do: PatientStatistics dashboard)
- [x] Xóa: Hàm getMedicalApiBase() trong apiEndpoints.js (lý do: config cho medical API port 5000)
- [x] Xóa: DiQuaMuaHaa/frontend/demothuattoanpro/src/chat/DoctorChatbot.jsx (lý do: Chatbot bác sĩ - medical domain)
- [x] Xóa: DiQuaMuaHaa/backend/data/__pycache__/ (lý do: Cache bytecode Python)
- [x] Xóa: DiQuaMuaHaa/backend/data/api/__pycache__/ (lý do: Cache bytecode Python)
- [x] Xóa: DiQuaMuaHaa/backend/driver_training/collect/test_camp.py (lý do: File test camera tạm)
- [ ] Giữ lại: DiQuaMuaHaa/backend/phone_data.csv (lý do: Chưa xác định rõ, tạm giữ)
- [ ] Giữ lại: DiQuaMuaHaa/backend/quicktest.py (lý do: Tool test webcam cho DMS training)

### Kết quả Audit - Nhóm A (Code không thuộc DMS - Medical/Y tế)
| # | File/Đoạn code | Nhóm | Lý do xác định là rác | Đề xuất |
|---|---|---|---|---|
| 1 | DiQuaMuaHaa/backend/len.py | A | Toàn bộ file là Medical Diagnosis API (chẩn đoán bệnh, triệu chứng, bệnh nhân, bệnh án). Database: medical_diagnosis | Xóa |
| 2 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/khanhku.jsx | A | MedicalDiagnosisAI component - chẩn đoán triệu chứng & hình ảnh y tế, dùng getMedicalApiBase | Xóa |
| 3 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/vippoint.jsx | A | MedicalRecordConfirmation - xác nhận chẩn đoán y tế, dùng getMedicalApiBase | Xóa |
| 4 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/test.jsx | A | MedicalDiagnosisAI component - chẩn đoán triệu chứng, dùng getMedicalApiBase | Xóa |
| 5 | DiQuaMuaHaa/frontend/demothuattoanpro/src/User/endhaintstatics.jsx | A | EnhancedPatientStatistics - thống kê bệnh nhân, dùng getMedicalApiBase | Xóa |
| 6 | DiQuaMuaHaa/frontend/demothuattoanpro/src/admin/PatientStatistics.jsx | A | PatientStatistics dashboard - thống kê bệnh nhân admin, dùng getMedicalApiBase | Xóa |
| 7 | DiQuaMuaHaa/frontend/demothuattoanpro/src/config/apiEndpoints.js (dòng 26-44) | A | Hàm getMedicalApiBase() - config cho medical API port 5000 | Xóa function |
| 8 | DiQuaMuaHaa/frontend/demothuattoanpro/src/chat/DoctorChatbot.jsx | A | Chatbot bác sĩ - domain medical | Cần xác nhận |

### Kết quả Audit - Nhóm B (Code thừa kỹ thuật)
| # | File/Đoạn code | Nhóm | Lý do xác định là rác | Đề xuất |
|---|---|---|---|---|
| 9 | DiQuaMuaHaa/backend/data/__pycache__/ | B | Cache bytecode Python | Xóa |
| 10 | DiQuaMuaHaa/backend/data/api/__pycache__/ | B | Cache bytecode Python | Xóa |
| 11 | DiQuaMuaHaa/backend/driver_training/collect/test_camp.py | B | File test camera tạm (test_cam.py đổi tên), không liên quan DMS logic | Xóa |

### Cần xác nhận thêm
| # | File/Đoạn code | Lý do |
|---|---|---|
| 12 | DiQuaMuaHaa/backend/phone_data.csv | File CSV gần như trống (26 bytes), không rõ có dùng không |
| 13 | DiQuaMuaHaa/backend/quicktest.py | File test live webcam, nhưng có vẻ là tool hỗ trợ DMS training - cần xác nhận có giữ lại không |

## Giai đoạn 2 - Tiến độ tái cấu trúc
- [ ] Chưa bắt đầu - chờ hoàn tất Giai đoạn 1

## Ghi chú / Rủi ro
- Project có code liên quan medical/y tế cần tách bỏ
- Cần kiểm tra cẩn thận để không xóa nhầm code DMS thật sự

## Lịch sử thay đổi
- [2025-05-09] Session 1: Khởi động session, tạo task.md, bắt đầu Giai đoạn 1 - Audit toàn dự án
- [2025-05-09] Session 1 (tiếp): Hoàn tất Giai đoạn 1.3 - Đã xóa 11 file/thư mục theo phê duyệt (Nhóm A + Nhóm B + DoctorChatbot.jsx), cập nhật task.md, chờ lệnh git commit để sang Giai đoạn 2
