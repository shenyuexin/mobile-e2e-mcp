# Phase 53 Plan: Android Live App Failure Evidence

## Objective

Use the connected Android device `10AEA40Z3Y000R5` to produce and commit real live mobile change verification evidence.

## Scope

- Confirm the device is visible through ADB.
- Run live mobile change verification outside the sandbox so MCP tools can access ADB.
- Capture the resulting live failure bundle, report, UI tree, and failure packet.
- Improve failure classification where the live run exposes weak diagnosis.
- Add a validator for the tracked Android live evidence.
- Point the live proof intake gate at the tracked Android live evidence.

## Out of Scope

- Claiming successful app verification.
- Installing or building a real app artifact.
- iOS live proof.
- Cloud or device farm orchestration.

## Read-First Context

- `scripts/showcase/mobile-change-verification.ts`
- `scripts/showcase/generate-mobile-change-live-proof-intake.ts`
- `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/`

## Actionable Checklist

- [x] Confirm `adb devices` lists `10AEA40Z3Y000R5`.
- [x] Run readiness preflight with the connected device.
- [x] Run live verification outside the sandbox.
- [x] Fix failure packet classification for downstream `DEVICE_UNAVAILABLE` and readiness mismatch signals.
- [x] Promote the live output into tracked docs evidence.
- [x] Add validator and tests for the Android live evidence.
- [x] Update intake gate to point at the tracked Android live evidence.
- [x] Update docs and planning state.

## Verification Approach

- Run focused mobile change verification tests.
- Run focused intake tests.
- Run the Android live evidence validator.
- Run typecheck and smoke validation.

## Acceptance Criteria

- `adb devices` shows `10AEA40Z3Y000R5` as `device`.
- The live bundle has `source: live_device`.
- Device discovery and session start steps succeed.
- UI evidence is collected from the live run.
- The failure packet is classified as `app_readiness`.
- The intake gate classifies the tracked live evidence as promotable.

## Success Criteria

The project now contains tracked Android live app-failure evidence and can distinguish it from fixture, controlled, and no-device proof.
