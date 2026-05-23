---
phase: 09-ios-real-device-capability-promotion-hardening
plan: 02
summary_type: internal-planning
task_type: hardening
completed: 2026-04-06
requirements_completed: []
key_files:
  created:
    - .planning/phases/09-ios-real-device-capability-promotion-hardening/09-02-SUMMARY.md
    - .planning/phases/09-ios-real-device-capability-promotion-hardening/09-02-VERIFY.md
    - packages/adapter-maestro/runner/project.yml
    - packages/adapter-maestro/runner/README.md
    - packages/adapter-maestro/runner/OwnedRunnerApp/AppDelegate.swift
    - packages/adapter-maestro/runner/OwnedRunnerApp/Info.plist
    - packages/adapter-maestro/runner/OwnedRunnerUITests/OwnedRunnerUITests.swift
    - scripts/dev/run-ios-owned-physical-runner.sh
    - packages/adapter-maestro/test/action-outcome-startup.test.ts
  modified:
    - packages/adapter-maestro/src/ui-action-tools.ts
    - packages/adapter-maestro/src/ui-runtime-ios.ts
    - packages/adapter-maestro/src/diagnostics-tools.ts
    - packages/adapter-maestro/src/action-outcome.ts
    - packages/adapter-maestro/test/ui-action-tools.test.ts
    - packages/adapter-maestro/test/diagnostics-tools.test.ts
    - .planning/phases/09-ios-real-device-capability-promotion-hardening/09-02-PLAN.md
repo_truth_synced:
  - packages/adapter-maestro/src/ui-action-tools.ts
  - packages/adapter-maestro/src/ui-runtime-ios.ts
  - packages/adapter-maestro/src/diagnostics-tools.ts
  - packages/adapter-maestro/src/action-outcome.ts
  - packages/adapter-maestro/runner/OwnedRunnerUITests/OwnedRunnerUITests.swift
  - scripts/dev/run-ios-owned-physical-runner.sh
verify_file: 09-02-VERIFY.md
---

# Phase 09 Plan 02 Summary

## Goal

Build a self-owned iOS physical-device tap/type executor lane with deterministic startup-failure attribution, while keeping caller contracts stable and fallback behavior explicit.

## Implemented

1. Introduced and hardened iOS physical-device backend seam:
   - Local self-owned runner path (`local_manual_runner`) is first lane for physical-device tap/type.
   - Legacy Maestro CLI fallback is explicit, bounded, and evidence-backed.
2. Added self-owned iOS runner scaffold and execution script:
   - New runner project + app + UITest target under `packages/adapter-maestro/runner/`.
   - New script `scripts/dev/run-ios-owned-physical-runner.sh` to execute flow via xctestrun.
3. Strengthened startup attribution + remediation:
   - Structured startup phase buckets (`preflight`, `bundle_mapping`, `xctest_handshake`, `startup_timeout`, `runner_execution`).
   - Signature install failures (`0xe8008018` / invalid signature markers) mapped to configuration/preflight with precise remediation guidance.
   - Reduced false attribution by avoiding generic install-error overmatching.
4. Improved owned-runner type_text behavior:
   - Better target-app foreground/activation handling.
   - Keyboard-aware typing path and stable editable-element fallback.
5. Added and extended tests:
   - Backend/failure classification/remediation tests in `ui-action-tools.test.ts` and `diagnostics-tools.test.ts`.
   - New startup-focused remediation regression test in `action-outcome-startup.test.ts`.

## Verification

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` ✅ (latest: 303/303)
- `pnpm --filter @mobile-e2e-mcp/adapter-maestro typecheck` ✅
- `xcodebuild build-for-testing -project ios-owned-runner.xcodeproj -scheme ios-owned-runner -destination "generic/platform=iOS" -derivedDataPath build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` ✅
- Real-device bounded smoke (`3 min`) executed with owned-runner lane; failure was deterministically attributed to signature validation (`0xe8008018`) with improved remediation output.

## Key Decisions

- Keep physical-device constraints honest: this plan removes external-CLI-first dependency but does not remove Xcode/XCTest signing constraints.
- Preserve deterministic-first and explicit fallback semantics in result envelopes.
- Keep startup diagnosis machine-consumable and phase-oriented to reduce manual log archaeology.

## Next Step

- Proceed to Phase 10 Plan 01 implementation/verification cadence for Android real-device replay dependency reduction, while keeping iOS signing/preflight troubleshooting scoped to runtime evidence and guidance (no cert mutation flows).
