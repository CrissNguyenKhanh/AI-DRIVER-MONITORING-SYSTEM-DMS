# Scenario Catalog S01-S20

Seed validation: `20261105`. Tất cả scenario kết thúc với `virtual collision count = 0` trong test tự động ngày 2026-11-07.

| ID | Nội dung | Kết quả đã xác minh |
|---|---|---|
| S01 | Lái bình thường, đường trống | Giữ làn giữa, không maneuver. |
| S02 | Mất tập trung, không vật cản | Cảnh báo, không tự đánh lái. |
| S03 | Mất tập trung + vật cản | Phanh, chuyển trái, vượt, về làn. |
| S04 | Buồn ngủ + vật cản | Phanh, chuyển phải, vượt, về làn. |
| S05 | Hai bên bị chặn | Dừng ảo, không va chạm. |
| S06 | Vật cản xuất hiện trong làn đích | Hủy chuyển làn liên tục, về làn nguồn, dừng. |
| S07 | Perception UNKNOWN | Giảm về tốc độ unknown, không chuyển làn mù. |
| S08 | Tài xế phục hồi giữa maneuver | Maneuver kết thúc nhất quán, không teleport. |
| S09 | Nhiều vật cản động/tĩnh | Tránh làn trái bị chiếm, dùng làn phải. |
| S10 | Offline local session | Timeline local, protected workflow BLOCKED, safe stop. |
| S11 | Điện thoại + vật cản | Phone event, DISTRACTED, phanh/chuyển trái. |
| S12 | DROWSY tăng lên HIGH_RISK | Tăng cấp cảnh báo, giữ làn khi không có road hazard. |
| S13 | Xe động cắt vào làn đích | Re-evaluate, abort, về làn giữa, dừng. |
| S14 | Vật cản liên tiếp | Nhiều lần chọn corridor ổn định, không va chạm. |
| S15 | Phục hồi sau cảnh báo | Trở lại NORMAL, không maneuver không cần thiết. |
| S16 | Sensor/model unavailable | UNKNOWN, controlled slowdown, không chuyển làn. |
| S17 | Vật cản rủi ro thấp | Giữ làn, không phanh/né không cần thiết. |
| S18 | Vật cản critical + hai bên chặn | Bounded braking, safe stop. |
| S19 | Mất camera giữa hành trình | UNKNOWN giữa trip, giảm tốc, không chuyển làn. |
| S20 | Full presentation showcase | NORMAL → DISTRACTED → warning/hazard → brake → left lane → pass/recover → NORMAL → report. |

## S20 timeline trình diễn

1. Chọn S20 và nhấn `Chạy`.
2. Xe bắt đầu ở NORMAL trên đường cong procedural.
3. Tại 2.2 s, DMS scripted chuyển sang DISTRACTED.
4. HUD và audio (nếu người dùng đã bật) phát cảnh báo từ normalized event.
5. Vật cản đi vào virtual hazard range và được tô risk zone.
6. Planner kiểm tra trái/phải; làn phải bị giới hạn, làn trái hợp lệ.
7. Xe phanh trước, bật xi-nhan, hiển thị trajectory, chuyển trái liên tục.
8. Xe vượt vật cản và trở về làn nguồn.
9. Tại 13.5 s tài xế về NORMAL; cảnh báo driver được recovery/acknowledge.
10. Tại 20 s kịch bản complete và sinh report/export.

Các mốc là thời gian mô phỏng monotonic, không phụ thuộc đồng hồ hệ thống. Playback 0.5×/1×/2×/4× chỉ thay đổi tốc độ trình diễn, không thay đổi kết quả deterministic.

