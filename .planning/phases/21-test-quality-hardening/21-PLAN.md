---
phase: 21-test-quality-hardening
plan: 01
title: Fill empty test files and strengthen thin test assertions (critical gap closure)
status: completed
summary_file: 21-01-SUMMARY.md
verify_file: 21-01-VERIFY.md
type: execute
wave: 1
depends_on: []
must_haves:
  truths:
    - device-runtime-ios.test.ts is no longer an empty file — core iOS device runtime parsing and command-building functions have behavioral tests.
    - interruption-tools.test.ts no longer relies on trivial type checks — each of the 4 interruption tools has at least one behavioral test with meaningful assertions.
    - interruption-classifier.test.ts covers the major interruption types beyond permission_prompt (system_alert, action_sheet, overlay, keyboard_blocking, unknown).
    - interruption-orchestrator.test.ts tests more than one trivial assertion — covers both happy and error paths for checkpoint building.
    - doctor-runtime.test.ts verifies check statuses, not just check names.
    - diagnostics-pull.test.ts replaces "function exists" checks with mocked executeRunner behavioral tests for boundedRemoteFileRead and boundedRemoteFileReadBatch.
    - action-outcome-startup.test.ts adds at least one additional remediation scenario (network, device-unavailable, or adapter-error).
  artifacts:
    - docs/testing/test-review-report.md (updated with pre/post metrics)
    - packages/adapter-maestro/test/device-runtime-ios.test.ts (non-empty, behavioral tests added)
    - packages/mcp-server/test/interruption-tools.test.ts (strengthened assertions, per-tool behavioral tests)
    - packages/adapter-maestro/test/interruption-classifier.test.ts (multi-type coverage)
    - packages/adapter-maestro/test/interruption-orchestrator.test.ts (additional behavioral tests)
    - packages/adapter-maestro/test/doctor-runtime.test.ts (status assertions)
    - packages/adapter-maestro/test/diagnostics-pull.test.ts (mocked executeRunner tests)
    - packages/adapter-maestro/test/action-outcome-startup.test.ts (additional scenarios)
---

# Phase 21 Plan 01 — Critical Test Gap Closure

## Objective

- **What:** Fill empty test files and strengthen thin test assertions across 7 files that are either completely empty or have trivial assertions.
- **Why:** These 7 files represent the weakest points in a 53-file test suite. An empty test file (`device-runtime-ios.test.ts`) and trivial type-check assertions (`interruption-tools.test.ts`) undermine confidence in modules that are actively used in the runtime.
- **Output:** 7 strengthened test files with behavioral assertions, plus updated review report with pre/post metrics.

## Context

The comprehensive test review (Phase 21 Plan 01 analysis) identified 6 LOW-scored files and 1 empty file:

| File | Lines | Tests | Issue |
|------|-------|-------|-------|
| `device-runtime-ios.test.ts` | 2 | 0 | **Completely empty** — only imports |
| `interruption-tools.test.ts` | ~70 | 1 | Trivial type checks (`typeof === "boolean"`) |
| `interruption-classifier.test.ts` | ~40 | 2 | Only permission_prompt + unknown tested; 4 other types untested |
| `interruption-orchestrator.test.ts` | ~30 | 1 | Single trivial checkpoint assertion |
| `doctor-runtime.test.ts` | ~15 | 1 | Only checks check names exist, no status validation |
| `diagnostics-pull.test.ts` | ~80 | 3 | "function exists" checks; core functions untestable without mocking |
| `action-outcome-startup.test.ts` | ~70 | 1 | One narrow scenario, regex-based assertion |

These 7 files cover ~1,500 lines of source code with essentially zero behavioral test confidence.

## Source Files to Test

### device-runtime-ios.ts (641 lines)
Key exports needing tests:
- `buildIosLogLevelPredicate` — log level mapping (V/D/I/W/E/F)
- `extractIosPhysicalProcessId` — devicectl process parsing
- `extractIosSimulatorProcessId` — launchctl process parsing
- `extractIosPhysicalAppName` — devicectl app listing
- `resolveIosAttachTarget` — dispatches to simulator vs physical (testable via fake-xcrun scripts)

**NOT testable without shell hooks:** `resolveIosPhysicalAttachTarget`, `resolveIosSimulatorAttachTarget`, `createIosDeviceRuntimeHooks` — these call `executeRunner` directly (partially covered via `device-runtime.test.ts`).

### interruption-classifier.ts (92 lines)
Key exports needing tests:
- `classifyInterruptionFromSignals` — already 2 tests; needs: system_alert, action_sheet, overlay, keyboard_blocking

### interruption-orchestrator.ts (87 lines)
Key exports needing tests:
- `buildResumeCheckpoint` — already 1 test; needs: minimal valid input, partial optional params, `hasStateDrift`

### doctor-runtime.ts (603 lines)
Key exports needing tests:
- `runDoctorWithMaestro` — already 1 test; needs: check status validation (pass/fail/warn), individual check behavior

