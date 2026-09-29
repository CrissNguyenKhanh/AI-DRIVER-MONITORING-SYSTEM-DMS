# ADAS Road Simulation Handoff

Last updated: 2026-09-29

Working branch: `feature/adas-road-simulation`

Base: `main` / `origin/main` at `c6bfc1e`

## Outcome

The road-facing ADAS simulation is implemented as a module separate from the
driver-facing DMS. It accepts browser-sampled frames from a prerecorded road video,
detects lane geometry, optionally detects road objects using a local model, computes
image-space risk, returns one deterministic simulated decision, and draws a planned
path overlay.

Safety boundary: this is simulation and visualization only. There is no CAN bus,
steering, brake, throttle, vehicle actuator, or autonomous-driving integration.

## Local commits

- `3d32d8a feat(adas): add road perception and simulation pipeline`
- `4f90f5b feat(adas): add road simulation dashboard`
- `6df544a test(adas): cover perception planning and frame flow`
- `docs(adas): document simulation setup and handoff` (commit containing this file)

No commit was pushed, merged, or used to create a pull request.

## Backend map

All ADAS logic is under `DiQuaMuaHaa/backend/data/adas/`:

- `config.py`: bounded environment configuration and local model path.
- `frame_codec.py`: data-URL/base64 validation, decode, and pixel limit.
- `lane_detector.py`: OpenCV lane lines, validation, corridor, smoothing, temporary
  lane hold, and normalized coordinates.
- `obstacle_detector.py`: lazy local-only Ultralytics road-object adapter. It never
  downloads or trains a model.
- `risk_analyzer.py`: corridor-relative image-space risk only.
- `path_planner.py`: `KEEP_LANE`, `SLOW_DOWN`, `STOP`, `SHIFT_LEFT`,
  `SHIFT_RIGHT`, or `UNKNOWN`, plus display-only path points.
- `pipeline.py`: frame orchestration, resize, object sampling/cache, and metrics.

The protected route is `POST /api/adas/process-frame` in
`DiQuaMuaHaa/backend/data/api/api.py`. It uses the existing bearer-auth decorator.
A non-blocking process lock returns 429 when busy so stale frames are dropped. The
`/health` response exposes road-detector availability without loading the model.

## Frontend map

- Route: `/adas-simulation` in `src/App.jsx`.
- Page and canvas overlay: `src/adas/ADASSimulation.jsx`.
- Styling: `src/adas/ADASSimulation.css`.
- Request throttle/decision labels: `src/adas/adasFrameScheduler.js`.
- Entry button: the existing `/test5` DMS identity page.
- Optional local video path: `public/samples/road_demo.mp4` (not committed).

The client captures JPEG frames at a maximum width of 960 px and quality 0.72.
Only one request may be in flight. Pause/reset/source changes abort stale requests.
An expired token clears the DMS session and stops processing. The video file itself
is not uploaded as a complete file.

## Model state

The repository does not contain a compatible general road-object model. The
existing `phone_yolo.onnx` is intentionally not reused. Current expected status is:

```text
available=false, artifact_present=false, reason=model_missing
```

Lane processing remains active in that state. To enable object detection, manually
place a licensed, verified Ultralytics-compatible general road model at:

```text
DiQuaMuaHaa/backend/driver_training/models/road_yolo.pt
```

Alternatively set `ADAS_OBJECT_MODEL_PATH`. Runtime must never auto-download or
auto-train the model.

## Verification completed

Using the repository virtualenv:

```text
python -m unittest discover -s tests -v
47 tests passed

python -c "import app ..."
backend launcher import passed
```

Focused backend ADAS and regression suite:

```text
python -m unittest tests.test_adas tests.test_auth tests.test_hardening tests.test_database -v
44 tests passed
```

Frontend:

```text
node --test tests/*.test.js
16 tests passed

VITE_API_BASE=/ npm run build
passed

npx eslint src/adas tests/adasFrameScheduler.test.js src/App.jsx
passed
```

Full frontend lint still reports the unchanged repository baseline: 39 errors and
17 warnings in pre-existing files. None is reported from `src/adas/`, the ADAS test,
or `src/App.jsx`. The production build also reports the existing large-chunk warning.

Measured lane-only benchmark on this machine, using 100 generated 960x540 frames
after warm-up and no road-object model:

```text
mean pipeline latency: 4.84 ms/frame
p95 pipeline latency: 6.46 ms/frame
effective sequential throughput: 206.05 FPS
lane result: detected, confidence 0.7786
```

These numbers measure the synthetic lane-only backend pipeline, not browser/network
latency or YOLO inference. Do not generalize them to a deployed device.

## Manual verification still required

Browser UI automation was unavailable in the execution environment, and no
licensed road video or compatible road-object model is committed. A human should:

1. Authenticate at `/test5`, open `/adas-simulation`, and inspect desktop and narrow
   viewport layout.
2. Run a clear daytime MP4/WebM; verify video/overlay alignment and projector
   readability.
3. Exercise Start, Pause, Reset, source replacement, video end, and invalid codec.
4. Test lane disappearance and confirm confidence decays to `UNKNOWN` rather than
   preserving a confident path indefinitely.
5. Test an expired/absent bearer session and 429 frame drops.
6. Test without `road_yolo.pt`, then with a licensed compatible road model and road
   scenes containing center, left, and right obstacles.
7. Confirm every displayed decision remains labeled as simulation only.

## Continue from here

Read `ADAS_SIMULATION.md` for architecture, configuration, API details, and known
limitations. Before new work, run `git status`, inspect the last commits, and avoid
adding model/video binaries unless their licensing and repository size are approved.
The next sensible feature is a versioned offline evaluation fixture set with
ground-truth lane/corridor and obstacle-zone annotations; do not create it without a
separate task and approved media.
