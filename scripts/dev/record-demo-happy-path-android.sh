#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEVICE_ID="${DEVICE_ID:-10AEA40Z3Y000R5}"
APP_ID="${APP_ID:-com.epam.mobitru}"
DURATION_SECONDS="${DURATION_SECONDS:-45}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/screen-recordings}"
PREFIX="${PREFIX:-m2e-happy-path-record}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SESSION_ID="${SESSION_ID:-happy-path-record-${TIMESTAMP}}"

REMOTE_PATH="/sdcard/${PREFIX}-${TIMESTAMP}.mp4"
LOCAL_PATH="${OUT_DIR}/${PREFIX}-${TIMESTAMP}.mp4"
LOG_PATH="${OUT_DIR}/${PREFIX}-${TIMESTAMP}.log"

mkdir -p "$OUT_DIR"

if ! adb -s "$DEVICE_ID" get-state >/dev/null 2>&1; then
  printf "Android device %s is not ready.\n" "$DEVICE_ID" >&2
  exit 1
fi

printf "[happy-record] Device=%s Session=%s\n" "$DEVICE_ID" "$SESSION_ID"
printf "[happy-record] Recording to %s\n" "$LOCAL_PATH"

adb -s "$DEVICE_ID" shell rm -f "$REMOTE_PATH" >/dev/null 2>&1 || true
adb -s "$DEVICE_ID" shell screenrecord --time-limit "$DURATION_SECONDS" "$REMOTE_PATH" >"$LOG_PATH" 2>&1 &
REC_PID=$!

SCRIPT_EXIT=0
(
  cd "$ROOT"
  DEVICE_ID="$DEVICE_ID" APP_ID="$APP_ID" SESSION_ID="$SESSION_ID" pnpm tsx scripts/dev/demo-happy-path-android.ts
) || SCRIPT_EXIT=$?

wait "$REC_PID" || true

if adb -s "$DEVICE_ID" pull "$REMOTE_PATH" "$LOCAL_PATH" >/dev/null 2>&1; then
  printf "[happy-record] Pulled video: %s\n" "$LOCAL_PATH"
else
  printf "[happy-record] Failed to pull recording from %s\n" "$REMOTE_PATH" >&2
  exit 1
fi

if [ "$SCRIPT_EXIT" -ne 0 ]; then
  printf "[happy-record] Demo script failed with exit code %s\n" "$SCRIPT_EXIT" >&2
  exit "$SCRIPT_EXIT"
fi

printf "[happy-record] Done.\n"
