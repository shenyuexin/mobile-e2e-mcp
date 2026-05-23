# Summary: Phase 11 — Diagnostics and Crash Evidence Deepening

**Status:** Completed
**Started on:** 2026-04-06
**Completed on:** 2026-04-06
**Completed by:** OpenCode agent
**Oracle rounds:** 2 (16 fixes round 1 + 7 fixes round 2)

## Goal

Close the gaps in log/crash/diagnostics evidence collection so AI agents receive **complete, AI-consumable crash and ANR evidence** from both Android and iOS without requiring manual file-pull steps.

## Plans Delivered

| Plan | Title | Status | What Changed |
|---|---|---|---|
| 11-04 | Bounded remote-file read utility | ✅ Done | New `diagnostics-pull.ts` with `boundedRemoteFileRead`, `boundedRemoteFileReadBatch`, `checkRemoteFileSize`, `parseAnrTraceMetadata` |
| 11-01 | Pull Android ANR trace content | ✅ Done | `device-runtime-android.ts` now pulls actual ANR trace content via `adb shell cat | head -N` (primary) + `adb pull` (fallback) |
| 11-02 | iOS physical-device crash log collection | ✅ Done | `device-runtime-ios.ts` now has 3-tier fallback: `devicectl` → `idevicecrashreport` → `idevicesyslog` |
| 11-03 | Structured crash attribution summary | ✅ Done | New `crash-attribution.ts` with `buildCrashAttribution`, `detectCrashTypes`, `selectPrimaryCrashType` |

## What Was Done

### 11-04: Bounded Remote-File Read Utility
- Created `packages/adapter-maestro/src/diagnostics-pull.ts`
- `boundedRemoteFileRead`: Primary path `adb shell "cat <escaped> | head -N"`, fallback `adb pull` with timeout + size guardrails
- `boundedRemoteFileReadBatch`: Sequential execution with dynamic remaining budget
- `checkRemoteFileSize`: 3-level fallback (`stat -c %s` → `wc -c < file` → `cat | wc -c`)
- All shell-interpolated paths use `shellEscape` from `runtime-shared.ts`
- `executeRunner` used directly (no new wrapper; `exitCode: null` = timeout)
- Default limits: 20,000 lines, 80MB max file size, 60s timeout, 180s total batch budget

### 11-01: Android ANR Trace Content
- Changed `ls -1` → `ls -1t` for recency ordering
- Added private `pullAndParseAnrTraces` function using `boundedRemoteFileReadBatch`
- ANR parser extracts `processName`, `pid`, `signal` (no over-structured thread states)
- `CrashSignalExecutionResult` extended with `platformExtensions?: Record<string, unknown>`
- ANR content now appears in `get_crash_signals` response as structured sections

### 11-02: iOS Physical-Device Crash Log Collection
- Added private `collectIosPhysicalCrashSignals` with 3-tier fallback:
  - Tier 1: `xcrun devicectl device info crashes` (Xcode 14+, no extra deps)
  - Tier 2: `idevicecrashreport -k <dir>` (libimobiledevice)
  - Tier 3: `idevicesyslog` (bounded via timeout, date filtering in post-processing)
- Each tier has explicit success/failure/no-data semantics
- `missingToolingAdvice` guides user when tools are not installed
- `appId` filtering per tier
- iOS crash report parser extracts: process name, exception type, crashed thread frames

### 11-03: Structured Crash Attribution
- Created `packages/adapter-maestro/src/crash-attribution.ts`
- `detectCrashTypes` returns `CrashType[]` (supports hybrid: ANR + native_crash, etc.)
- `selectPrimaryCrashType` with explicit priority: anr > native_crash > watchdog > oom > uncaught_exception > unknown
- `buildCrashAttribution` with cheap pre-check guard (skips when no crash signals)
- Added `CrashAttribution` and `CrashType` to `packages/contracts/src/types.ts`
- `get_crash_signals` response now includes optional `crashAttribution` field
- `content` field remains human-readable (backward compatible)

## Key Decisions Made

1. **`adb shell cat` as primary path** (not `adb pull`) — works on more device types including production user builds
2. **`shellEscape` for all shell-interpolated paths** — prevents shell injection from malicious filenames
3. **Platform-specific types kept private** — `AnrTraceResult` in `device-runtime-android.ts`, `IosPhysicalCrashResult` in `device-runtime-ios.ts`; shared interface uses `platformExtensions?: Record<string, unknown>` bag
4. **80MB max file size, 60s timeout, 180s total budget** — based on user's real-world observation of ~100MB log files
5. **`crash-attribution.ts` separate from `action-outcome.ts`** — different input domain (raw crash logs vs session/action metadata)

## Deviations from Plan

- `idevicesyslog` does not support `--timestamp` flag in most versions — bounded via timeout only, date filtering in post-processing
- Level 3 size check (`cat | wc -c`) is O(n) — documented as best-effort, expected to timeout for large files

## Open Issues

- iOS `devicectl device info crashes` JSON format needs real-device validation
- ANR thread state parsing deferred to future phase
- `platformExtensions: Record<string, unknown>` sacrifices compile-time type safety (documented, future refinement possible)

## Evidence

- `pnpm typecheck`: All packages pass
- `pnpm test -- crash-attribution`: 8/8 pass
- `pnpm test -- diagnostics-pull`: 6/6 pass
- Full test suite: 322 tests pass, 0 fail (adapter-maestro package)
