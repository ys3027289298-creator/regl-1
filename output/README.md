# Camera Path Spline — Verification Artifacts

Smooth camera-path sampling built on a shared spline layer, with full
acceptance evidence. All commands run from the repository root.

## What was implemented

- `lib/util/spline.js` — shared spline layer used by every vector type:
  - `catmullRom(points, t, options, out)` — Catmull-Rom sampling with
    optional `tension` in `[0, 1)`.
  - `uniformCubic(points, t, options, out)` — uniform cubic B-spline.
  - `sample(points, t, options, out)` — generic entry, `type` is one of
    `linear`, `catmull-rom`, `uniform-cubic`.
  - `createPath(points, options)` — reusable path wrapper with `at(t)`.
  - Endpoint strategies (`edge`): `clamp` (default), `mirror`, `repeat`.
  - Accepts nested point columns, flat arrays or typed arrays (`dimension`
    option) and writes into an optional output container — one code path.
  - Rejects fewer than two points, ragged columns, NaN/non-finite data and
    non-finite `t` with explicit errors.
- `example/util/camera-path.js` — camera keyframe path (eye/center/up all
  sampled through the same spline layer), replacing linear-only motion.
- `test/spline.js` — 98 assertions, registered in `test/index.js`.

## Artifacts

- `camera-path-spline.mp4` — segmented screen recording, 5 titled segments:
  linear baseline, Catmull-Rom clamp, Catmull-Rom mirror, B-spline mirror,
  B-spline repeat. 240 frames, 24 fps, 10 s.
- `segments/` — one MP4 clip per segment, each carrying its title card.
- `titles/` — rendered title-bar PNGs.
- `frames/` — raw headless-WebGL frames.
- `render-manifest.json` — segment layout and frame counts.
- `logs/full-test.log` — full repo test run (39562 tests, zero failures).
- `logs/spline-tests.log` — spline-only tape output.
- `logs/hand-computed.log` — hand-computed and independent matrix-reference
  cross-checks, including bit-identical nested/flat/typed results.
- `render-path.js`, `make-titles.py`, `build-video.sh`,
  `verify-hand-computed.js` — reproducible verification entry points.

## Reproduce

```sh
npm test                                  # lint + full repo test suite
node output/verify-hand-computed.js       # hand-computed acceptance checks
node output/render-path.js                # headless WebGL frame rendering
python3 output/make-titles.py             # title cards (uses Pillow)
bash output/build-video.sh                # titled, segmented recording
```