### diagnostics-pull.ts (336 lines)
Key exports needing tests:
- `boundedRemoteFileRead` — needs mocked executeRunner
- `boundedRemoteFileReadBatch` — needs mocked executeRunner for success paths
- `checkRemoteFileSize` — needs mocked executeRunner
- `parseAnrTraceMetadata` — already well tested

### action-outcome.ts (801 lines)
Key exports needing tests:
- `suggestKnownRemediationWithMaestro` — already 1 test (iOS signature); needs: indexed remediation, blocking signals, network layer, skill-guided paths

### interruption-tools (mcp-server, server-exposed tools)
Tools needing behavioral tests:
- `detect_interruption` — meaningful signal assertion
- `classify_interruption` — classification type assertion
- `resolve_interruption` — resolution status assertion
- `resume_interrupted_action` — checkpoint validation

## Execution Steps

### Step 1: device-runtime-ios.test.ts — Fill empty file
**Source:** `packages/adapter-maestro/src/device-runtime-ios.ts` (641 lines)

Add tests for exported functions only (do NOT test internal functions):
1. `buildIosLogLevelPredicate` — test all 6 log levels + undefined (fault, error, error+default, no-filter, with levelNote)
2. `extractIosSimulatorProcessId` — valid PID extraction, no-match, multi-line input
3. `extractIosPhysicalProcessId` — valid PID extraction, regex-escape for app names with special chars
4. `extractIosPhysicalAppName` — valid app name extraction, no-match
5. `resolveIosAttachTarget` — dispatches to simulator vs physical based on deviceId pattern (requires mocking internal query helpers or using the same fake-xcrun pattern from device-runtime.test.ts)

**NOT testable without shell hooks:** `resolveIosPhysicalAttachTarget`, `resolveIosSimulatorAttachTarget`, `createIosDeviceRuntimeHooks` — these call `executeRunner` directly. These are already partially covered via `device-runtime.test.ts`'s `createIosDeviceRuntimeHooks` tests.

**Approach:** Pure function tests for parsers (items 1-4). Item 5 uses the fake-xcrun script pattern from `device-runtime.test.ts`.

### Step 2: interruption-tools.test.ts — Strengthen trivial assertions
**Source:** `packages/mcp-server/src/index.ts` (server tool handlers — these 4 tools are registered in the server, NOT exported as standalone functions)

**NOTE:** These tools are exposed through the MCP server, not as standalone exports. Tests MUST go through `server.invoke()` — you cannot import `detect_interruption` or similar as a function.

Replace the single smoke test with per-tool behavioral tests:
1. `detect_interruption` — assert `data.signals` is an array with known structure (source, key, value fields), not just `isArray`
2. `classify_interruption` — assert `data.classification.type` is a valid InterruptionType from contracts, not just "string"
3. `resolve_interruption` — assert `data.status` is a known resolution status, and `data.strategy` field exists
4. `resume_interrupted_action` — assert `data.checkpoint` fields are preserved (actionType, selector), not just `typeof === "boolean"`

**Approach:** Keep dryRun mode but assert on specific response field values and structure, not just types. Add one negative test (invalid sessionId → error response).

### Step 3: interruption-classifier.test.ts — Cover missing types
**Source:** `packages/adapter-maestro/src/interruption-classifier.ts` (92 lines)

Add tests for:
1. system_alert detection — signals with "alert" or "dialog" in value
2. action_sheet detection — signals with "sheet" in value or container_role
3. overlay detection — dialog_actions, interrupted signals without permission markers
4. keyboard_blocking detection — keyboard-related signals
5. Score-based priority — verify that higher-score types win when multiple candidates exist
6. Button slots — verify correct button slots for each type

**Approach:** Pure unit tests with synthetic signal arrays.

### Step 4: interruption-orchestrator.test.ts — Additional behavioral tests
**Source:** `packages/adapter-maestro/src/interruption-orchestrator.ts` (87 lines)

**NOTE:** `buildResumeCheckpoint` requires `actionId`, `sessionId`, `platform`, `actionType` — all mandatory. Cannot test "empty input." Test with partial optional params instead.

Add tests for:
1. Minimal valid input (no selector, no args) — verify checkpoint preserves required fields, omits optional ones
2. Partial input with selector but no args — verify selector fields preserved
3. Multi-action context: build two checkpoints from different action types — verify each preserves its actionType
4. iOS platform checkpoint — verify platform field is preserved correctly (no iOS-specific fields expected in checkpoint)
5. `hasStateDrift` — same state returns false, changed appPhase returns true, undefined before/after returns false

**Approach:** Pure unit tests with varying input completeness.

### Step 5: doctor-runtime.test.ts — Verify check statuses
**Source:** `packages/adapter-maestro/src/doctor-runtime.ts` (603 lines)

