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
- `90b6552 feat(dms-ui): integrate attention metrics and alerts`
- Final verification/documentation commit will be recorded in Git history after this
  file is finalized.

## Tests Run

- `python -m unittest tests.test_dms_attention -v`
  - 11 tests passed.
- `python -m unittest discover -s tests -v`
  - 58 backend tests passed, including ADAS/auth/database/hardening regressions.
- `VITE_API_BASE=https://api.example.com npm run build`
  - Production build passed twice; existing bundle-size and stale browser-data
    warnings only. No dependencies were updated or downloaded.
- `npx eslint src/testdata/thucmuctest.jsx`
  - Reports the same baseline 17 errors / 11 warnings as commit `f92de68`.
  - Comparison was run by piping the pre-frontend file from Git into ESLint; this
    feature introduced no additional scoped lint findings.

Measured local performance (synthetic valid landmarks, Windows workstation):

- Pure analyzer including solvePnP, smoothing, and PERCLOS, 500 samples:
  p50 0.190ms, p95 0.225ms, mean 0.187ms, about 5,352 samples/s.
- Flask test client including JSON request/response and auth stub, 300 samples:
  p50 0.770ms, p95 1.015ms, mean 0.817ms; all responses HTTP 200.
- Browser transport target is 8 requests/s and 16 landmarks/request, so measured
  backend compute headroom is well above the intended demo cadence.
- Measurements exclude real network latency, browser FaceMesh cost, and camera FPS.

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
- Head direction labels use camera-space solvePnP signs. Left/right/up/down must be
  confirmed on the target mirrored webcam presentation before release.
- No clinical, autonomous-driving, steering, braking, throttle, or CAN-bus behavior
  is implemented or claimed; this remains a driver-monitoring warning aid.

## Work In Progress

Code work and automated verification are complete. Physical webcam validation is the
only outstanding release check and cannot be performed in this terminal environment.

## Next Exact Steps

1. Run the manual webcam checklist below on the target desk/laptop camera.
2. Calibrate bounded environment thresholds only if observed direction signs or neutral
   face angles are consistently biased; do not change code during the validation run.
3. Re-run backend tests and frontend build if calibration changes deployment values.
4. Push this branch only after reviewing the three local commits; do not merge before
   the physical webcam checklist passes.

## Do Not Redo

- ADAS planner/simulation.
- Authentication/security architecture.
- Existing phone, hand, identity, smoking, or driving-session designs.
- Face-recognition redesign or new ML training.

## Manual Tests Required

MANUAL TEST REQUIRED: use a stationary desk/laptop setup, never a moving vehicle.

1. Look forward for at least 10s: pose should settle near neutral, direction should be
   `FORWARD`, eye state `OPEN`, attention `NORMAL`, and no alarm should sound.
2. Turn left and right for less than 2s each: direction should change, distraction
   should show `SHORT_GLANCE`, and no distraction session event should be recorded.
3. Hold left and right separately beyond 2s: `DISTRACTED` should appear once per event,
   the compact warning/audio should activate, then clear after returning forward.
4. Repeat looking up and down, verifying camera-space labels; record any mirrored-axis
   mismatch before changing thresholds or signs.
5. Blink normally for 30s: EAR waveform/blink count should react without producing a
   prolonged-closure alert; PERCLOS should remain below 40%.
6. Close both eyes for at least 3s while stationary: eye state should be `CLOSED`, then
   attention `DROWSY`; verify one session alert and higher-priority audio.
7. Alternate repeated closures over the 30s window: verify timestamp PERCLOS rises and
   crosses 40% based on observed time rather than frame count.
8. Combine sustained head-away with drowsiness: verify `HIGH_RISK` wins alarm priority.
9. Cover/leave the camera view: EAR/pose/direction/attention must become `UNKNOWN`, not
   zero/forward; uncover and verify clean recovery without carrying missing time.
10. Stop and restart the camera/session: histories and timers must reset, alarms must
    stop, and the new stream must not inherit PERCLOS or distraction duration.

Current readiness: **READY FOR CODE MERGE — MANUAL WEBCAM VALIDATION STILL REQUIRED**.
