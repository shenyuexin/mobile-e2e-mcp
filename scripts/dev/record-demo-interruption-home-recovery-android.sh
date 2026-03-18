#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEVICE_ID="${DEVICE_ID:-}"
APP_ID="${APP_ID:-com.epam.mobitru}"
APK_PATH="${APK_PATH:-${NATIVE_ANDROID_APK_PATH:-}}"
ANDROID_MIN_SDK="${ANDROID_MIN_SDK:-28}"
DURATION_SECONDS="${DURATION_SECONDS:-35}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/screen-recordings}"
PREFIX="${PREFIX:-m2e-interruption-recovery-record}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SESSION_ID="${SESSION_ID:-interruption-recovery-record-${TIMESTAMP}}"

REMOTE_PATH="/sdcard/${PREFIX}-${TIMESTAMP}.mp4"
LOCAL_PATH="${OUT_DIR}/${PREFIX}-${TIMESTAMP}.mp4"
LOG_PATH="${OUT_DIR}/${PREFIX}-${TIMESTAMP}.log"

mkdir -p "$OUT_DIR"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf "Required command '%s' is not available in PATH.\n" "$command_name" >&2
    exit 1
  fi
}

normalize_apk_path() {
  if [ -z "$APK_PATH" ]; then
    return
  fi

  if [ ! -f "$APK_PATH" ] && [ -f "$ROOT/$APK_PATH" ]; then
    APK_PATH="$ROOT/$APK_PATH"
  fi
}

resolve_device_id() {
  if [ -n "$DEVICE_ID" ]; then
    return
  fi

  DEVICE_ID="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
  if [ -z "$DEVICE_ID" ]; then
    printf "No Android device is ready. Start an emulator (recommended: API 28+) or connect a device, then retry.\n" >&2
    adb devices >&2 || true
    exit 1
  fi
}

verify_android_sdk() {
  local sdk_raw
  local sdk

  sdk_raw="$(adb -s "$DEVICE_ID" shell getprop ro.build.version.sdk 2>/dev/null || true)"
  sdk="$(printf "%s" "$sdk_raw" | tr -d '\r[:space:]')"

  if [ -z "$sdk" ] || [[ ! "$sdk" =~ ^[0-9]+$ ]]; then
    printf "[interrupt-record] Unable to detect Android SDK version for %s. Continuing anyway.\n" "$DEVICE_ID"
    return
  fi

  if [ "$sdk" -lt "$ANDROID_MIN_SDK" ]; then
    printf "Android SDK %s detected on %s, but this demo requires >= %s (Android 9+).\n" "$sdk" "$DEVICE_ID" "$ANDROID_MIN_SDK" >&2
    exit 1
  fi
}

ensure_app_installed() {
  normalize_apk_path

  if [ -n "$APK_PATH" ]; then
    if [ ! -f "$APK_PATH" ]; then
      printf "APK_PATH does not exist: %s\n" "$APK_PATH" >&2
      exit 1
    fi
    printf "[interrupt-record] Installing APK: %s\n" "$APK_PATH"
    adb -s "$DEVICE_ID" install -r -d "$APK_PATH" >/dev/null
  fi

  if ! adb -s "$DEVICE_ID" shell pm path "$APP_ID" >/dev/null 2>&1; then
    printf "App %s is not installed on %s.\n" "$APP_ID" "$DEVICE_ID" >&2
    printf "Install an APK first, or pass APK_PATH=/path/to/app.apk when running this script.\n" >&2
    exit 1
  fi
}

require_command adb
require_command pnpm
resolve_device_id

if ! adb -s "$DEVICE_ID" get-state >/dev/null 2>&1; then
  printf "Android device %s is not ready.\n" "$DEVICE_ID" >&2
  exit 1
fi

verify_android_sdk
ensure_app_installed

printf "[interrupt-record] Device=%s Session=%s\n" "$DEVICE_ID" "$SESSION_ID"
printf "[interrupt-record] Recording to %s\n" "$LOCAL_PATH"

adb -s "$DEVICE_ID" shell rm -f "$REMOTE_PATH" >/dev/null 2>&1 || true
adb -s "$DEVICE_ID" shell screenrecord --time-limit "$DURATION_SECONDS" "$REMOTE_PATH" >"$LOG_PATH" 2>&1 &
REC_PID=$!

SCRIPT_EXIT=0
(
  cd "$ROOT"
  DEVICE_ID="$DEVICE_ID" APP_ID="$APP_ID" SESSION_ID="$SESSION_ID" pnpm tsx scripts/dev/demo-interruption-home-recovery-android.ts
) || SCRIPT_EXIT=$?

wait "$REC_PID" || true

if adb -s "$DEVICE_ID" pull "$REMOTE_PATH" "$LOCAL_PATH" >/dev/null 2>&1; then
  printf "[interrupt-record] Pulled video: %s\n" "$LOCAL_PATH"
else
  printf "[interrupt-record] Failed to pull recording from %s\n" "$REMOTE_PATH" >&2
  exit 1
fi

if [ "$SCRIPT_EXIT" -ne 0 ]; then
  printf "[interrupt-record] Demo script failed with exit code %s\n" "$SCRIPT_EXIT" >&2
  exit "$SCRIPT_EXIT"
fi

printf "[interrupt-record] Done.\n"
