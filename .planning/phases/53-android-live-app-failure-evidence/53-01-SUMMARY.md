# Phase 53 Summary: Android Live App Failure Evidence

## What Changed

- Captured a real Android live run on device `10AEA40Z3Y000R5`.
- Promoted the live output into `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/`.
- Added `scripts/showcase/validate-mobile-change-live-android-evidence.ts` and focused tests.
- Improved live runner failure signal classification so downstream `DEVICE_UNAVAILABLE` and readiness mismatch signals produce actionable failure packets.
- Updated the live proof intake gate to point at the tracked Android live evidence.
- Updated package scripts, README, showcase docs, roadmap, and state.

## What Completed

- ADB confirmed the device is attached.
- The first sandboxed live attempt exposed that Node-side ADB access must run outside the sandbox.
- The escalated live run discovered the Android device, started a governed session, collected UI evidence, and produced an app-readiness failure packet.
- The app did not verify successfully: `launch_app` returned `ADAPTER_ERROR`, and readiness check returned `APP_NOT_READY`.

## Evidence Produced

- `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/summary.json`
- `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/report.md`
- `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.json`
- `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.md`
- `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/inspect-ui.xml`

## Deviations From Plan

- The live evidence is a real failure, not a successful app verification. This is still useful because it proves the live-device path and failure packet behavior on a connected Android device.

## Blockers Or Follow-On Work

- A real app artifact or installed target app is needed for a successful mobile change verification proof.
- The next live phase should install or target a known app package and define a matching readiness contract.

## Repo Truth Owners Updated

- `scripts/showcase/mobile-change-verification.ts`
- `scripts/showcase/generate-mobile-change-live-proof-intake.ts`
- `scripts/showcase/validate-mobile-change-live-android-evidence.ts`
- `package.json`
- `README.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
