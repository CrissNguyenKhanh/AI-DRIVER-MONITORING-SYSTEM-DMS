# Test Report — Integrated Cockpit V2

Ngày chạy: 2026-11-07  
Môi trường: Windows, Node.js 22.16.0, Python 3.11 virtual environment hiện có.  
Base: `3069424`; feature head trước docs: `ede026a`.

## Kết quả

| Gate | Lệnh | Kết quả |
|---|---|---|
| Frontend regression + V2 | `node --test tests/*.test.js` | PASS — 58/58, 0 fail. |
| Backend regression | `python -B -m unittest discover -s tests -v` | PASS — 58/58, 0 fail, 6.067 s. |
| V2 scoped lint | `npx eslint <V2 source + V2 tests>` | PASS — 0 error/warning. |
| Production build | `$env:VITE_API_BASE='/'; npm run build` | PASS — 2323 modules, 2.31 s. |
| Diff whitespace | `git diff --check` | PASS; chỉ có cảnh báo line-ending LF/CRLF của Git. |
| Secret scan | Regex scan source/test V2 | PASS; không có token/key/password thật. |
| Browser E2E | Computer Use + browser provider | NOT VERIFIED — native pipe unavailable và không có browser provider. |

## Global lint

`npm run lint` là FAIL: 39 errors và 17 warnings trong các surface legacy như medical UI, voice, face/hand components và file DMS lớn hiện có. Không sửa lan sang code ngoài phạm vi V2. Các file/module V2 mới và thay đổi trực tiếp (trừ legacy `thucmuctest.jsx` vốn đã có baseline lint debt) đã pass scoped lint.

Không gọi global lint là PASS.

## Test coverage V2

- Event schema validation, duplicate/stale/out-of-order rejection.
- Alert priority, critical preemption, reset, recovery, UNKNOWN unavailable.
- Audio user unlock và tone pattern bằng fake Web Audio context.
- DMS mapping NORMAL/DISTRACTED/DROWSY/HIGH_RISK/UNKNOWN.
- Camera disconnect/API timeout/stale result/session isolation.
- Phone transition deduplication, không spam theo frame.
- Road hazard/braking transition event.
- Timeline bound/dedup và safe report provenance.
- S11-S20 expected flow, zero virtual collision và no production output.
- Regression S01-S10, physics bounds, lane clearance, abort, no teleport, no blind maneuver.
- Camera lifecycle, ADAS scheduler, auth/config tests hiện có.

## Build warnings và performance

- Build cảnh báo `caniuse-lite`/baseline-browser-mapping cũ; không ảnh hưởng pass.
- Main bundle khoảng 1,570.28 kB (gzip 439.82 kB), vượt warning 500 kB của bundler.
- Lazy RoadDrivingDemo chunk khoảng 77.59 kB (gzip 25.66 kB), CSS 17.21 kB (gzip 4.39 kB).
- Không có browser instrumentation nên FPS/frame-time/GPU memory là `NOT MEASURED`; không tạo số đo giả.

## Visual/manual validation

Source/build xác minh được lifecycle và render compilation, nhưng không có browser để xác nhận bằng mắt:

- S20 HUD xuất hiện đúng thời điểm: NOT VERIFIED.
- Audio autoplay gate/user gesture trên browser thật: NOT VERIFIED.
- Three.js visual/camera clipping: NOT VERIFIED.
- MediaRecorder download/cleanup trên browser thật: NOT VERIFIED.
- Console runtime errors khi route navigation: NOT VERIFIED.

Các mục này là gate thủ công còn lại trước khi có thể gọi browser experience hoàn tất 100%.

