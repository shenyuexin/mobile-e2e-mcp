#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_COUNT="${1:-1}"
EXPO_PROJECT_ROOT="${EXPO_PROJECT_ROOT:-$ROOT/examples/rn-login-demo}"

export ACCEPTANCE_ENVIRONMENT="${ACCEPTANCE_ENVIRONMENT:-local-self-hosted}"
export ACCEPTANCE_PHASE="${ACCEPTANCE_PHASE:-Phase 2 RN Android acceptance}"
export ACCEPTANCE_WORKSTREAM="${ACCEPTANCE_WORKSTREAM:-framework-acceptance-lane}"
export ACCEPTANCE_FEATURE="${ACCEPTANCE_FEATURE:-react-native-android}"
export APP_ID="${APP_ID:-com.anonymous.rnlogindemo}"
export PHASE2_RN_ANDROID_ARTIFACT_ROOT="${PHASE2_RN_ANDROID_ARTIFACT_ROOT:-$ROOT/artifacts/phase2-rn-android}"
export PHASE_REPORT_PHASE="${PHASE_REPORT_PHASE:-Phase 2 RN Android acceptance report}"
export PHASE_REPORT_PLATFORMS="${PHASE_REPORT_PLATFORMS:-react-native-android}"
export ACCEPTANCE_RUN_METADATA_PATH="${ACCEPTANCE_RUN_METADATA_PATH:-$ROOT/reports/phase2-rn-android-run-metadata.json}"

if [ ! -f "$EXPO_PROJECT_ROOT/package.json" ] || [ ! -f "$EXPO_PROJECT_ROOT/App.tsx" ]; then
  printf 'Phase 2 RN Android sample app is missing under %s.\n' "$EXPO_PROJECT_ROOT" >&2
  printf 'Expected repo-owned sample files before running acceptance lane.\n' >&2
  exit 1
fi

rm -rf "$PHASE2_RN_ANDROID_ARTIFACT_ROOT"
mkdir -p "$ROOT/reports"

cat > "$ACCEPTANCE_RUN_METADATA_PATH" <<EOF
{
  "generated_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "environment": "${ACCEPTANCE_ENVIRONMENT}",
  "phase": "${ACCEPTANCE_PHASE}",
  "workstream": "${ACCEPTANCE_WORKSTREAM}",
  "feature": "${ACCEPTANCE_FEATURE}"
}
EOF

OUT_DIR="$PHASE2_RN_ANDROID_ARTIFACT_ROOT" \
  "$ROOT/scripts/dev/run-phase1-android.sh" "$RUN_COUNT"

python3 "$ROOT/scripts/report/generate-phase-report.py"
python3 "$ROOT/scripts/report/generate-acceptance-evidence.py"

printf 'Phase 2 RN Android acceptance artifacts:\n  %s\n  %s\n' \
  "$ROOT/reports/phase-sample-report.json" \
  "$ROOT/reports/acceptance-evidence.json"
