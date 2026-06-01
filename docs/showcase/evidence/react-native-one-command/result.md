## React Native one-command verification

Verdict: `blocked`
Proof level: `blocked_before_live`
Run ID: `react-native-one-command-2026-06-01`

Stages:
- readiness: `blocked` - Readiness verdict: blocked_before_react_native_verification.
- evidence-pack: `blocked` - Evidence pack review status: blocked.
- live-bridge: `skipped` - Live bridge was not requested.
- review: `blocked` - RN one-command verdict: blocked.

Blockers:
- DEVICE_UNAVAILABLE: No eligible android device is visible.
- METRO_UNAVAILABLE: Metro inspector endpoint is not reachable.
- NO_JS_DEBUG_TARGET: No RN/Expo debug target can be selected because Metro is unavailable.

Evidence:
- readiness: `docs/showcase/evidence/react-native-readiness/summary.json`
- evidence pack: `docs/showcase/evidence/react-native-evidence-pack/evidence-pack.json`
- result: `docs/showcase/evidence/react-native-one-command/result.json`
- live bridge: `not-run`

Next action:
- `fix_readiness_blocker`: Connect an eligible device or run on a self-hosted runner.
- Command: `pnpm run validate:react-native-readiness`

Boundaries:
- This RN command orchestrates readiness and evidence packaging; it does not weaken proof-level labels.
- A blocked RN result is not an app assertion failure.
- Live RN success still requires device-backed verification and intake-backed promotion evidence.
- The live bridge is explicit and only runs after RN readiness passes.
