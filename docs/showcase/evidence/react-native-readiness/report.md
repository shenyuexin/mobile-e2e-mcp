## React Native readiness

Verdict: `blocked_before_react_native_verification`
Proof level: `blocked_before_live`
Run ID: `react-native-readiness-2026-06-01`
Platform: `android`
App ID: `com.anonymous.rnlogindemo`
Metro: `http://127.0.0.1:8081`
Selected device: `none`

Checks:
- device-inventory: `blocked` (DEVICE_UNAVAILABLE) - No eligible android device is visible.
- metro-inspector: `blocked` (METRO_UNAVAILABLE) - Metro inspector endpoint is not reachable.
- js-debug-target: `blocked` (NO_JS_DEBUG_TARGET) - No RN/Expo debug target can be selected because Metro is unavailable.
- readiness-contract: `passed` (OK) - A deterministic readiness expectation is configured.
- stable-selectors: `passed` (OK) - 3 stable RN selector(s) are declared.

Blockers:
- DEVICE_UNAVAILABLE: No eligible android device is visible.
- METRO_UNAVAILABLE: Metro inspector endpoint is not reachable.
- NO_JS_DEBUG_TARGET: No RN/Expo debug target can be selected because Metro is unavailable.

Next action:
- `connect_device_or_use_self_hosted_runner`: Connect an eligible device or run on a self-hosted runner.
- Command: `pnpm run validate:react-native-readiness`

Boundaries:
- RN readiness is a preflight and does not prove app success by itself.
- Metro/JS debug evidence is supplemental; native UI post-condition evidence remains the proof backbone.
- Stable testID/accessibility selectors and deterministic readiness contracts are required before live RN success can be trusted.
