---
phase: 11-diagnostics-and-crash-evidence-deepening
verify_type: internal-code
verified_on: 2026-04-06
---

# Verify: Phase 11 — Diagnostics and Crash Evidence Deepening

## Goal-Backward Check

**Phase Goal:** Close the gaps in log/crash/diagnostics evidence collection so AI agents receive complete, AI-consumable crash and ANR evidence from both Android and iOS without requiring manual file-pull steps.

### 1. Android ANR trace content is pulled (not filename-only)
- [x] `device-runtime-android.ts` contains `pullAndParseAnrTraces` as private function
- [x] Primary path uses `adb shell "cat <escaped> | head -N"` (not `adb pull`)
- [x] `adb pull` is fallback when `cat` fails
- [x] `ls -1t` used instead of `ls -1` (recency ordering)
- [x] ANR content appears in `get_crash_signals` response
- Result: PASS

### 2. iOS physical-device crash log collection exists
- [x] `device-runtime-ios.ts` contains `collectIosPhysicalCrashSignals` as private function
- [x] Tier 1 (`devicectl`) attempted first
- [x] Tier 2 (`idevicecrashreport`) attempted only if tier 1 unavailable
- [x] Tier 3 (`idevicesyslog`) bounded via timeout
- [x] `missingToolingAdvice` guides user if all tiers fail
- [x] Existing simulator path unchanged
- Result: PASS

### 3. Structured crash attribution summary exists
- [x] `crash-attribution.ts` is a new file (not in `action-outcome.ts`)
- [x] `CrashAttribution` interface in `packages/contracts/src/types.ts`
- [x] `buildCrashAttribution` has cheap pre-check guard
- [x] `detectCrashTypes` returns `CrashType[]` (hybrid support)
- [x] `selectPrimaryCrashType` uses explicit priority ordering
- [x] `get_crash_signals` response includes `crashAttribution` field
- [x] `content` field remains human-readable (backward compatible)
- [x] Existing `buildLogSummary` unchanged
- Result: PASS

### 4. Bounded remote-file read utility exists
- [x] `diagnostics-pull.ts` exports `boundedRemoteFileRead`, `boundedRemoteFileReadBatch`, `checkRemoteFileSize`
- [x] `shellEscape` used for all shell-interpolated paths
- [x] `executeRunner` used directly (no `executeWithTimeout`)
- [x] Batch propagates remaining budget to individual calls
- [x] Temp files cleaned up in `finally` for all error paths
- [x] Unit tests cover all status cases + size check levels
- Result: PASS

### 5. `CrashSignalExecutionResult` extended safely
- [x] `platformExtensions?: Record<string, unknown>` added (backward-compatible)
- [x] No breaking changes to existing fields
- Result: PASS

### 6. Code quality
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (322 tests, 0 fail in adapter-maestro)
- [x] No changes to `executeRunner` or `runtime-shared.ts` behavior
- Result: PASS

## Requirement Coverage

- No milestone requirement IDs were mapped to this phase.

## Open Gaps

- iOS `devicectl device info crashes` JSON format needs real-device validation
- ANR thread state parsing deferred to future phase
- `platformExtensions: Record<string, unknown>` sacrifices compile-time type safety

## Decision

- Overall status: PASS
- Ready to archive: YES
