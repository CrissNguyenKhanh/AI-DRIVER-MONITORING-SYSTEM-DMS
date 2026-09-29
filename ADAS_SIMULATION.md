# ADAS Road Simulation

## Safety scope

This feature is a visualization-only road-scene simulation. It analyzes prerecorded
road video and renders lane, image-space obstacle risk, and a simulated path in the
browser. It does not connect to a vehicle, CAN bus, steering, brakes, throttle, or
any other actuator. It is not an autonomous-driving system and must not be used as
a safety controller.

## Architecture

The ADAS module is intentionally separate from the existing driver-facing DMS
models. It reuses only the Flask application, bearer authentication boundary, and
frontend application shell.

```text
Road video in browser
  -> sampled JPEG frame (maximum width 960 px)
  -> authenticated POST /api/adas/process-frame
  -> frame validation and resize
  -> OpenCV lane detection every frame
  -> optional local road-object YOLO every Nth frame
  -> normalized road corridor and image-space risk
  -> simulated decision and display path
  -> canvas overlay in /adas-simulation
```

Only one frontend request is allowed in flight. The backend also uses a
non-blocking process lock; concurrent frames receive HTTP 429 and are dropped
instead of building a stale queue. Object detections are cached between the
configured inference frames, while lane analysis continues on each accepted frame.

## Run the simulation

1. Start the existing backend and frontend as documented in `README.md`.
2. Authenticate a DMS driver at `/test5`. The ADAS frame endpoint is protected by
   the same bearer session.
3. Open `/adas-simulation` directly, or select **OPEN ADAS ROAD SIMULATION** from
   the DMS identity page.
4. Choose a browser-supported road video and press **Start**.

The browser reads a selected file locally and sends sampled JPEG frames, not the
complete video file. MP4 and WebM are recommended; actual codec support depends on
the browser. AVI containers often require conversion to MP4/WebM.

For the **Load local demo source** button, place a licensed test clip at:

```text
DiQuaMuaHaa/frontend/demothuattoanpro/public/samples/road_demo.mp4
```

No sample video is committed because video licenses and file sizes vary.

## Lane and corridor processing

`backend/data/adas/lane_detector.py` applies grayscale conversion, Gaussian blur,
Canny edges, a road-shaped region of interest, and probabilistic Hough segments.
Left/right candidates are filtered by position and slope, fitted as `x(y)`, then
smoothed across frames. Valid geometry produces normalized left/right lines, a
center line, and a four-point corridor polygon.

Partial, crossing, implausibly narrow/wide, and missing geometry is handled without
raising. A previous valid lane may be held briefly with decreasing confidence.
When confidence is below the planner threshold, the risk is `UNCERTAIN` and the
decision is `UNKNOWN`.

## Optional road-object detector

Object detection uses an optional, local Ultralytics-compatible road model. It
accepts only these classes: `person`, `bicycle`, `motorcycle`, `car`, `bus`, and
`truck`.

Default model location:

```text
DiQuaMuaHaa/backend/driver_training/models/road_yolo.pt
```

The existing phone detector is not reused because it is not a general road-object
model. Runtime code never trains or downloads a model. Loading is lazy and occurs
only when the configured file already exists. If the file or optional Ultralytics
package is absent, the API reports a reason such as `model_missing` or
`load_failed`; lane simulation remains available and no fake detections are added.

Use only a model whose architecture, classes, and license have been verified for
the project. If needed, install the already-supported optional runtime manually:

```bash
pip install ultralytics
```

## Risk and decision rules

Risk is deliberately image-space only. It uses an object's normalized bounding-box
area, vertical position, and relation to the detected corridor. It does not claim
distance in metres, time-to-collision, speed, depth, or braking distance.

The deterministic simulation can return:

| Decision | Visualization meaning |
|---|---|
| `KEEP_LANE` | Valid lane with low/absent visible obstacle risk |
| `SLOW_DOWN` | Medium risk or visible risk that does not fully block the corridor |
| `STOP` | High corridor risk and neither image side is considered safe |
| `SHIFT_LEFT` | High blocked corridor with lower image-space risk on the left |
| `SHIFT_RIGHT` | High blocked corridor with lower image-space risk on the right |
| `UNKNOWN` | Lane/corridor confidence is insufficient |

These values are display suggestions only. They are not driving commands.

## Backend configuration

All values are optional and bounded by safe ranges in `config.py`.

| Variable | Default | Purpose |
|---|---:|---|
| `ADAS_OBJECT_MODEL_PATH` | `driver_training/models/road_yolo.pt` | Local model path |
| `DISABLE_ADAS_OBJECT_DETECTOR` | `0` | Set to `1` to disable object inference |
| `ADAS_MAX_PROCESSING_WIDTH` | `960` | Maximum backend frame width |
| `ADAS_MAX_FRAME_CHARS` | `4000000` | Maximum base64 input length |
| `ADAS_OBJECT_INTERVAL` | `3` | Run object inference every N accepted frames |
| `ADAS_OBJECT_CONFIDENCE` | `0.35` | Detector confidence threshold |
| `ADAS_LANE_SMOOTHING` | `0.28` | Current-frame weight in lane smoothing |
| `ADAS_MIN_LANE_CONFIDENCE` | `0.45` | Minimum confidence for risk/path planning |

## API

`POST /api/adas/process-frame` requires `Authorization: Bearer <token>`.

Example request:

```json
{
  "image": "data:image/jpeg;base64,...",
  "reset": true
}
```

The response contains normalized lane/corridor coordinates, enriched detections,
detector availability, image-space risk, side-risk scores, one simulated decision,
planned path points, and measured per-frame latency/FPS. HTTP 400 means invalid
frame input, 401 means the DMS session is absent/invalid, and 429 means that frame
was deliberately dropped because the processor was busy.

## Verification

```bash
cd DiQuaMuaHaa/backend
python -m unittest tests.test_adas -v
python -m unittest tests.test_auth tests.test_hardening tests.test_database -v

cd ../frontend/demothuattoanpro
node --test tests/*.test.js
$env:VITE_API_BASE='/'  # PowerShell
npm run build
```

Manual verification should cover a clear daytime road clip, temporary lane loss,
an obstacle near the detected corridor, pause/resume/reset, an expired session, and
operation without `road_yolo.pt`.

## Known limitations

- Monocular 2D heuristics cannot estimate physical distance or guarantee free space.
- Classical lane detection depends on visible markings, contrast, camera position,
  weather, lighting, and road geometry.
- A temporary held lane is intentionally short-lived and confidence decays.
- Side risk is not lane-change safety validation; blind spots and rear traffic are
  not observed by a single forward-facing video.
- Object coverage and accuracy depend entirely on the separately supplied model.
- Browser decoding and rendering performance varies by device and codec.
- The feature has no safety certification and performs no vehicle actuation.
