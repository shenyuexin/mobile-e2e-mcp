# Verify: Phase 08 Plan 01

## Verification Scope

- Plan: `08-01-PLAN.md`
- Summary: `08-01-SUMMARY.md`
- Verified on: 2026-04-03
- Verified by: OpenCode agent

## Goal-Backward Checks

### 1. iOS recording discovery no longer falls back to simulator-only when `deviceId` is omitted
- Evidence type: code + test
- Evidence:
  - `packages/adapter-maestro/src/recording-runtime-ios.ts` now calls `listAvailableDevices(...)` and uses `choosePreferredIosRecordingRuntimeDeviceId(...)`.
  - `packages/adapter-maestro/test/recording-runtime.test.ts` includes runtime target preference tests.
- Result: PASS

### 2. Acceptance matrix has an explicit iOS physical-device lane with isolated artifacts
- Evidence type: code + workflow wiring
- Evidence:
  - New script `scripts/dev/run-phase3-native-ios-real-device.sh` writes to `artifacts/phase3-native-ios-real-device/**`.
  - `scripts/dev/run-sample-phase-matrix.sh` and `package.json` (`validate:phase3-real-run`) include real-device lane arguments.
  - `.github/workflows/real-device-acceptance.yml` adds `run_native_ios_real_device` + run-count input, quality-gate expected platform, and artifact upload path.
- Result: PASS

### 2.1 Local real-device record/replay attempt is executable and no longer silently exports empty flows
- Evidence type: local real-device run + guardrail code
- Evidence:
  - Local adapter run used physical UDID `00008101-000D482C1E78001E` with `com.mobitru.demoapp` and completed `start_record_session -> run_flow -> end_record_session` orchestration.
  - `packages/adapter-maestro/src/recording-runtime.ts` now blocks empty physical iOS sessions from exporting false-positive flows (`FLOW_FAILED` partial result with explicit next suggestions).
- Result: PASS (wiring and guardrail); physical-device high-fidelity event capture remains partial by design.

### 3. Capability/docs sync reflects progress without over-promoting support
- Evidence type: code + docs
- Evidence:
  - `packages/adapter-maestro/src/capability-model.ts` keeps iOS recording partial/proof-gated while describing simulator vs physical-device capture behavior.
  - `packages/mcp-server/src/index.ts` updates `start_record_session` description to Android+iOS target scope.
  - `docs/showcase/ios-recording-showcase.md` and `docs/guides/flow-generation.md` now document simulator + physical-device usage and caveats.
- Result: PASS

## Verification Commands

```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro test
pnpm --filter @shenyuexin/mobile-e2e-mcp test
pnpm typecheck
pnpm build
pnpm run validate:phase3-samples
```

All commands completed successfully in this session.

## Formal Truth Checks

- Code/contracts checked:
  - `packages/adapter-maestro/src/recording-runtime-ios.ts`
  - `packages/adapter-maestro/src/recording-runtime.ts`
  - `packages/adapter-maestro/src/capability-model.ts`
  - `packages/mcp-server/src/index.ts`
- Tooling/workflow checked:
  - `.github/workflows/real-device-acceptance.yml`
  - `scripts/dev/run-sample-phase-matrix.sh`
  - `scripts/dev/run-phase3-native-ios-real-device.sh`
  - `scripts/report/generate-phase-report.py`
  - `scripts/report/generate-acceptance-evidence.py`
- Docs checked:
  - `docs/showcase/ios-recording-showcase.md`
  - `docs/guides/flow-generation.md`

## Decision

- Overall status: PASS
- Ready to advance: yes
- Next action: run self-hosted real-device workflow execution to produce first `native-ios-real-device` acceptance artifact batch.
