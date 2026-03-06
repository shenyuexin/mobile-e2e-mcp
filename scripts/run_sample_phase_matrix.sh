#!/usr/bin/env bash

set -euo pipefail

ROOT="/Users/linan/Documents/mobile-e2e-mcp"
IOS_RUNS="${1:-5}"
ANDROID_RUNS="${2:-5}"

"$ROOT/scripts/run_phase1_ios.sh" "$IOS_RUNS"
"$ROOT/scripts/run_phase1_android.sh" "$ANDROID_RUNS"
python3 "$ROOT/scripts/generate_phase_report.py"

printf 'Generated report:\n  %s\n  %s\n' "$ROOT/reports/phase-sample-report.json" "$ROOT/reports/phase-sample-report.md"
