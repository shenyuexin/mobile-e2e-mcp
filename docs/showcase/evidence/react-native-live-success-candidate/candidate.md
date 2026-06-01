## React Native live success candidate

Verdict: `blocked_before_rn_live_success`
Promoted: `false`
Run ID: `react-native-live-success-candidate-2026-06-01`

Source:
- One-command result: `docs/showcase/evidence/react-native-one-command/result.json`
- One-command verdict: `blocked`
- Proof level: `blocked_before_live`

Live bridge:
- Status: `skipped`
- Output: `not-run`
- Verification: `missing`
- Intake: `missing`

Blockers:
- DEVICE_UNAVAILABLE: No eligible android device is visible.
- METRO_UNAVAILABLE: Metro inspector endpoint is not reachable.
- NO_JS_DEBUG_TARGET: No RN/Expo debug target can be selected because Metro is unavailable.
- RN_LIVE_BRIDGE_NOT_RUN: Live bridge was not requested.

Next action:
- `connect_device_and_run_rn_live_bridge`: Connect an authorized Android device or emulator, start Metro/debug target, then rerun the RN live bridge.
- Command: `pnpm run verify:react-native-change -- --live-bridge --contract=configs/readiness/demo-android-app.android.json --output-dir=output/showcase/react-native-one-command-live/<run-id>`

Boundaries:
- This candidate gates RN live success promotion; it does not execute a device by itself.
- Blocked RN output is readiness or environment evidence, not app-under-test success.
- RN live success requires a completed live bridge with physical/emulator proof and intake evidence.
