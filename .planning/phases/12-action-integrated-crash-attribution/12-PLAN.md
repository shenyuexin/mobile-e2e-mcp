# Phase 12: Action-Integrated Crash Attribution and Log Filtering

**Phase Number:** 12
**Status:** Planned
**Created:** 2026-04-06
**Depends on:** Phase 11 (crash attribution foundation: `crash-attribution.ts`, `diagnostics-pull.ts`, `platformExtensions`)

---

## Goal

Make crash attribution automatic (not manual) in action outcomes, add log severity-level filtering, and fix edge cases discovered during Phase 11 implementation.

## Problem Statement

Phase 11 delivered the crash attribution infrastructure, but there are 4 integration gaps:

1. **`performActionWithEvidence` captures `crashSummary` but never calls `buildCrashAttribution`** — AI agent gets `preCrashSummary`/`postCrashSummary` (both `LogSummary` — just line counts + signal buckets) but no structured `CrashAttribution`. The agent must discover failure → manually call `get_crash_signals` → manually parse. This is 3 steps when it should be 0.

2. **`get_logs` has no severity filtering** — `GetLogsInput` supports `lines` and `sinceSeconds` but not `minLogLevel`. After a 5-minute E2E run, pulling logcat returns thousands of INFO/DEBUG lines. 95% is noise.

3. **iOS syslog Tier 3 is misleading** — `tryIdeviceSyslogTail` streams `idevicesyslog` with a 5s timeout. `idevicesyslog` is a streaming log tool, not a crash query tool. 5s is unlikely to capture meaningful crash data. This tier gives false confidence.

4. **`boundedRemoteFileReadBatch` size checks are sequential** — 3 files × 5s size check = 15s worst case. Size checks are independent reads and can be parallelized.

## Architecture Overview

### Current Data Flow (Problem 1)

```
performActionWithEvidenceWithMaestro
   │
   ├─ preAction: getScreenSummary → preStateResult
   │    └─ preStateResult.data.crashSummary: LogSummary  ← just line counts
   │
   ├─ execute action
   │
   ├─ postAction: getScreenSummary → postStateResult
   │    └─ postStateResult.data.crashSummary: LogSummary  ← just line counts
   │
   └─ Build outcome:
        {
          outcome: { status: "failed", failureCategory: "crashed" },
          evidenceDelta: { preCrashSummary, postCrashSummary },  ← LogSummary only
          // NO CrashAttribution!
        }
```

### Target Data Flow (after 12-01)

```
performActionWithEvidenceWithMaestro
   │
   ├─ ... (same pre/post capture)
   │
   └─ IF postStateResult.data.crashSummary has crash signals:
        └─ buildCrashAttribution(postStateResult.data.crashContent, platform)
             └─ outcome.crashAttribution: CrashAttribution  ← structured!
```

---

## Plan 12-01: Auto-Attach Crash Attribution to Action Outcomes

### Scope

In `action-orchestrator.ts`, after the post-state capture, if crash signals are detected, automatically call `buildCrashAttribution` and include it in the action outcome. This requires a prerequisite change: `GetScreenSummaryData` must pass through the `crashAttribution` from its internal `getCrashSignals` call.

### Critical Finding (Oracle C2): `crashContent` Does Not Exist

The original plan incorrectly assumed `postStateResult?.data.crashContent` exists. After auditing the actual code:

- `GetScreenSummaryData` (contracts line 975) has `crashSummary?: LogSummary` (line-count-based signal summary) but NO `crashContent` and NO `crashAttribution`.
- `getScreenSummaryWithMaestro` internally calls `getCrashSignalsWithMaestro` which returns `crashAttribution` (from Phase 11), but this is NOT passed through to the return data (session-state.ts line 532-546).
- `PerformActionWithEvidenceData` (contracts line 1050) has `preStateSummary` and `postStateSummary` of type `StateSummary`, which has NO crash-related fields.

### Corrected Design

This plan now has **two dependent changes**:

#### Step 1A: Pass `crashAttribution` through `GetScreenSummaryData` (prerequisite)

**Design constraint (Review fix):** Only passthrough the structured `CrashAttribution` — do NOT include raw `crashContent` in `GetScreenSummaryData`. The screen-summary endpoint is a high-frequency call; adding a potentially megabyte-sized text blob would bloat every response. Instead, the raw `content` stays accessible via the existing artifact path (`crashResult.artifacts`), and `crashAttribution` provides the structured summary AI agents actually need.

