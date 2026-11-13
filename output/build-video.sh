#!/usr/bin/env bash
# Assembles the titled, segmented screen recording from rendered frames.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/output"
FRAMES="$OUT/frames"
SEGMENTS="$OUT/segments"
TITLES="$OUT/titles"
FPS=24

mkdir -p "$SEGMENTS"

# name|start frame index|title text
SPECS=(
  "linear|0|1. Linear interpolation (baseline)"
  "catmull-clamp|48|2. Catmull-Rom - clamp endpoints"
  "catmull-mirror|96|3. Catmull-Rom - mirror endpoints"
  "b-spline-mirror|144|4. Uniform cubic B-spline - mirror"
  "b-spline-repeat|192|5. Uniform cubic B-spline - repeat"
)

for spec in "${SPECS[@]}"; do
  IFS='|' read -r name start title <<< "$spec"
  clip="$SEGMENTS/$name.mp4"
  ffmpeg -y -loglevel error -framerate "$FPS" -start_number "$start" \
    -i "$FRAMES/frame-%04d.png" -i "$TITLES/$name.png" \
    -frames:v 48 -filter_complex "overlay=0:0" \
    -c:v libx264 -pix_fmt yuv420p "$clip"
  echo "built $clip"
done

LIST="$SEGMENTS/list.txt"
: > "$LIST"
for spec in "${SPECS[@]}"; do
  name="${spec%%|*}"
  echo "file '$SEGMENTS/$name.mp4'" >> "$LIST"
done

ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -c copy "$OUT/camera-path-spline.mp4"
echo "built $OUT/camera-path-spline.mp4"
