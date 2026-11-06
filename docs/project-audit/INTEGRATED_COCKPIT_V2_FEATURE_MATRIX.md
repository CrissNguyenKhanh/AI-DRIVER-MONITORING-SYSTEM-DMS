# Feature Matrix — Integrated Cockpit V2

Ngày: 2026-11-07

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Route `/demo/road-driving` | IMPLEMENTED | Route cũ được giữ, component nâng cấp tại chỗ. |
| Offline deterministic demo | IMPLEMENTED | S01-S20, seed cố định, fixed-step, không cần backend. |
| Normalized event contract | IMPLEMENTED | Guard malformed/duplicate/stale/out-of-order; không bịa confidence. |
| Visual warning P0 | IMPLEMENTED | Priority HUD cho INFO/CAUTION/WARNING/CRITICAL/UNAVAILABLE. |
| Audio alert | IMPLEMENTED, BROWSER NOT VERIFIED | Web Audio + optional `speechSynthesis`, unlock bằng user gesture, cooldown/cleanup; unit test pass. |
| Virtual braking/lane change/stop | IMPLEMENTED | Engine regression + S11-S20 pass, `productionControlOutput: null`. |
| No blind maneuver on UNKNOWN | IMPLEMENTED | S07/S16/S19 và engine test pass. |
| 3D road quality | IMPLEMENTED, VISUAL NOT VERIFIED | Asphalt segmented, curve S20, shoulder, barrier, streetlight, sign, mountain/tree, fog/light/shadow. |
| Ego vehicle feedback | IMPLEMENTED | Wheel motion, brake lights, turn indicators, trajectory, risk zone. |
| Traffic variants | IMPLEMENTED | Sedan/compact/van procedural, dynamic wheel motion, physics-synchronized positions. |
| Camera modes | IMPLEMENTED | Chase, driver, rear, cinematic; lerp transition. |
| Live DMS input | PARTIAL | Actual `/test3` DMS metrics bridge hoạt động khi DMS tab/backend chạy; cockpit không nhân đôi webcam. Browser integration chưa xác minh. |
| Embedded webcam preview | NOT IMPLEMENTED | Cockpit hiển thị ownership/consent placeholder và mở `/test3` ở tab riêng để tránh duplicate camera tracks. |
| Phone integration | IMPLEMENTED/PARTIAL | Offline S11 và live phone transition được chuẩn hóa; phụ thuộc phone model hiện có của DMS. |
| Hand gesture integration | UNAVAILABLE | Không bịa model/artifact hoặc action. |
| Smoking integration | UNAVAILABLE | Backend baseline cố ý trả unavailable khi artifact chưa được xác minh. |
| Face status | PARTIAL | Hiển thị experimental/not-auth; không cấp quyền phiên. |
| Local road video | IMPLEMENTED | Chọn MP4/WebM, phát song song, giữ image-space/virtual-world tách biệt. |
| Lane/object overlay trong cockpit | PARTIAL | Surface `/adas-simulation` được giữ và link; cockpit không copy pipeline hoặc bịa object detection. |
| Timeline chuẩn hóa | IMPLEMENTED | Bounded 500, provenance/source mode/decision/response. |
| End-of-trip report | IMPLEMENTED | Counter tách warning/critical/brake/lane/stop/collision, provenance rõ. |
| JSON/CSV/print export | IMPLEMENTED | Không chứa ảnh biometric/token/credential. |
| Canvas recording | IMPLEMENTED, BROWSER NOT VERIFIED | Scene ảo + driver/risk/warning/decision/watermark; không webcam/mic. |
| System health panel | IMPLEMENTED | READY/RUNNING/DEGRADED/UNAVAILABLE/BLOCKED; không fake green. |
| Protected real session | BLOCKED | Thiếu PR B server verification grant; không bypass. |
| Secure enrollment PR C | BLOCKED | Phụ thuộc PR B/C chưa có trên verified main. |
| Real vehicle control | OUT OF SCOPE / PROHIBITED | Không CAN/actuator/autonomous-driving claim. |

## Definition of Done thực tế

P0/P1/P2 độc lập với protected workflow đã được triển khai và test tự động. “Browser visual/audio/recording E2E” chưa được xác minh vì môi trường không cung cấp native UI pipe hoặc browser provider; do đó không báo 100% hoàn tất.