**File:** `packages/contracts/src/types.ts`
```typescript
export interface GetScreenSummaryData {
  // ... existing fields
  crashSummary?: LogSummary;
  /** Crash attribution from internal getCrashSignals call (Phase 11). Only present when crash signals detected. */
  crashAttribution?: CrashAttribution;
  // NO crashContent — raw text stays accessible via artifact path to avoid payload bloat
}
```

**File:** `packages/adapter-maestro/src/session-state.ts` (line ~543)
```typescript
data: {
  // ...
  crashSummary: crashResult?.data.summary,
  crashAttribution: crashResult?.data.crashAttribution,
  // NO crashContent — use artifacts for raw text
},
```

#### Step 1B: Attach crash attribution to action outcome

**Design constraint (Review fix):** Since `crashContent` is NOT passed through `GetScreenSummaryData` (see Step 1A), the action outcome relies entirely on the pre-built `crashAttribution` from `getCrashSignalsWithMaestro` (Phase 11 already does this). No inline `buildCrashAttribution` call is needed — the attribution is already built at the source and simply passed through.

**File:** `packages/adapter-maestro/src/action-orchestrator.ts` (after line ~793, in the return block)

```typescript
// In the return data object:
const crashAttribution = postStateResult?.data.crashAttribution;

return {
  // ... existing fields
  data: {
    // ... existing fields
    crashAttribution,  // NEW: only present when crash signals detected
  },
};
```

**File:** `packages/contracts/src/types.ts`
```typescript
export interface PerformActionWithEvidenceData {
  // ... existing fields
  /** Structured crash attribution from post-action state. Only present when crash signals detected. */
  crashAttribution?: CrashAttribution;
}
```

### Implementation Steps