Strengthen the existing test:
1. Verify each check has a `status` field (pass/warn/fail)
2. Verify `status` values are valid enum values
3. Verify `detail` field is a non-empty string
4. Add test that checks reflect actual environment state (e.g., if node is installed, status should be "pass")

**Approach:** Enhance existing test with deeper assertions; do not add shell dependency.

### Step 6: diagnostics-pull.test.ts — Add test hook + mock executeRunner
**Source:** `packages/adapter-maestro/src/diagnostics-pull.ts` (336 lines)

**IMPORTANT:** This file imports `executeRunner` directly from `./runtime-shared.js` (located in `packages/adapter-maestro/src/runtime-shared.ts`, NOT in core). The test file currently has:
- 1 test with a body that is literally a no-op (empty body with a comment explaining adb won't work)
- 1 test with only `typeof === "function"` assertions
- 6 tests for `parseAnrTraceMetadata` (already good — do NOT touch these)

Prerequisite source change (minimal, ~2 lines):
1. In `diagnostics-pull.ts`, change `import { executeRunner, shellEscape } from "./runtime-shared.js"` to `import { executeRunnerWithTestHooks as executeRunner, shellEscape } from "./runtime-shared.js"`
2. This gives the file a `setExecuteRunnerForTesting` test hook with zero behavior change. The function already exists in `runtime-shared.ts` — verified.

Then add tests:
1. `boundedRemoteFileRead` — mock successful adb shell cat response
2. `boundedRemoteFileReadBatch` — mock successful batch read with 3 files
3. `boundedRemoteFileReadBatch` — mock budget exhaustion (stop after N files)
4. `checkRemoteFileSize` — mock successful adb shell ls response
5. `boundedRemoteFileRead` — mock failure (file not found)
6. Keep existing `parseAnrTraceMetadata` tests (already good)

### Step 7: action-outcome-startup.test.ts — Additional scenarios
**Source:** `packages/adapter-maestro/src/action-outcome.ts` (801 lines)

**NOTE:** `suggestKnownRemediationWithMaestro` gathers remediation from 5 sources: (1) iOS startup phase analysis, (2) indexed remediation from failure index, (3) similar failure hints, (4) baseline divergence hints, (5) skill-guided remediation. Tests must produce evidence that triggers specific attribution paths.

Add tests for:
1. **Indexed remediation path** — persist a failure index entry with remediation text → verify it appears in `remediation` array
2. **Blocking signals path** — write execution evidence with `permission_prompt` or `dialog_actions` in state summary → verify interruption-layer remediation appears
3. **Network layer path** — write execution evidence with `readiness: "offline_terminal"` → verify network-layer remediation appears
4. **Skill-guided remediation path** — set platform + evidence with attribution signals → verify `skillGuidance` field is populated

**Approach:** Mirror existing test pattern (write evidence file + persistActionRecord → suggestKnownRemediationWithMaestro). Use minimal but realistic evidence content to trigger each attribution path.

## Verification

1. `pnpm test:unit` — all existing tests still pass
2. All 7 modified test files pass individually
3. No new type errors (`pnpm build` succeeds)
4. Empty file eliminated: `device-runtime-ios.test.ts` has >0 test bodies
5. Trivial assertions eliminated: no `typeof === "boolean"` or `typeof === "function"` as primary assertions in the 7 files

## Risks

- **diagnostics-pull.ts** requires a source change to use `executeRunnerWithTestHooks` instead of raw `executeRunner`. **Verified:** `executeRunnerWithTestHooks` exists in `packages/adapter-maestro/src/runtime-shared.ts`. The change is ~2 lines (swap import alias). **Fallback:** If the change is rejected during code review, skip `diagnostics-pull.test.ts` tests, file a follow-up issue, and do NOT block the rest of this phase. The source change affects production code and must be code-reviewed separately from the tests.
- **doctor-runtime.ts** checks depend on the actual environment. Tests should assert structural properties (status is valid enum value, detail is non-empty string) rather than environment-specific outcomes.
- **action-outcome.ts** remediation paths depend on evidence file content quality. Tests must produce evidence that triggers specific attribution paths (indexed, blocking signals, network layer, skill-guided).

## Test Quality Gate

Each new test added in this plan must assert on **observable behavior** (output values, state changes, error handling, side effects), not just function invocation or `typeof` checks. If a test can pass when the function body is replaced with a stub, the test is insufficient.

## Formal Truth Owners

- `packages/adapter-maestro/test/device-runtime-ios.test.ts`
- `packages/mcp-server/test/interruption-tools.test.ts`
- `packages/adapter-maestro/test/interruption-classifier.test.ts`
- `packages/adapter-maestro/test/interruption-orchestrator.test.ts`
- `packages/adapter-maestro/test/doctor-runtime.test.ts`
- `packages/adapter-maestro/test/diagnostics-pull.test.ts`
- `packages/adapter-maestro/test/action-outcome-startup.test.ts`
- `docs/testing/test-review-report.md`
