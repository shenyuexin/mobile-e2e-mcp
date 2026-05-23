---
phase: 08-ios-real-device-record-replay
plan: 01
summary_type: internal-planning
task_type: feature
completed: 2026-04-03
requirements_completed: []
key_files:
  created:
    - .planning/phases/08-ios-real-device-record-replay/08-01-SUMMARY.md
    - .planning/phases/08-ios-real-device-record-replay/08-01-VERIFY.md
    - scripts/dev/run-phase3-native-ios-real-device.sh
  modified:
    - packages/adapter-maestro/src/recording-runtime-ios.ts
    - packages/adapter-maestro/src/recording-runtime.ts
    - packages/adapter-maestro/test/recording-runtime.test.ts
    - scripts/dev/run-sample-phase-matrix.sh
    - scripts/report/generate-phase-report.py
    - scripts/report/generate-acceptance-evidence.py
    - .github/workflows/real-device-acceptance.yml
    - packages/adapter-maestro/src/capability-model.ts
    - packages/mcp-server/src/index.ts
    - docs/showcase/ios-recording-showcase.md
    - docs/guides/flow-generation.md
repo_truth_synced:
  - packages/adapter-maestro/src/recording-runtime-ios.ts
  - packages/adapter-maestro/src/device-runtime.ts
  - scripts/dev/run-phase3-native-ios-real-device.sh
  - .github/workflows/real-device-acceptance.yml
verify_file: 08-01-VERIFY.md
---

# Phase 08 Plan 01 Summary

## Goal

### Problem
iOS record/replay previously defaulted to simulator-only discovery when `deviceId` was omitted, and acceptance artifacts had no distinct physical-device lane.

### Expected Outcome
- [x] iOS recording device discovery is unified and can auto-select physical devices.
- [x] Acceptance scripts/workflow can run an explicit `native-ios-real-device` lane with isolated artifacts.
- [x] Capability/docs wording remains partial and proof-gated while reflecting current runtime truth.

## Implemented

1. **Unified iOS recording discovery path**
   - `resolveIosRecordingDeviceId` now reuses `listAvailableDevices(...)` instead of simulator-only parsing.
   - New runtime selector helper prefers requested target, then physical iOS device, then booted simulator.
2. **Physical-device acceptance lane wiring**
   - Added `scripts/dev/run-phase3-native-ios-real-device.sh`.
   - Extended `run-sample-phase-matrix.sh` and `validate:phase3-real-run` argument wiring.
   - Extended workflow inputs/env/quality-gate/artifact upload for `run_native_ios_real_device`.
3. **Reporting and docs/capability sync**
   - Added `native-ios-real-device` to phase report generation.
   - Added real-device visual artifact pattern to acceptance evidence.
   - Updated capability and MCP tool descriptions; kept iOS promotion proof gate blocked.
   - Updated iOS recording guides/showcase with simulator + physical-device boundary language.
4. **Physical-device empty-export guardrail**
   - Added a hard guard in `endRecordSessionWithMaestro` so iOS physical-device sessions with zero captured actions no longer produce misleading launch-only exported flows.
   - Added unit coverage through `recording-runtime.test.ts`.

## Verification

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` ✅
- `pnpm --filter @shenyuexin/mobile-e2e-mcp test` ✅
- `pnpm typecheck` ✅
- `pnpm build` ✅
- `pnpm run validate:phase3-samples` ✅
- Local real-device orchestration attempt (`start_record_session -> run_flow -> end_record_session`, UDID `00008101-000D482C1E78001E`, app `com.mobitru.demoapp`) ✅ with expected partial caveat on sparse capture.

## Key Decisions

- iOS physical-device discovery belongs to the shared `device-runtime` discovery stack; recording runtime should consume it, not duplicate it.
- Real-device lane remains **optional but explicit** in workflow (guarded by input + prerequisite check for `IOS_DEVICE_ID`).
- Support boundary remains partial/proof-gated; this slice improves implementation and evidence plumbing, not support promotion.

## Next Step

- Execute a self-hosted run with `run_native_ios_real_device=true` and a connected UDID to generate first `native-ios-real-device` acceptance artifacts.
