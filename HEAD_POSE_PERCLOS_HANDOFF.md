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

Pending first local commit for the completed backend unit.

## Tests Run

- `python -m unittest tests.test_dms_attention -v`
  - 11 tests passed.
- `python -m unittest discover -s tests -v`
  - 58 backend tests passed, including ADAS/auth/database/hardening regressions.

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

## Work In Progress

Frontend integration of compact landmark sampling, returned metrics, reset behavior,
alert priority, and debounced distraction session events.

## Next Exact Steps

1. Commit the tested backend logical unit locally.
2. Remove duplicate frontend EAR/head-pose calculations.
3. Add the authenticated 8 FPS compact landmark loop and robust lifecycle reset.
4. Render EAR, eye state, PERCLOS, angles, direction, and attention compactly.
5. Add distraction alert priority and one transition event per session occurrence.
6. Run frontend build/lint plus full backend regression and performance measurement.
7. Expand this handoff with the manual webcam checklist and final evidence.

## Do Not Redo

- ADAS planner/simulation.
- Authentication/security architecture.
- Existing phone, hand, identity, smoking, or driving-session designs.
- Face-recognition redesign or new ML training.

## Manual Tests Required

MANUAL TEST REQUIRED: desk/laptop webcam validation for forward, brief/sustained
head turns, up/down, normal blink, brief/prolonged closure, face loss, and recovery.
