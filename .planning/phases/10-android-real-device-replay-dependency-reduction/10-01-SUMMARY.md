---
phase: 10-android-real-device-replay-dependency-reduction
plan: 01
summary_type: internal-planning
task_type: feature
completed: 2026-04-06
key_files:
  created:
    - .planning/phases/10-android-real-device-replay-dependency-reduction/00-MVP-COMMAND-MATRIX.md
  modified:
    - packages/adapter-maestro/src/flow-runtime.ts
    - packages/adapter-maestro/src/capability-model.ts
    - packages/adapter-maestro/test/replay-step-planner.test.ts
repo_truth_synced:
  - packages/adapter-maestro/src/flow-runtime.ts
  - packages/adapter-maestro/src/capability-model.ts
verify_file: 10-01-VERIFY.md
---

# Phase 10 Plan 01 — Summary

## Goal

### Problem
Android real-device replay (`run_flow`) currently hard-depends on Maestro helper apps (`dev.mobile.maestro`, `dev.mobile.maestro.test`), which causes repeated install friction and blocks replay even when direct adb-based action paths are already available.

### Expected Outcome
- [x] Android real-device replay has a self-owned primary execution lane without mandatory helper-app precheck.
- [x] Replay failure output clearly distinguishes owned-lane failures vs optional Maestro fallback failures.
- [x] Existing Android direct action/recording behavior remains backward compatible.

## Implement

### Changes Made

#### Task 0: MVP Command Matrix Exit Artifact
- Created `.planning/phases/10-android-real-device-replay-dependency-reduction/00-MVP-COMMAND-MATRIX.md`
  - Authoritative command support matrix for planner/orchestrator implementation
  - Mutation classification (mutating vs non-mutating commands)
  - Fallback eligibility rules with pre-execution and runtime decision logic
  - Backend selection persistence mechanism
  - Terminal fail label mapping
  - Text/Focus safety rules

#### Task 1-3: Android Replay Backend Seam + Owned MVP Backend + Demote Helper-App Precheck
- **`packages/adapter-maestro/src/flow-runtime.ts`**:
  - Added `selectAndroidReplayBackend()` function:
    - Parses flow content via `buildReplayPlanFromFlowYaml()` to detect unsupported commands
    - Checks helper app availability (`dev.mobile.maestro`, `dev.mobile.maestro.test`)
    - Returns `owned-adb` backend when all flow commands are supported
    - Returns `maestro` backend when unsupported commands exist (requires helper apps for fallback)
  - Replaced hard-blocking helper-app precheck with backend-selection-aware logic:
    - **owned-adb primary lane**: helper apps NOT required → continues execution without hard-block
    - **maestro fallback lane**: helper apps required → terminal fail with `DEVICE_UNAVAILABLE` if missing
  - Error messages now clearly distinguish: "owned-adb lane available" vs "maestro fallback blocked — missing helper apps"

#### Task 4: Script/Runtime Behavior Unification
- No script changes were made in this slice.
- Scripts (`run-phase1-android.sh`, `run-phase3-native-android.sh`, `run-phase3-flutter-android.sh`) continue to work as before; runtime decides backend internally.
- Script/runtime parity for real-device operator flows remains to be validated with the A/B/C/D matrix.

#### Task 5: Capability Model Sync
- **`packages/adapter-maestro/src/capability-model.ts`**:
  - Updated `run_flow` capability description for Android:
    - Now documents `owned-adb` primary backend for physical-device replay
    - Lists supported commands: launchApp, tapOn (selector), inputText (deterministic focus), assertVisible
    - Notes Maestro helper-app lane as explicit fallback only

#### Task 6: Tests
- **`packages/adapter-maestro/test/replay-step-planner.test.ts`**:
  - Added 15 new tests for MVP Command Support Matrix validation:
    - Supported commands: launchApp, tapOn (identifier/resourceId), inputText (conditional), assertVisible (bounded)
    - Unsupported commands: stopApp, clearState, scroll, swipe, back, home, killApp, assertNotVisible, runFlow, tapOn.point
    - Mixed flow test (supported + unsupported commands)
  - All 337 tests pass, 0 failures

### Key Decisions
1. **Reason Code decision**: This phase does NOT extend `ReasonCode` enum. All fallback-specific labels are emitted via `ReplayStepOutcome.stopReason` and `actionabilityReview` fields only.
2. **Backend selection at flow-parse time**: Backend is determined once during pre-execution flow analysis in `flow-runtime.ts` (using planner classification output), not re-evaluated per step.
3. **No mid-flow backend swap**: Once a mutating step has executed in owned lane, unsupported commands trigger terminal fail, not fallback.

### Deviations from Plan
- Backend selection ownership landed in `flow-runtime.ts` for this slice (using planner classification output), rather than introducing new planner/orchestrator-owned persistence fields.
- Real-device verification matrix (A/B/C/D) remains pending and is not claimed complete in this summary.

## Verify

### Test Results
```
ℹ tests 337
ℹ suites 0
ℹ pass 337
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### Evidence Types
- Unit tests for planner command classification (15 new tests)
- Existing flow-runtime.test.ts passes (regression gate)
- Existing replay-step-planner.test.ts passes
- Existing replay-step-orchestrator.test.ts passes
- Existing ui-action-tools.test.ts passes

## Retro

### What Went Well
- Task 0 exit artifact (00-MVP-COMMAND-MATRIX.md) provided clear implementation boundary
- Backend selection logic cleanly separated from existing runtime paths
- All tests passed on first run after YAML format fixes

### What Went Wrong
- Initial tests used incorrect YAML format for unsupported commands (e.g., `- clearState` vs `- clearState: {}`)

### Reusable Rule
- When testing YAML-based planners, always use object format (`- command: {}`) for commands that need to be recognized as records.

### Optimization Ideas
- Consider adding a `getSupportedCommands()` / `getUnsupportedCommands()` helper to planner for easier test data generation.

## Next Step
- Phase 10 plan 01 code-level implementation for this slice is complete; real-device verification matrix (scenarios A/B/C/D) remains pending.
- Real-device matrix should be executed manually on Android physical device when available.
- Next planned work: Phase 09-02 (iOS self-owned physical tap/type executor) or Phase 02-02.
