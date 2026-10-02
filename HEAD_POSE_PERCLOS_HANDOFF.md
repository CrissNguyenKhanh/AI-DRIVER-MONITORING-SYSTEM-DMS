# Head Pose + PERCLOS Handoff

## Repository

`https://github.com/CrissNguyenKhanh/AI-DRIVER-MONITORING-SYSTEM-DMS`

## Current Branch

`feature/head-pose-perclos`

## Base Commit

`9ad81da` (`main` and `origin/main`, ADAS PR #9 merged)

## Current Goal

Add timestamp-based PERCLOS, prolonged-eye-closure, landmark-based head pose,
temporal distraction, attention state, compact DMS visualization, and debounced
alert/session integration without changing ADAS or existing DMS detectors.

## Completed

- Git preflight passed.
- Confirmed clean `main` matched `origin/main` at `9ad81da`.
- Confirmed merged ADAS commits `3d32d8a`, `4f90f5b`, `6df544a`, `eb88a84`.
- Created this feature branch and the single required handoff file.
- Completed the bounded audit of the FaceMesh callback, camera lifecycle, alert audio,
  driving-session logging, landmark API, auth boundary, and existing test layout.
- Added isolated backend DMS modules for EAR, eye-state hysteresis, timestamp-weighted
  PERCLOS, solvePnP head pose, EMA/direction hysteresis, temporal distraction, and
  combined attention state.
- Added authenticated `POST /api/dms/attention` using a compact 16-landmark payload.
- Added bounded per-user/per-stream temporal state with TTL cleanup; face loss,
  incomplete landmarks, and solvePnP failure return `UNKNOWN` rather than `FORWARD`.
- Added backward-compatible `distraction` driving-session alert type.
- Added deterministic offline unit/API coverage for the backend analysis contract.
- Removed duplicate frontend EAR and heuristic head-pose calculations.
- Added an authenticated compact landmark loop targeting 8 FPS; one request carries
  16 normalized points instead of another encoded webcam image.
- Added camera/session stream reset, abort cleanup, face-loss handling, and explicit
  `UNKNOWN` UI behavior when the attention backend is unavailable.
- Reused the existing DMS page, FaceMesh instance, alarm/vibration output, and driving
  session flow; no page redesign or duplicate WebSocket channel was introduced.
- Added compact EAR/eye/PERCLOS/pose/direction/distraction/attention display.
- Added alarm priority (`HIGH_RISK`, drowsy, phone/smoking, distraction) and debounced
  null-to-active session logging for the new `distraction` alert type.

## Current Architecture

- Browser MediaPipe FaceMesh remains the single landmark extractor at about 30 FPS.
- The browser will send only the 16 indices needed for eye/head analysis at a
  throttled target of 8 FPS; it will not resend webcam JPEGs for this pipeline.
- Backend `data.dms` is the single source of truth for EAR, eye state, PERCLOS,
  pose angles, direction, distraction duration, and attention state.
- `AttentionRegistry` isolates temporal state by authenticated principal and random
  camera stream ID, serializes updates with a lock, expires idle streams after 90s,
  and caps retained streams at 128.
- Existing phone/smoking channels, landmark classifier, identity gate, ADAS, camera
  ownership, alarm output, and driving-session endpoints remain in place.
- Planned frontend ownership is display, compact landmark transport, alarm priority,
  and debounced transition logging only; it will not recompute EAR or head pose.

Backend response contract (`schema_version: 1`):

- `ear.left`, `ear.right`, `ear.average`
- `eye_state`: `OPEN`, `CLOSED`, or `UNKNOWN`
- `perclos`, `perclos_observed_seconds`, `perclos_window_seconds`
- `eye_closed_duration_seconds`
- `head_pose.yaw`, `head_pose.pitch`, `head_pose.roll` in degrees
- `direction`: `FORWARD`, `LEFT`, `RIGHT`, `UP`, `DOWN`, or `UNKNOWN`
- `distraction.state`: `FORWARD`, `SHORT_GLANCE`, `DISTRACTED`, or `UNKNOWN`
- `attention_state`: `NORMAL`, `DROWSY`, `DISTRACTED`, `HIGH_RISK`, or `UNKNOWN`
- `confidence`, conservative `reason`, and the active backend `thresholds`

## Important Files

- `DiQuaMuaHaa/backend/data/api/api.py`
- `DiQuaMuaHaa/backend/data/dms/config.py`
- `DiQuaMuaHaa/backend/data/dms/eye_metrics.py`
- `DiQuaMuaHaa/backend/data/dms/perclos.py`
- `DiQuaMuaHaa/backend/data/dms/head_pose.py`
- `DiQuaMuaHaa/backend/data/dms/attention.py`
- `DiQuaMuaHaa/backend/tests/test_dms_attention.py`
- `DiQuaMuaHaa/frontend/demothuattoanpro/src/testdata/thucmuctest.jsx`

## Commits Created

- `f92de68 feat(dms): add head pose and perclos analysis`
- Frontend logical unit is implemented and awaiting its local commit.

## Tests Run

- `python -m unittest tests.test_dms_attention -v`
  - 11 tests passed.
- `python -m unittest discover -s tests -v`
  - 58 backend tests passed, including ADAS/auth/database/hardening regressions.
- `VITE_API_BASE=https://api.example.com npm run build`
  - Production build passed; existing bundle-size and stale browser-data warnings only.
- `npx eslint src/testdata/thucmuctest.jsx`
  - Reports the same baseline 17 errors / 11 warnings as commit `f92de68`.
  - Comparison was run by piping the pre-frontend file from Git into ESLint; this
    feature introduced no additional scoped lint findings.

## Parameters / Thresholds

- EAR closed/open hysteresis: `<= 0.21` / `>= 0.23`.
- PERCLOS window: 30s; warning ratio: 0.40; minimum observed time: 3s.
- Maximum continuous sample gap: 0.75s; larger gaps are excluded from PERCLOS.
- Prolonged eye closure: 3s.
- Head direction entry: yaw 20 degrees, pitch 15 degrees.
- Direction exit hysteresis margin: 4 degrees; pose EMA alpha: 0.35.
- Sustained off-road head direction: 2s.
- Environment overrides are bounded in `data/dms/config.py`.

## Known Issues

- No manual webcam validation has been performed.
- Generic six-point face geometry can vary by camera/driver; the configurable angle
  thresholds require a desk webcam calibration check before release.
- PERCLOS is reported only after 3s of valid observed face time and excludes missing
  intervals; it never assumes missing time was open or closed.
- Existing frontend contains unrelated locally rendered gaze/pupil panels; this unit
  only centralizes the requested EAR/head-pose/attention metrics.
- The legacy monolithic DMS JSX file has 17 pre-existing scoped ESLint errors and 11
  hook warnings; the exact counts are unchanged by this feature.
- Production build requires `VITE_API_BASE`; an initial build without it correctly
  failed the repository's configuration guard, then passed with an HTTPS test origin.

## Work In Progress

Regression verification, measured local backend performance, documentation finalization,
and the manual webcam checklist. Physical camera behavior remains unvalidated.

## Next Exact Steps

1. Review and commit the frontend logical unit locally.
2. Re-run full backend tests and the production frontend build from committed state.
3. Measure pure analyzer throughput and representative HTTP endpoint latency locally.
4. Verify diff scope, branch state, commit history, and absence of generated artifacts.
5. Finalize this handoff with exact manual camera steps, limitations, and readiness.

## Do Not Redo

- ADAS planner/simulation.
- Authentication/security architecture.
- Existing phone, hand, identity, smoking, or driving-session designs.
- Face-recognition redesign or new ML training.

## Manual Tests Required

MANUAL TEST REQUIRED: desk/laptop webcam validation for forward, brief/sustained
head turns, up/down, normal blink, brief/prolonged closure, face loss, and recovery.