1. Add `crashAttribution?: CrashAttribution` to `GetScreenSummaryData` in contracts (NO `crashContent`)
2. Update `getScreenSummaryWithMaestro` in `session-state.ts` to pass through `crashResult.data.crashAttribution`
3. Add `crashAttribution?: CrashAttribution` to `PerformActionWithEvidenceData` in contracts
4. Also add `crashAttribution?: CrashAttribution` to `GetSessionStateData` in contracts for consistency (Review fix #2)
5. Attach `crashAttribution` to action outcome from `postStateResult.data.crashAttribution` (pre-built, no inline call needed)
6. Add test: action failure with crash → `crashAttribution` present
7. Add test: action success → `crashAttribution` absent
8. Add test: `get_session_state` with crash signals → `crashAttribution` present

### Acceptance Criteria

- [ ] `GetScreenSummaryData` has `crashAttribution` optional field (NO `crashContent`)
- [ ] `getScreenSummaryWithMaestro` passes through `crashResult.data.crashAttribution`
- [ ] `GetSessionStateData` has `crashAttribution` optional field (for consistency with action outcomes)
- [ ] `PerformActionWithEvidenceData` has `crashAttribution` optional field
- [ ] `performActionWithEvidence` returns `crashAttribution` when post-state has crash signals
- [ ] `crashAttribution` is absent (undefined) when no crash signals
- [ ] `get_session_state` returns `crashAttribution` when session has crash signals
- [ ] Tests: action failure with ANR content → `crashAttribution.primaryCrashType === "anr"`
- [ ] Tests: action success → `crashAttribution` is undefined
- [ ] Existing tests unchanged (backward compatible)

---

## Plan 12-02: Add Severity-Level Log Filtering

### Scope

Add `minLogLevel` to `GetLogsInput` so AI agents can request only ERROR/FATAL level logs, reducing noise by 90%+ in typical E2E runs.

### Design

**Files to modify:**
- `packages/contracts/src/types.ts` — add `minLogLevel` to `GetLogsInput`
- `packages/adapter-maestro/src/device-runtime-android.ts` — apply log level filter to adb command
- `packages/adapter-maestro/src/device-runtime-ios.ts` — apply log level filter to simctl predicate
- `packages/adapter-maestro/src/device-runtime.ts` — pass through to platform hooks

**New contract field:**
```typescript
export interface GetLogsInput {
  // ... existing fields
  /** Minimum log level to include. Android: V/D/I/W/E/F. iOS: mapped to predicate. Default: include all. */
  minLogLevel?: "V" | "D" | "I" | "W" | "E" | "F";
}
```

**Android implementation:**
```typescript
// buildGetLogsCapturePlan
const levelFilter = minLogLevel ? `*:${minLogLevel}` : undefined;
const command = [
  "adb", "-s", deviceId, "logcat",
  ...(pid ? ["--pid", pid] : []),
  "-d", "-t", String(linesRequested ?? 200),
  ...(levelFilter ? [levelFilter] : []),  // e.g., "*:E"
];
```

**iOS implementation:**
```typescript
// applyGetLogsAppFilter (iOS)
const levelPredicate = minLogLevel === "E" || minLogLevel === "F"
  ? ` AND messageType == 'error'`
  : minLogLevel === "W"
    ? ` AND (messageType == 'error' OR messageType == 'default')`
    : "";
const command = [
  "xcrun", "simctl", "spawn", deviceId, "log", "show",
  "--style", "compact", "--last", `${sinceSeconds}s`,
  "--predicate", `${appPredicate}${levelPredicate}`,
];
```

### Implementation Steps

1. Add `minLogLevel` to `GetLogsInput` in `contracts/types.ts`
2. Update `buildGetLogsCapturePlan` in `device-runtime-android.ts` to add `*:<level>` filter
3. Update `applyGetLogsAppFilter` in `device-runtime-ios.ts` to add messageType predicate
4. Update `getLogsWithRuntime` in `device-runtime.ts` to pass `minLogLevel` to hooks
5. Add tests: `minLogLevel: "E"` → only ERROR lines returned
6. Add tests: `minLogLevel: "F"` → only FATAL lines returned
7. Dry-run mode returns correct command with filter

### Acceptance Criteria

- [ ] `minLogLevel` field on `GetLogsInput` accepts "V" | "D" | "I" | "W" | "E" | "F"
- [ ] Android: `minLogLevel: "E"` adds `*:E` filter to adb logcat command
- [ ] iOS: `minLogLevel: "E"` adds `messageType == 'error'` to simctl predicate
- [ ] Default behavior (no `minLogLevel`) unchanged — returns all levels
- [ ] `minLogLevel` works with `appId` filtering (both filters applied)
- [ ] Dry-run returns correct command showing the filter
- [ ] iOS: `minLogLevel: "I"` returns all levels with `actualLevelFilterApplied: false` and `platformLevelNote` explaining the limitation
- [ ] Acceptance criteria are per-platform consistent, NOT cross-platform equivalent
- [ ] Tests added for each level on Android

---

## Plan 12-03: Fix iOS Syslog Tier 3 Semantics

### Scope

`tryIdeviceSyslogTail` in `device-runtime-ios.ts` uses `idevicesyslog` as a crash fallback, but this is semantically wrong — `idevicesyslog` is a streaming log tool, not a crash query tool. Fix by removing Tier 3 or clearly documenting its limitation.

### Design

**Current code (`device-runtime-ios.ts`, line ~385):**
```typescript
async function tryIdeviceSyslogTail(repoRoot: string, deviceId: string, appId?: string): Promise<IosPhysicalCrashResult> {
  const execution = await executeRunner(
    ["idevicesyslog", "--udid", deviceId],
    repoRoot, process.env, { timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS },
  );
  // ... filters for crash keywords
}
```

**Problem:** `idevicesyslog` streams continuously until killed. With 5s timeout, it may capture nothing useful. Even if it captures logs, crash reports are NOT in syslog — they're in the device's crash report store (which Tier 1 and Tier 2 already cover).

**Fix options:**

**Option A (preferred): Remove Tier 3 entirely**
- If Tier 1 (devicectl) and Tier 2 (idevicecrashreport) both fail, return a clear "no crash data available" result
- `missingToolingAdvice` should tell user: "Install Xcode 14+ for devicectl, or `brew install libimobiledevice` for idevicecrashreport"
- No false confidence from streaming syslog

**Option B: Keep Tier 3 but document clearly**
- Rename `tryIdeviceSyslogTail` → `tryIdeviceSyslogScan`
- Increase timeout to 10s (still bounded)
- Add comment: "This is a best-effort scan of recent syslog, NOT a crash report query. Full crash reports require Tier 1 or Tier 2."
- Set `supportLevel: "none"` for syslog results (honest reporting)

**Decision: Option A** — Remove Tier 3. Streaming syslog for crash reports is not actionable. The error message should guide users to install the right tools.

### Implementation Steps

1. Remove `tryIdeviceSyslogTail` function from `device-runtime-ios.ts`
2. Update `collectIosPhysicalCrashLogs` to capture caught errors from Tier 1 and Tier 2 into a `fallbackErrors` array (Review fix #4 — moved from 12-06b)
3. Return clear `missingToolingAdvice` when both Tier 1 and Tier 2 fail
4. Add `fallbackErrors?: Array<{ tier: string; error: string }>` to `IosPhysicalCrashResult`
5. Update `IosPhysicalCrashResult` tier type to remove `"idevicesyslog"`
6. Update tests: no more Tier 3 test cases; add test for `fallbackErrors` capture
7. Update `12-06b` plan to note that Tier 3 removal already handles the tier fallback observability

### Acceptance Criteria

- [ ] `collectIosPhysicalCrashLogs` no longer attempts `idevicesyslog` as Tier 3
- [ ] When both Tier 1 and Tier 2 fail, returns clear `missingToolingAdvice`
- [ ] `missingToolingAdvice` mentions both: Xcode 14+ devicectl and `brew install libimobiledevice`
- [ ] `IosPhysicalCrashResult` has `fallbackErrors?: Array<{ tier: string; error: string }>` — populated when intermediate tiers fail (Review fix #4)
- [ ] `IosPhysicalCrashResult` tier type no longer includes `"idevicesyslog"`
- [ ] Existing Tier 1 and Tier 2 tests unchanged
- [ ] New test: both tiers unavailable → clear guidance returned
- [ ] New test: Tier 1 fails, Tier 2 succeeds → `fallbackErrors` contains Tier 1 error

---

## Plan 12-04: Parallelize Size Checks in Batch Read

### Scope

In `boundedRemoteFileReadBatch`, size checks for multiple files are sequential (3 files × 5s = 15s worst case). Size checks are independent reads — parallelize them.

**Clarification (Oracle C1 fix):** `checkRemoteFileSize` IS already exported from `diagnostics-pull.ts` (line 157). The current `boundedRemoteFileRead` calls it internally within `boundedAdbPullFallback`. This plan adds a parallel pre-fetch phase and passes pre-fetched sizes to skip redundant internal checks.

### Design

**File to modify:** `packages/adapter-maestro/src/diagnostics-pull.ts`

**Step 1: Add `knownFileSize` to `BoundedReadOptions`**

```typescript
export interface BoundedReadOptions {
  // ... existing fields
  /** Pre-known file size in bytes. If provided, skips internal size check. */
  knownFileSize?: number;
}
```

**Step 2: Modify `boundedAdbPullFallback` to use pre-known size**

```typescript
async function boundedAdbPullFallback(params: {
  // ... existing params
  knownFileSize?: number;
}): Promise<BoundedReadResult> {
  // If size is pre-known, skip the size check
  if (params.knownFileSize !== undefined) {
    if (params.knownFileSize > DEFAULT_MAX_FILE_SIZE_BYTES) {
      return { content: "", status: "too_large", readMethod: "adb_pull", bytesRead: 0, durationMs: 0 };
    }
    // Proceed directly to pull without size check
    return doAdbPullWithTimeout(params);
  }
  // Existing size check logic (unchanged)
  // ...
}
```

**Step 3: Add parallel pre-fetch to batch function**

```typescript
export async function boundedRemoteFileReadBatch(
  repoRoot: string,
  params: {
    deviceId: string;
    remotePaths: string[];
    maxFiles?: number;
    maxLines?: number;
    totalBudgetMs?: number;
    timeoutMs?: number;
  },
): Promise<BoundedReadResult[]> {
  const startTime = Date.now();
  const totalBudget = params.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const maxFiles = params.maxFiles ?? 3;
  const paths = params.remotePaths.slice(0, maxFiles);

  // Phase 1: Parallel size checks (concurrency capped at 3; Review fix #5)
  const sizeCheckBudget = Math.min(5000, totalBudget * 0.2);
  const sizeResults: Array<PromiseSettledResult<{ remotePath: string; size: FileSizeResult }>> = [];
  for (let i = 0; i < paths.length; i += 3) {
    const batch = paths.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map(async (remotePath) => {
        const size = await checkRemoteFileSize(params.deviceId, remotePath, sizeCheckBudget);
        return { remotePath, size };
      }),
    );
    sizeResults.push(...batchResults);
  }

  // Phase 2: Filter and sort (small-first for budget efficiency; Oracle D2: this is configurable via future `sortOrder` param)
  const elapsed = Date.now() - startTime;
  const remainingBudget = totalBudget - elapsed;

  const eligiblePaths = sizeResults
    .filter((r): r is PromiseFulfilledResult<{ remotePath: string; size: FileSizeResult }> => r.status === "fulfilled")
    .filter((r) => r.value.size !== "not_found" && r.value.size !== "too_large")
    .sort((a, b) => {
      const sizeA = typeof a.value.size === "number" ? a.value.size : Infinity;
      const sizeB = typeof b.value.size === "number" ? b.value.size : Infinity;
      return sizeA - sizeB;  // Small-first: maximize number of successful reads within budget
    });

  // Phase 3: Sequential reads with budget, passing pre-known sizes
  const results: BoundedReadResult[] = [];
  for (const { remotePath, size } of eligiblePaths) {
    if (Date.now() - startTime >= totalBudget) break;
    const result = await boundedRemoteFileRead(repoRoot, {
      deviceId: params.deviceId,
      remotePath,
      maxLines: params.maxLines,
      timeoutMs: Math.min(params.timeoutMs ?? DEFAULT_TIMEOUT_MS, totalBudget - (Date.now() - startTime)),
      allowPullFallback: true,
      knownFileSize: typeof size === "number" ? size : undefined,
    });
    results.push(result);
  }

  return results;
}
```

### Acceptance Criteria

- [ ] `BoundedReadOptions` has optional `knownFileSize` field
- [ ] `boundedAdbPullFallback` skips internal size check when `knownFileSize` is provided
- [ ] `boundedRemoteFileReadBatch` runs size checks in parallel via `Promise.allSettled`
- [ ] Size check budget capped at 20% of total budget (max 5s)
- [ ] Parallel size checks use concurrency cap of 3 (not unlimited Promise.allSettled)
- [ ] Files sorted by size ascending (small-first) before sequential reads (return order differs from input order — documented behavior)
- [ ] Pre-known size passed to `boundedRemoteFileRead` for each file
- [ ] Test: 3 parallel size checks complete within single timeout (not 3×)
- [ ] Test: `knownFileSize` skips internal size check
- [ ] Existing sequential read tests pass (backward compatible)

---

## Risk Analysis

| Risk | Impact | Mitigation |
|---|---|---|
| `buildCrashAttribution` in action outcome adds latency | Low | Cheap pre-check returns `undefined` in <1ms when no crash signals |
| `minLogLevel` filter breaks on older Android versions | Medium | Document as requiring Android 8.0+ (logcat `*:<level>` has been stable since API 24) |
| Removing Tier 3 leaves some devices with no crash path | Low | Tier 1 (devicectl) works on all Xcode 14+ devices; Tier 2 covers older macOS |
| Parallel size checks may hit adb connection limits | Low | 3 parallel connections to the same device via adb is well within limits |

## Verification Strategy

1. **Unit tests**: Mock `buildCrashAttribution` in action orchestrator, verify it's called with correct content
2. **Integration test**: Run action that triggers ANR → verify `crashAttribution` in outcome
3. **Log filtering test**: Set `minLogLevel: "E"` → verify only ERROR lines returned
4. **Tier 3 removal test**: Both Tier 1 and Tier 2 unavailable → verify clear guidance returned
5. **Parallel size check test**: Mock 3 size checks → verify they run concurrently via timing assertion

## Files Changed Summary

| File | Change Type | Plan |
|---|---|---|
| `packages/adapter-maestro/src/action-orchestrator.ts` | Modify (import buildCrashAttribution, add to outcome) | 12-01 |
| `packages/contracts/src/types.ts` | Modify (add `minLogLevel` to GetLogsInput, `crashAttribution` to PerformActionWithEvidenceData) | 12-01, 12-02 |
| `packages/adapter-maestro/src/device-runtime-android.ts` | Modify (add log level filter) | 12-02 |
| `packages/adapter-maestro/src/device-runtime-ios.ts` | Modify (add log level predicate, remove Tier 3) | 12-02, 12-03 |
| `packages/adapter-maestro/src/device-runtime.ts` | Modify (pass minLogLevel through) | 12-02 |
| `packages/adapter-maestro/src/diagnostics-pull.ts` | Modify (parallel size checks in batch) | 12-04 |
| `packages/adapter-maestro/test/action-orchestrator.test.ts` | Modify (add crash attribution tests) | 12-01 |
| `packages/adapter-maestro/test/device-runtime.test.ts` | Modify (add log level tests) | 12-02 |
| `packages/adapter-maestro/test/device-runtime-ios.test.ts` | Modify (remove Tier 3 tests, add guidance test) | 12-03 |
| `packages/adapter-maestro/test/diagnostics-pull.test.ts` | Modify (add parallel size check test) | 12-04 |

## Oracle Pre-Review Notes (from Phase 11 retrospective)

1. **Interface safety**: New fields on `GetLogsInput` and `PerformActionWithEvidenceData` are optional (`?`) — backward compatible
2. **Test coverage**: Each plan adds tests for the new behavior AND verifies existing behavior unchanged
3. **Tier 3 removal**: This is a breaking change for any code that depends on `tier: "idevicesyslog"` being returned — audit callers

## Additional Optimization Opportunities (from Codebase Audit)

### 12-05a: Create Shared Utility Modules (High Impact, Low Complexity)

**Scope:** Create and test the shared modules WITHOUT migrating consumers.

**Plan:**
1. Create `packages/core/src/guards.ts` — `isRecord`, `readNonEmptyString`, `readPositiveNumber`, `readStringArray`
2. Create `packages/core/src/fs-utils.ts` — `atomicWriteJson<T>(path: string, data: T): Promise<void>`, `bestEffortCleanup(fn: () => Promise<unknown>): Promise<void>`
3. Add comprehensive tests for both modules
4. Verify `packages/core/package.json` exports both new modules
5. Verify typecheck passes for all packages that will import these

**Acceptance:**
- [ ] `guards.ts` exports match all 10 existing `isRecord` signatures
- [ ] `fs-utils.ts` atomicWriteJson produces identical output to existing 5 copies
- [ ] All new tests pass
- [ ] `packages/core` exports updated

### 12-05b: Migrate Consumers to Shared Utilities (High Impact, Medium Complexity)

**Scope:** Replace all duplicated copies with imports from shared modules. Migrate in waves with verification between waves.

**Wave 1: `packages/core/src/` (5 files — `writeJsonFile` pattern)**
- `device-lease-store.ts`, `failure-memory-store.ts`, `session-record-store.ts`, `recording-store.ts`, `action-record-store.ts`
- Verify: `pnpm test -- core` passes

**Wave 2: `packages/adapter-maestro/src/` (5+ files — `isRecord`, `readNonEmptyString`)**
- `harness-config.ts`, `ui-model.ts`, `replay-step-planner.ts`, `action-orchestrator-model.ts`
- Verify: `pnpm test -- adapter-maestro` passes

**Wave 3: `packages/mcp-server/src/` + `scripts/` (2+ files — `isRecord`)**
- `tools/persist-session-evidence.ts`, `scripts/validate-phase3-samples.ts`
- Verify: `pnpm test -- mcp-server` passes

**Rollback Plan:** If any wave breaks tests, revert that wave's commits only. Previous waves remain intact.

**Acceptance:**
- [ ] All 15+ copies replaced with imports from shared modules
- [ ] All package tests pass after each wave
- [ ] No runtime behavior changes (atomic write produces identical output)

### 12-06a: Fix Empty catch in recording-store.ts (High Impact, Low Complexity)

**Finding:** Empty `catch {}` in `packages/core/src/recording-store.ts:174` — `JSON.parse` in line-by-line loop silently drops malformed events with zero observability. This is silent data loss during event replay.

**Fix:**
```typescript
// Before:
} catch {}

// After:
} catch {
  malformedLineCount += 1;
}
// Include malformedLineCount in return metadata
```

**Acceptance:**
- [ ] Malformed lines counted and returned in metadata
- [ ] Test: malformed JSON line → counted but not thrown
- [ ] Test: all valid lines → `malformedLineCount: 0`

### 12-06b: ~~Add Observability to Tier Fallback Errors~~ (Superseded by 12-03)

**Note:** This plan is superseded by 12-03, which now includes `fallbackErrors` capture as part of Tier 3 removal. 12-06b is marked as **done by 12-03** to avoid duplicate implementation.

### 12-07: Move Inline Types to Contracts (Low Impact, Low Complexity)

**Finding:** `ListDevicesData` and `EndSessionData` defined inline in `packages/mcp-server/src/server.ts:110-111` while all other 55 tool types are in contracts package.

**Fix:** Move to `packages/contracts/src/types.ts` for consistency.

### 12-08: Reduce any/unknown Casting in MCP Server (Medium Impact, Medium Complexity)

**Finding:** 9 instances of `as unknown as` casting in `packages/mcp-server/src/index.ts`, mostly around `AnyToolHandler` generic function type workaround and registry construction.

**Fix:**
1. Audit all 9 casting sites — categorize as "unavoidable TS limitation" vs "fixable"
2. Fix the registry casts at lines 965/969 with proper generic constraints
3. For `AnyToolHandler` bivarianceHack pattern — document why it's unavoidable (TypeScript limitation for generic function types in maps)
4. Add an ESLint rule or code comment at each unavoidable cast explaining why

**Acceptance:**
- [ ] `as unknown as` count reduced from 9 to <= 5 (target: fix the 4 registry-related casts)
- [ ] Each remaining cast has a comment explaining why it's unavoidable
- [ ] No new type errors introduced
- [ ] If < 4 casts can be fixed, document the remaining ones as "deferred to type-safety phase"

---

## Unmapped Findings Triage

The following audit findings are NOT mapped to a Phase 12 sub-plan. Each is intentionally triaged:

| Finding | Triage | Reason |
|---|---|---|
| **C1** (6 core files without tests) | Deferred to Phase 13 | Out of scope for this phase. Requires separate "test coverage" phase. |
| **C2** (no per-tool unit tests for mcp-server) | Deferred to Phase 13 | Same as C1. Integration tests exist; per-tool tests are a separate effort. |
| **C3** (adapter-vision minimal test coverage) | Deferred to Phase 13 | Same as C1. Vision/OCR testing is a specialized effort. |
| **C4** (device-runtime-android.ts no dedicated test file) | Deferred to Phase 13 | Same as C1. Android-specific tests require device/emulator setup. |
| **D1** (unbounded `while(true)` loop in harness-config.ts) | Deferred to Phase 13 | Low risk (only called at startup). Add maxDepth guard when touched next. |
| **E2** (`Record<string, unknown>` for YAML/JSON parsing) | Deferred to Phase 13 | Requires adopting zod/valibot — a larger migration than this phase allows. |
| **E3** (error type casting patterns) | Partially addressed in 12-06b | Tier fallback errors will use proper error capture. Other instances deferred. |

## Appendix: Full Codebase Audit Findings (23 Findings)

Audit performed via Explore agent across all packages. No TODO/FIXME/HACK markers found in source — positive signal for code hygiene.

### A. Duplication (High Impact)

| # | Pattern | Copies | Locations | Fix |
|---|---|---|---|---|
| A1 | `isRecord` (`typeof value === "object" && value !== null`) | **10** | `core/device-lease-store.ts:26`, `core/policy-engine.ts:43`, `core/session-record-store.ts:66`, `core/governance.ts:64`, `adapter-maestro/harness-config.ts:58`, `adapter-maestro/ui-model.ts:45`, `adapter-maestro/replay-step-planner.ts:56`, `adapter-maestro/action-orchestrator-model.ts:623`, `mcp-server/tools/persist-session-evidence.ts:5`, `scripts/validate-phase3-samples.ts:41` | Extract to `packages/core/src/guards.ts` |
| A2 | `writeJsonFile` (atomic write via temp + rename) | **5** | `core/device-lease-store.ts:68`, `core/failure-memory-store.ts:54`, `core/session-record-store.ts:107`, `core/recording-store.ts:79`, `core/action-record-store.ts:74` | Extract to `packages/core/src/fs-utils.ts` |
| A3 | `readNonEmptyString` | 2 | `adapter-maestro/harness-config.ts:62`, `adapter-maestro/ui-model.ts:49` | Keep export in harness-config, import in ui-model |
| A4 | `.catch(() => undefined)` cleanup pattern | **18** | Across core, adapter-maestro, mcp-server — see specific files in audit report | | Extract to `bestEffortCleanup()` helper |

### B. Error Handling Gaps

| # | Location | Issue | Impact |
|---|---|---|---|
| B1 | `core/recording-store.ts:174` | Empty `catch {}` — `JSON.parse` in line-by-line loop silently drops malformed events, zero observability | **High** — silent data loss during replay |
| B2 | `adapter-maestro/device-runtime-ios.ts:241-242` | `tryDevicectlCrashLogs` and `tryIdevicecrashreport` catch blocks silently swallow errors — no logging of intermediate tier failures | Medium |
| B3 | `adapter-maestro/device-runtime-ios.ts:356` | `readFile(entry.absolutePath, "utf8").catch(() => "")` — cannot distinguish "empty file" from "read error" | Low |

### C. Missing Test Coverage

| # | Package | Files Without Tests | Risk |
|---|---|---|---|
| C1 | `packages/core/src/` (11 source, 4 test files) | `execution-coordinator.ts`, `governance.ts`, `recording-store.ts`, `session-record-store.ts`, `action-record-store.ts`, `session-store.ts` | **High** — governance handles sensitive data redaction; execution-coordinator manages concurrent lease access |
| C2 | `packages/mcp-server/src/tools/` (57 tool files) | No per-tool unit tests — only 12 integration tests in `test/` | Medium |
| C3 | `packages/adapter-vision/` | Minimal OCR/CV test coverage (3 test files for multiple source files) | Medium |
| C4 | `adapter-maestro/device-runtime-android.ts` | NO dedicated test file — `createAndroidDeviceRuntimeHooks()` untested | Medium |

### D. Performance Hotspots

| # | Location | Issue | Impact |
|---|---|---|---|
| D1 | `adapter-maestro/harness-config.ts:199` | `while (true)` loop with 3× `existsSync` per iteration — unbounded directory traversal to find repo root | Medium (only called at startup) |
| D2 | `adapter-maestro/device-runtime-ios.ts:18-33` | `listRelativeFileEntries` — recursive sequential `readdir`, no parallelization or maxDepth | Low (bounded directory depth) |
| D3 | Release scripts (`scripts/release/`) | `readFileSync`/`writeFileSync`/`execSync` throughout | Low (acceptable for CLI scripts) |

### E. Type Safety Gaps (138 instances of `any`/`unknown`/`as any`)

| # | Location | Pattern | Count | Fix |
|---|---|---|---|---|
| E1 | `mcp-server/src/index.ts` | `as unknown as` casting for tool handler wrapping (`AnyToolHandler` bivarianceHack workaround) and registry construction (lines 965, 969) | 9 | Investigate better generic constraints |
| E2 | Across codebase | `Record<string, unknown>` for YAML/JSON parsing | Many | Consider `zod` or `valibot` for schema validation |
| E3 | `core/recording-store.ts:180`, `core/device-lease-store.ts:84-89` | `(error as NodeJS.ErrnoException).code` | 2 | Use type guard: `isErrnoException(err: unknown)` |

### F. Contract Consistency

| # | Location | Issue | Fix |
|---|---|---|---|
| F1 | `mcp-server/src/server.ts:110-111` | `ListDevicesData` and `EndSessionData` defined inline — all other 55 tool types in contracts | Move to `packages/contracts/src/types.ts` |
| F2 | `mcp-server/src/server.ts` | `MobileE2EMcpToolContractMap` defines 57 tool contracts — all match contracts package | ✅ No drift detected |

### Audit Summary by Impact

| Impact | Count | Key Items |
|---|---|---|
| **High** | 4 | A1 (10× duplication), A2 (5× duplication), B1 (silent data loss), C1 (6 core files untested) |
| **Medium** | 7 | A4 (18 catch patterns), C2 (no per-tool tests), C3 (vision tests), C4 (android hooks untested), D1 (unbounded loop), E1 (138 any/unknown), F1 (inline types) |
| **Low** | 6 | B3, D2, D3, and minor variations |
