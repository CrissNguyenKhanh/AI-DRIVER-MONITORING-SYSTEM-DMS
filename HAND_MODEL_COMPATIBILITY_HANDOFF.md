# Hand Model Compatibility Handoff

## Repository

`D:\mirofish\AI-DRIVER-MONITORING-SYSTEM-DMS`

## Branch

`fix/hand-model-artifact-compatibility`

## Base Commit

`e0b7efb` (`main` and `origin/main` after PR #10)

## Goal

Restore portable loading and real inference for the tracked hand-gesture artifact
without disabling the feature, changing labels, or hiding compatibility failures.

## Original Failure

Project Python 3.11.9 with NumPy 1.26.4, scikit-learn 1.7.2, joblib 1.4.2, and
SciPy 1.11.4 raises `ValueError` in NumPy `__bit_generator_ctor`: the serialized
`numpy.random._mt19937.MT19937` class object is not a known BitGenerator module.
Production then safely leaves `hand_model=None`, labels empty, and `vec_len=126`.

## Artifact Provenance

The tracked 213,914-byte artifact was introduced on the current lineage by `b341d423`
as Git blob `e78c4bd`. Original SHA256:
`8CE1531853DC6FD0363C052F89690ED7B3F064D96E41F1579B1521FF17747C49`.
It is a scikit-learn 1.7.2 `Pipeline(StandardScaler, MLPClassifier)`, `vec_len=63`,
seed 42, with labels `map`, `music`, `no_sign`, `open`, and `phonecall`. The tracked
1,212-row CSV is SHA256 `ADC27388E937D58009A27A3A7604E0411B0703B3AC20C87E577424FA5A396A22`.

## Runtime Versions

- Python 3.11.9
- NumPy 1.26.4
- scikit-learn 1.7.2
- joblib 1.4.2
- SciPy 1.11.4

## Root Cause

Category A/E: the fitted MLP's inference-unneeded private `_random_state` was pickled
with NumPy 2.x's class-based MT19937 reducer. NumPy 1.26.4 accepts only its legacy
name/state representation. The artifact is complete and embeds matching scikit-learn
1.7.2, so this is not corruption, joblib failure, or a sklearn-version mismatch.

## Chosen Fix

**RE-EXPORTED.** A temporary isolated NumPy 2.2.6 environment loaded the original
normally. Only fitted private `_random_state` was removed; public seed 42 and every
learned parameter remain unchanged. The artifact was then dumped with provenance
metadata and verified under project NumPy 1.26.4. No runtime dependency changed.

## Files Changed

- `data/api/api.py`: validate the hand artifact atomically, report truly usable health,
  and classify malformed hand-frame base64 as HTTP 400.
- `driver_training/models/hand_model.pkl`: compatible object-level re-export.
- `driver_training/train/train_hands.py`: strip training-only RNG state and record
  artifact/runtime versions on future exports.
- `tests/test_hand_model.py`: focused real-artifact/load/inference/lazy-health coverage.
- `HAND_MODEL_COMPATIBILITY_HANDOFF.md`: provenance and validation record.

## Artifact Changes

Old SHA256: `8CE1531853DC6FD0363C052F89690ED7B3F064D96E41F1579B1521FF17747C49`.
New SHA256: `43DC7C19CB916480E674608957A5F8A8EA9461DEFF40EF6AA40A0CB2DC8C68BF`.
Size is now 208,973 bytes. Artifact version 2 records Python 3.11.9, NumPy 2.2.6,
scikit-learn 1.7.2, joblib 1.4.2, source hash, and explicit re-export action.

## Tests Run

- Direct `joblib.load`: failure reproduced.
- Production `_ensure_models_loaded`: same failure reproduced; safe unavailable state confirmed.
- Re-export equivalence on all 1,212 tracked CSV rows: predictions and argmax identical;
  maximum cross-NumPy probability delta `1.862645149230957e-7`.
- Fixed artifact direct production load: model, five labels, `vec_len=63`, and MediaPipe
  Hands all usable.
- Existing hardening tests: 14 passed.
- New focused hand tests: 4 passed.
- Full backend regression: 62 passed.
- Frontend Node regression: 16 passed.
- Frontend production build: passed; existing bundle-size/browser-data warnings only.
- `git diff --check`: passed.

## Runtime Validation

Fresh eventlet backend runs at `http://127.0.0.1:8000` (launcher/listener PID
31124/32228). Before trigger, health reported `present=true, loaded=false, enabled=true`.
Wrong vector length returned 400; a tracked `no_sign` vector returned 200 with five
finite scores; malformed base64 returned 400; a valid black no-hand JPEG returned 200
`no_sign`. Repeat inference succeeded without reload. Health then reported hand
`present=true, loaded=true, enabled=true`; server logs contain no artifact traceback.

Measured process working set was 247,267,328 bytes before and 447,787,008 after the
complete lazy landmark/FaceMesh/Hands stack loaded. This delta is not artifact-only.

## Known Limitations

No physical webcam gesture was available. CSV fixtures validate preserved model output,
not camera-domain accuracy. The exact creator NumPy minor was absent from the original
artifact; its NumPy 2.x reducer format is proven, and re-export used NumPy 2.2.6.

## Commits Created

- `6108d16 fix(hand): restore compatible hand model artifact`
- `0d5b7ae test(hand): cover artifact loading and inference`
- `docs(hand): record artifact compatibility validation` (this commit)
- No push/PR/merge performed.

## Next Exact Steps

Run the physical webcam checklist below, review the three local commits, then push the
feature branch. Do not merge based on automated gesture accuracy alone.

## Do Not Redo

- Git preflight/base verification.
- Original failure reproduction on the project `.venv`.
- NumPy major-version/RNG root-cause investigation.
- Learned-parameter-preserving compatibility matrix and re-export selection.

## Manual Validation Required

With a physical webcam test `map`, `music`, `no_sign`, `open`, and `phonecall`; also
remove/re-enter the hand, test both dominant sides, and restart the camera without crash.
