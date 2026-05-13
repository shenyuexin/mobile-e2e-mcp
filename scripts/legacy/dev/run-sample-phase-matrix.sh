#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
IOS_RUNS="${1:-5}"
ANDROID_RUNS="${2:-5}"
FLUTTER_RUNS="${3:-3}"
NATIVE_ANDROID_RUNS="${4:-2}"
NATIVE_IOS_RUNS="${5:-2}"
NATIVE_IOS_REAL_DEVICE_RUNS="${6:-1}"
RUN_METADATA_PATH="$ROOT/output/reports/self-hosted-run-metadata.json"

mkdir -p "$ROOT/output/reports"
cat > "$RUN_METADATA_PATH" <<EOF
{
  "generated_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "environment": "${ACCEPTANCE_ENVIRONMENT:-local-self-hosted}",
  "phase": "${ACCEPTANCE_PHASE:-Phase 3 real-run}",
  "workstream": "${ACCEPTANCE_WORKSTREAM:-sample-validation}",
  "feature": "${ACCEPTANCE_FEATURE:-self-hosted mobile validation}"
}
EOF

rm -rf \
  "$ROOT/output/evidence/phase1-ios" \
  "$ROOT/output/evidence/phase1-android" \
  "$ROOT/output/evidence/phase2-rn-android" \
  "$ROOT/output/evidence/phase3-flutter-android" \
  "$ROOT/output/evidence/phase3-native-android" \
  "$ROOT/output/evidence/phase3-native-ios" \
  "$ROOT/output/evidence/phase3-native-ios-real-device"

"$ROOT/scripts/legacy/dev/run-phase1-ios.sh" "$IOS_RUNS"
"$ROOT/scripts/legacy/dev/run-phase1-android.sh" "$ANDROID_RUNS"
if [ "${RUN_FLUTTER_ANDROID:-1}" = "1" ]; then
  "$ROOT/scripts/legacy/dev/run-phase3-flutter-android.sh" "$FLUTTER_RUNS"
fi
if [ "${RUN_NATIVE_ANDROID:-1}" = "1" ]; then
  "$ROOT/scripts/legacy/dev/run-phase3-native-android.sh" "$NATIVE_ANDROID_RUNS"
fi
if [ "${RUN_NATIVE_IOS:-1}" = "1" ]; then
  "$ROOT/scripts/legacy/dev/run-phase3-native-ios.sh" "$NATIVE_IOS_RUNS"
fi
if [ "${RUN_NATIVE_IOS_REAL_DEVICE:-0}" = "1" ]; then
  "$ROOT/scripts/legacy/dev/run-phase3-native-ios-real-device.sh" "$NATIVE_IOS_REAL_DEVICE_RUNS"
fi
python3 "$ROOT/scripts/report/generate-phase-report.py"
python3 "$ROOT/scripts/report/generate-acceptance-evidence.py"

printf 'Generated report:\n  %s\n  %s\n' "$ROOT/output/reports/phase-sample-report.json" "$ROOT/output/reports/phase-sample-report.md"
printf 'Generated acceptance evidence:\n  %s\n  %s\n' "$ROOT/output/reports/acceptance-evidence.json" "$ROOT/output/reports/acceptance-evidence.md"
