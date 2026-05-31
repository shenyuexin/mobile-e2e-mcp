## Mobile change device readiness

Verdict: `blocked_before_live_verification`
Platform: `android`
App: `com.example.mobilechange`
Policy profile: `interactive`
Runner profile: `native_android`
Selected device: `none`

Expected readiness:
- Screen: `not-specified`
- App phase: `authentication`

Checks:
- device-inventory: `blocked` (DEVICE_UNAVAILABLE) - No Android devices were returned by list_devices.; diagnostic `no_device`
- readiness-contract: `passed` (OK) - At least one deterministic readiness expectation is configured.

Blockers:
- device-inventory: `DEVICE_UNAVAILABLE` (no_device)

Diagnostics:
- no_device:
  - Evidence: Android inventory is empty.
  - Next: Connect an Android device or run on a self-hosted device runner.

Next action:
- `connect_device_or_use_self_hosted_runner`: No eligible local device was discovered; connect one or run the live proof on a self-hosted device runner.
- Command: `M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1 pnpm run proof:mobile-change-verification:live`

Boundaries:
- This preflight only proves local readiness to attempt live verification; it does not claim physical-device proof by itself.
- Device availability, app artifact presence, and readiness contracts are checked before invoking UI-affecting actions.
- Cloud farms and broad platform parity remain outside this preflight unless backed by separate evidence.
