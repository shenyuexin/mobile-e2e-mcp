#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT/artifacts/screen-recordings}"
SHOWCASE_VIDEOS_DIR="${SHOWCASE_VIDEOS_DIR:-$ROOT/docs/showcase/videos}"
SHOWCASE_ASSETS_DIR="${SHOWCASE_ASSETS_DIR:-$ROOT/docs/showcase/assets}"

DEVICE_ID="${DEVICE_ID:-10AEA40Z3Y000R5}"
APP_ID="${APP_ID:-com.epam.mobitru}"

HAPPY_DURATION_SECONDS="${HAPPY_DURATION_SECONDS:-40}"
INTERRUPTION_DURATION_SECONDS="${INTERRUPTION_DURATION_SECONDS:-35}"

HAPPY_PREFIX="${HAPPY_PREFIX:-publish-happy-path}"
INTERRUPTION_PREFIX="${INTERRUPTION_PREFIX:-publish-interruption-recovery}"

CURATED_HAPPY_VIDEO="$SHOWCASE_VIDEOS_DIR/m2e-happy-path-scroll-pause-40s.mp4"
CURATED_INTERRUPTION_VIDEO="$SHOWCASE_VIDEOS_DIR/m2e-interruption-home-recovery-35s.mp4"

mkdir -p "$WORK_DIR" "$SHOWCASE_VIDEOS_DIR" "$SHOWCASE_ASSETS_DIR"

if ! command -v ffmpeg >/dev/null 2>&1; then
  printf "ffmpeg is required to publish showcase assets.\n" >&2
  exit 1
fi

latest_recording_by_prefix() {
  local dir="$1"
  local prefix="$2"
  local latest=""
  local candidate
  for candidate in "$dir"/${prefix}-*.mp4; do
    [ -e "$candidate" ] || continue
    if [ -z "$latest" ] || [ "$candidate" -nt "$latest" ]; then
      latest="$candidate"
    fi
  done
  if [ -z "$latest" ]; then
    return 1
  fi
  printf "%s" "$latest"
}

probe_duration_seconds() {
  local input="$1"
  ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$input"
}

clamp_seek_seconds() {
  local requested="$1"
  local duration="$2"
  awk -v requested="$requested" -v duration="$duration" 'BEGIN {
    maxSeek = duration - 0.25;
    if (maxSeek < 0) {
      maxSeek = 0;
    }
    seek = requested;
    if (seek > maxSeek) {
      seek = maxSeek;
    }
    if (seek < 0) {
      seek = 0;
    }
    printf "%.3f", seek;
  }'
}

extract_frame_safe() {
  local input="$1"
  local requestedSeek="$2"
  local output="$3"
  local duration="$4"
  local seek

  seek="$(clamp_seek_seconds "$requestedSeek" "$duration")"
  ffmpeg -y -ss "$seek" -i "$input" -frames:v 1 -update 1 "$output"
  if [ ! -s "$output" ]; then
    printf "[publish] Failed to extract frame %s at %.3fs (input=%s).\n" "$output" "$seek" "$input" >&2
    exit 1
  fi
}

printf "[publish] Recording happy-path source video...\n"
DEVICE_ID="$DEVICE_ID" APP_ID="$APP_ID" DURATION_SECONDS="$HAPPY_DURATION_SECONDS" OUT_DIR="$WORK_DIR" PREFIX="$HAPPY_PREFIX" \
  bash "$ROOT/scripts/dev/record-demo-happy-path-android.sh"

printf "[publish] Recording interruption-recovery source video...\n"
DEVICE_ID="$DEVICE_ID" APP_ID="$APP_ID" DURATION_SECONDS="$INTERRUPTION_DURATION_SECONDS" OUT_DIR="$WORK_DIR" PREFIX="$INTERRUPTION_PREFIX" \
  bash "$ROOT/scripts/dev/record-demo-interruption-home-recovery-android.sh"

HAPPY_SOURCE="$(latest_recording_by_prefix "$WORK_DIR" "$HAPPY_PREFIX")"
INTERRUPTION_SOURCE="$(latest_recording_by_prefix "$WORK_DIR" "$INTERRUPTION_PREFIX")"

printf "[publish] Curating videos for docs/showcase/videos...\n"
ffmpeg -y -i "$HAPPY_SOURCE" -vf "scale=720:-2" -c:v libx264 -preset veryfast -crf 28 -movflags +faststart -an "$CURATED_HAPPY_VIDEO"
ffmpeg -y -i "$INTERRUPTION_SOURCE" -vf "scale=720:-2" -c:v libx264 -preset veryfast -crf 28 -movflags +faststart -an "$CURATED_INTERRUPTION_VIDEO"

HAPPY_DURATION="$(probe_duration_seconds "$CURATED_HAPPY_VIDEO")"
INTERRUPTION_DURATION="$(probe_duration_seconds "$CURATED_INTERRUPTION_VIDEO")"

printf "[publish] Refreshing key snapshots...\n"
extract_frame_safe "$CURATED_HAPPY_VIDEO" 4.5 "$SHOWCASE_ASSETS_DIR/happy-01-login.png" "$HAPPY_DURATION"
extract_frame_safe "$CURATED_HAPPY_VIDEO" 14 "$SHOWCASE_ASSETS_DIR/happy-02-scrolled.png" "$HAPPY_DURATION"
extract_frame_safe "$CURATED_HAPPY_VIDEO" 20 "$SHOWCASE_ASSETS_DIR/happy-03-add-to-cart.png" "$HAPPY_DURATION"
extract_frame_safe "$CURATED_HAPPY_VIDEO" 24 "$SHOWCASE_ASSETS_DIR/happy-04-orders-tab.png" "$HAPPY_DURATION"
extract_frame_safe "$CURATED_HAPPY_VIDEO" 30 "$SHOWCASE_ASSETS_DIR/happy-05-cart.png" "$HAPPY_DURATION"

extract_frame_safe "$CURATED_INTERRUPTION_VIDEO" 7 "$SHOWCASE_ASSETS_DIR/interruption-01-before-home.png" "$INTERRUPTION_DURATION"
extract_frame_safe "$CURATED_INTERRUPTION_VIDEO" 11 "$SHOWCASE_ASSETS_DIR/interruption-02-launcher.png" "$INTERRUPTION_DURATION"
extract_frame_safe "$CURATED_INTERRUPTION_VIDEO" 23 "$SHOWCASE_ASSETS_DIR/interruption-03-recovered.png" "$INTERRUPTION_DURATION"

printf "[publish] Refreshing lightweight GIF previews...\n"
ffmpeg -y -ss 4 -t 12 -i "$CURATED_HAPPY_VIDEO" -vf "fps=6,scale=320:-1:flags=lanczos" -loop 0 "$SHOWCASE_ASSETS_DIR/happy-preview.gif"
ffmpeg -y -ss 6 -t 12 -i "$CURATED_INTERRUPTION_VIDEO" -vf "fps=6,scale=320:-1:flags=lanczos" -loop 0 "$SHOWCASE_ASSETS_DIR/interruption-preview.gif"

printf "[publish] Done.\n"
printf "  happy video: %s\n" "$CURATED_HAPPY_VIDEO"
printf "  interruption video: %s\n" "$CURATED_INTERRUPTION_VIDEO"
