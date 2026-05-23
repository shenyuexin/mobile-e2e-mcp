# Summary: Phase 12 — Action-Integrated Crash Attribution and Log Filtering

**Status:** Partially Completed (6 of 10 sub-plans implemented)
**Started on:** 2026-04-06
**Completed on:** 2026-04-06
**Completed by:** OpenCode agent

## Goal

Make crash attribution automatic (not manual) in action outcomes, add log severity-level filtering, fix iOS syslog semantics, parallelize size checks, extract shared utilities, fix silent error swallowing, and reduce type casting.

## Plans Delivered

| Plan | Title | Status | What Changed |
|---|---|---|---|
| 12-01 | Auto-attach crash attribution to action outcomes | ✅ Done | crashAttribution passthrough in GetScreenSummaryData, GetSessionStateData, PerformActionWithEvidenceData |
| 12-02 | Add minLogLevel to get_logs | ✅ Done | Android `*:E` filter, iOS lossy mapping with platformLevelNote |
| 12-03 | Fix iOS syslog Tier 3 semantics | ✅ Done | Removed idevicesyslog, added fallbackErrors array |
| 12-04 | Parallelize size checks in batch | ✅ Done | Concurrency cap 3, knownFileSize optimization, small-first ordering |
| 12-05a | Create shared utility modules | ⏸ Deferred | Large refactoring scope; deferred to future phase |
| 12-05b | Migrate consumers to shared utilities | ⏸ Deferred | Depends on 12-05a |
| 12-06a | Fix empty catch {} in recording-store.ts | ✅ Done | Malformed line counting + console.warn |
| 12-06b | Add observability to tier fallback errors | ✅ Superseded by 12-03 | fallbackErrors added in 12-03 |
| 12-07 | Move inline types to contracts | ✅ Done | ListDevicesData, EndSessionData moved from server.ts to contracts |
| 12-08 | Reduce any/unknown casting | ✅ Partial | Added documentation comment to unavoidable cast |

## What Was Done

### 12-01: Auto-Attach Crash Attribution
- Added `crashAttribution?: CrashAttribution` to `GetScreenSummaryData` (contracts)
- Added `crashAttribution?: CrashAttribution` to `GetSessionStateData` (contracts)
- Added `crashAttribution?: CrashAttribution` to `PerformActionWithEvidenceData` (contracts)
- Updated `getScreenSummaryWithMaestro` to pass through `crashResult.data.crashAttribution`
- Updated `getSessionStateWithMaestro` to pass through `screenSummaryResult.data.crashAttribution`
- Updated `action-orchestrator.ts` return data to include `crashAttribution` from post-state result

### 12-02: Log Severity-Level Filtering
- Added `minLogLevel?: "V" | "D" | "I" | "W" | "E" | "F"` to `GetLogsInput`
- Added `actualLevelFilterApplied?: boolean` and `platformLevelNote?: string` to `GetLogsData`
- Android: adds `*:E` filter suffix to `adb logcat` command
- iOS: `buildIosLogLevelPredicate()` maps levels with documented lossy mapping
  - F → `messageType == 'fault'` (exact)
  - E → `messageType == 'error'` (exact)
  - W → `messageType == 'error' OR messageType == 'default'` (approximate)
  - I/D/V → no filter (iOS limitation, documented via `platformLevelNote`)

### 12-03: iOS Tier 3 Removal + fallbackErrors
- Removed `tryIdeviceSyslogTail` function (streaming log tool, not crash query)
- Added `fallbackErrors?: Array<{ tier: string; error: string }>` to `IosPhysicalCrashResult`
- Captures caught errors from Tier 1 and Tier 2 before falling through
- Clear `missingToolingAdvice` when both tiers fail
- `IosPhysicalCrashResult.tier` type changed from `"devicectl" | "idevicecrashreport" | "idevicesyslog"` to `"devicectl" | "idevicecrashreport"`

### 12-04: Parallel Size Checks
- Added `knownFileSize?: number` to `BoundedReadOptions`
- `boundedRemoteFileReadBatch` now does:
  - Phase 1: Parallel size checks with concurrency cap of 3 (batched `Promise.allSettled`)
  - Phase 2: Filter and sort small-first for budget efficiency
  - Phase 3: Sequential reads with pre-known sizes (skips internal size check)
- Extracted `doAdbPull()` helper to eliminate code duplication
- `boundedAdbPullFallback` skips size check when `knownFileSize` is provided

### 12-06a: Fix Empty Catch
- `recording-store.ts:174` empty `catch {}` replaced with `malformedLineCount` counter + `console.warn`

### 12-07: Move Inline Types
- `ListDevicesData` and `EndSessionData` moved from `server.ts` to `contracts/types.ts`
- Exported from contracts index
- Imported in server.ts instead of local definitions

### 12-08: Reduce Casting (Partial)
- Added documentation comment explaining why `as unknown as Record<string, unknown>` is unavoidable

## Key Decisions Made

1. **Only passthrough `crashAttribution`, not `crashContent`** — avoids bloating high-frequency screen-summary responses with megabyte-sized text blobs
2. **iOS log level mapping is lossy by design** — documented with `platformLevelNote` for transparency
3. **Parallel size check concurrency capped at 3** — prevents overwhelming adb connection
4. **Small-first file ordering** — maximizes number of successful reads within budget (return order differs from input)

## Open Issues

- 12-05a/b (shared utility extraction) — deferred; touches 10+ files across 4 packages
- 12-08 (type casting reduction) — partial; the `as unknown as` pattern is a TypeScript limitation for generic function types in maps
- `devicectl device info crashes` JSON format needs real-device validation

## Evidence

- `pnpm typecheck`: All packages pass
- `pnpm test adapter-maestro`: 337/337 pass
- `pnpm test core`: 7/7 pass
- 2 commits: `a03df0e` (12-01, 12-02, 12-03, 12-06a), `3095f28` (12-04, 12-07, 12-08)
