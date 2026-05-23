# Phase 11: Diagnostics and Crash Evidence Deepening

**Phase Number:** 11
**Status:** Planned (Oracle-reviewed v3, R2 fixes applied)
**Created:** 2026-04-05
**Reviewed:** 2026-04-05 (Oracle round 1: 16 fixes → round 2: 3 critical + 4 design improvements)
**Depends on:** Phase 7 (iOS parity), Phase 9 (iOS real-device action path)

---

## Goal

Close the gaps in log/crash/diagnostics evidence collection so AI agents receive **complete, AI-consumable crash and ANR evidence** from both Android and iOS without requiring manual file-pull steps.

## Problem Statement

Current implementation has 4 known gaps in the diagnostics/crash evidence path:

1. **Android ANR trace: filename-only listing** — `executeCrashSignalsCapture` runs `adb shell ls -1 /data/anr` but never pulls the actual trace content. AI knows "ANR files exist" but cannot read the stack trace.
2. **iOS physical-device crash logs: not implemented** — iOS `executeCrashSignalsCapture` only works for simulators (reads `~/Library/Logs/CrashReporter` locally). Physical devices (`isIosPhysicalDeviceId(deviceId) === true`) have no crash log collection path.
3. **Crash signal summary is primitive** — `buildLogSummary` does basic line counting and category bucketing but lacks structured crash attribution (process name, signal type, fault address, backtrace summary).
4. **No bounded remote-file read with guardrails** — No timeout/size guardrails on trace file reads (`adb shell cat`, `adb pull`, etc.), risking long hangs on large trace files or unresponsive devices.

## Architecture Overview

### Current Data Flow

```
AI Agent
   │
   ▼
MCP Tool: get_crash_signals
   │
   ▼
getCrashSignalsWithRuntime()  ─── device-runtime.ts
   │
   ▼
resolveDeviceRuntimePlatformHooks(platform)
   ├── android → executeCrashSignalsCapture()  ─── device-runtime-android.ts
   │     ├── adb logcat -b crash -t N        ✅ pulls crash buffer content
   │     └── adb shell ls /data/anr          ❌ only lists filenames
   │
   └── ios → executeCrashSignalsCapture()  ─── device-runtime-ios.ts
         ├── xcrun simctl getenv HOME        ✅ simulator only
         └── read ~/Library/Logs/CrashReporter  ✅ simulator only
               ❌ physical device: no path
```

### Target Data Flow (after Phase 11)

```
AI Agent
   │
   ▼
MCP Tool: get_crash_signals
   │
   ▼
getCrashSignalsWithRuntime()
   │
   ▼
resolveDeviceRuntimePlatformHooks(platform)
   ├── android → executeCrashSignalsCapture()
   │     ├── adb logcat -b crash -t N              ✅ (existing)
   │     ├── adb shell ls -1t /data/anr             ✅ (existing, upgraded to -t for recency)
   │     └── adb shell "cat <escaped-path> | head -N"  ⭐ NEW: primary bounded read (no root needed)
   │           └── fallback: adb pull (bounded, with timeout + size guard)
   │                 └── parse ANR → structured summary ⭐ NEW
   │
   └── ios → executeCrashSignalsCapture()
         ├── simulator: ~/Library/Logs/CrashReporter  ✅ (existing)
         └── physical device: ⭐ NEW path
               ├── Tier 1: devicectl device info crashes     (Xcode 14+, no extra deps)
               ├── Tier 2: idevicecrashreport -k <dir>       (libimobiledevice)
               └── Tier 3: idevicesyslog --since <time>      (bounded 5-min window)
                     └── Parse iOS crash report → structured summary ⭐ NEW

   │
   ▼
buildCrashAttribution()  ─── crash-attribution.ts (NEW file)
   │
   └── crashAttribution field added to GetCrashSignalsData response
```

---

## Plan 11-01: Pull Android ANR Trace Content

### Scope

Replace the current `adb shell ls -1 /data/anr` (filename-only) with a bounded `adb shell cat` primary read that retrieves actual ANR trace content. `adb pull` is a fallback, not the primary path.

### Design Decision: `adb shell cat` as Primary, Not `adb pull`

Research (RESEARCH.md Q8) concluded that `adb shell cat` works on more device types than `adb pull`:

| Device type | `adb shell cat /data/anr/x` | `adb pull /data/anr/x` |
|---|---|---|
| Emulator | ✅ works | ✅ works |
| Userdebug/eng build | ✅ works | ✅ works |
| Production user build | ✅ often works (shell has read permission) | ❌ often fails (pull requires root) |

**Bounded read pattern:**
```bash
# Primary: shell cat with head limit (natural size guard)
adb -s <deviceId> shell "cat '<escaped-path>' | head -n 20000"

# Fallback: if cat fails, try pull with bounded utility
adb -s <deviceId> pull /data/anr/<file> <local-temp-path>
```

The `head -20000` approach gives ~1-8MB output for typical ANR traces — no separate size check needed for the happy path. Default size limit is 80MB, timeout is 60s, total batch budget is 180s.

### Implementation

**File to modify:** `packages/adapter-maestro/src/device-runtime-android.ts`

**New private function** (NOT on shared hooks interface — Oracle fix #2):
```typescript
// device-runtime-android.ts — module-level private function
async function pullAndParseAnrTraces(params: {
  repoRoot: string;
  deviceId: string;
  fileNames: string[];
  maxFiles?: number;
  maxLinesPerFile?: number;   // Default: 20000 (~1-8MB for typical ANR)
  timeoutMs?: number;
}): Promise<AnrTraceResult[]> {
  // For each file (bounded to maxFiles, default 3):
  //   1. Try: adb shell "cat '<escaped>' | head -N"  (uses shellEscape from runtime-shared.ts)
  //   2. If fails: try boundedAdbPullBatch (Plan 11-04 utility)
  //   3. Parse content → AnrTraceResult
  //   4. Always clean up temp files in finally block
}
```

**Updated `executeCrashSignalsCapture`** in `device-runtime-android.ts`:
```typescript
// After existing ls -1t command:
const anrFileNames = entries.slice(0, maxFiles);  // already sorted by recency via -t flag
const anrTraces = await pullAndParseAnrTraces({
  repoRoot,
  deviceId,
  fileNames: anrFileNames,
  maxLinesPerFile: 20_000,
  timeoutMs: DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
});

const content = [
  "# Android crash log buffer",
  crashExecution.stdout.trim(),
  "",
  "# Android ANR entries",
  entries.join("\n"),
  ...(anrTraces.length > 0 ? ["", "# Android ANR trace content"] : []),
  ...anrTraces.map((t) => `## ${t.fileName}\n${t.rawContent ?? "<content not available>"}`),
].join("\n").trim() + "\n";
```

### `AnrTraceResult` Interface

**Location:** `packages/adapter-maestro/src/device-runtime-android.ts` (private to module, Oracle fix #13)

```typescript
interface AnrTraceResult {
  fileName: string;
  processName?: string;       // from "Cmd line: com.example.app"
  pid?: string;               // from "----- pid 12345 -----"
  signal?: string;            // e.g., "Input dispatching timed out"
  rawContent?: string;        // truncated to maxLinesPerFile
  pullStatus: "success" | "timeout" | "too_large" | "permission_denied" | "cat_failed_pull_fallback";
  pullMethod: "shell_cat" | "adb_pull";  // which path succeeded
}
```

**Deliberately NOT included** (Oracle fix #5 — was over-structured):
- ~~`threadStates: Array<{threadName, state, topStackFrame}>`~~ — removed. AI agent can parse thread states from `rawContent`. Structured thread parsing is deferred to a future phase after real-world validation.
- ~~`cpuUsage`~~ — removed. Same reason.

### `CrashSignalExecutionResult` Interface Change

**Location:** `packages/adapter-maestro/src/device-runtime-platform.ts`

**Change** (Oracle fix #4 — explicitly backward-compatible):

```typescript
export interface CrashSignalExecutionResult {
  exitCode: number | null;
  stderr: string;
  commands: string[][];
  entries: string[];
  signalCount: number;
  content?: string;
  /** Platform-specific extension data. Consumers should check platform before reading. */
  platformExtensions?: Record<string, unknown>;
}
```

Android sets `platformExtensions.anrTraces: AnrTraceResult[]`.
iOS sets `platformExtensions.iosPhysicalCrashes: IosPhysicalCrashResult`.

Note (Oracle R2 D1): While `Record<string, unknown>` sacrifices compile-time type safety, it avoids importing platform-specific types into the shared contract. The plan documents expected keys per platform here. A future refinement could use a discriminated union (`AndroidCrashExtensions | IosCrashExtensions`) if type safety becomes a practical issue.

### Implementation Steps

1. **Add private `pullAndParseAnrTraces` function** in `device-runtime-android.ts` (NOT on hooks interface)
2. **Update `executeCrashSignalsCapture`** to use `ls -1t` (recency sort) and call `pullAndParseAnrTraces`
3. **ANR parser**: extract only `processName`, `pid`, `signal` from raw content (defer thread state parsing)
4. **Add `platformExtensions` bag** to `CrashSignalExecutionResult` in `device-runtime-platform.ts`
5. **Update response shape** in `getCrashSignalsWithRuntime` to expose `platformExtensions` in tool output

### Acceptance Criteria

- [ ] `pullAndParseAnrTraces` is a private function in `device-runtime-android.ts` (not on shared hooks interface)
- [ ] Primary path uses `adb shell "cat <escaped> | head -N"` (not `adb pull`)
- [ ] `adb pull` is fallback when `cat` fails
- [ ] `ls -1t` used instead of `ls -1` (recency ordering)
- [ ] `CrashSignalExecutionResult` extended via `platformExtensions?: Record<string, unknown>` (backward-compatible)
- [ ] ANR parser extracts `processName`, `pid`, `signal` only (no over-structured thread states)
- [ ] Temp files cleaned up in `finally` block regardless of success/failure
- [ ] Per-file timeout of 10s enforced
- [ ] Existing tests pass; new test added with mocked ANR content

---

## Plan 11-02: iOS Physical-Device Crash Log Collection

### Scope

Add crash log collection path for iOS physical devices, which currently has zero coverage.

### Design

**File to modify:** `packages/adapter-maestro/src/device-runtime-ios.ts`

**All functions are private to `device-runtime-ios.ts`** (Oracle fix #3 — not on shared hooks interface).

**Tiered fallback with explicit success/failure/no-data semantics** (Oracle fix #6):

```typescript
async function collectIosPhysicalCrashLogs(params: {
  repoRoot: string;
  deviceId: string;
  appId?: string;
}): Promise<IosPhysicalCrashResult> {
  // Tier 1: devicectl
  const tier1Result = await tryDevicectlCrashLogs(params);
  if (tier1Result.tier === "devicectl" && tier1Result.success) return tier1Result;
  if (tier1Result.failureReason === "tool_not_available") {
    // devicectl binary exists but crashes/unavailable — try next tier
  }
  if (tier1Result.failureReason === "device_disconnected") {
    // Device lost connection — try next tier
  }

  // Tier 2: idevicecrashreport
  const tier2Result = await tryIdevicecrashreport(params);
  if (tier2Result.success) return tier2Result;

  // Tier 3: idevicesyslog (bounded time window, Oracle fix #11)
  return await tryIdeviceSyslogTail({ ...params, sinceMinutes: 5 });
}
```

### Explicit Tier Semantics

| Tier | Success (has crashes) | Success (no crashes) | Tool not available | Device disconnected | Command error |
|---|---|---|---|---|---|
| devicectl | `{success: true, entries: [...]}` | `{success: true, entries: []}` | `{success: false, failureReason: "tool_not_available"}` | `{success: false, failureReason: "device_disconnected"}` | `{success: false, failureReason: "command_error", stderr: "..."}` |
| idevicecrashreport | `{success: true, entries: [...]}` | `{success: true, entries: []}` | `{success: false, failureReason: "tool_not_available"}` | `{success: false, failureReason: "device_disconnected"}` | `{success: false, failureReason: "command_error", stderr: "..."}` |
| idevicesyslog | `{success: true, entries: [...]}` | `{success: true, entries: []}` | `{success: false, failureReason: "tool_not_available"}` | `{success: false, failureReason: "device_disconnected"}` (Oracle R2 fix #6) | `{success: false, failureReason: "command_error", stderr: "..."}` |

**Tier 3 uses time-bounded window** (Oracle fix #11, R2 fix #D3 — resolved in Node.js, not shell):
```typescript
// Oracle R2 fix #D3: resolve date in Node.js, NOT via shell $(date ...)
// executeRunner uses spawn(), not shell, so $() expansion doesn't work
const sinceTime = new Date(Date.now() - 5 * 60 * 1000);
const timestampStr = sinceTime.toISOString().replace("T", " ").substring(0, 19);
// idevicesyslog --udid <udid> --timestamp "2026-04-05 10:25:00"
```

### `IosPhysicalCrashResult` Interface

**Location:** `packages/adapter-maestro/src/device-runtime-ios.ts` (private to module)

```typescript
interface IosPhysicalCrashResult {
  success: boolean;
  tier: "devicectl" | "idevicecrashreport" | "idevicesyslog";
  entries: Array<{
    reportId?: string;
    processName?: string;
    exceptionType?: string;
    exceptionCodes?: string;
    crashedThreadFrames: string[];  // top 10 frames
    rawContent?: string;            // truncated to 200 lines per report
  }>;
  supportLevel: "full" | "partial" | "none";
  missingToolingAdvice?: string;    // e.g., "brew install libimobiledevice"
  failureReason?: "tool_not_available" | "device_disconnected" | "command_error" | "no_crashes";
  stderr?: string;                  // command error output
}
```

### AppId Filtering per Tier (Oracle fix #14)

| Tier | Filtering approach |
|---|---|
| devicectl | Filter JSON results by `appId` in `processName` or `bundleIdentifier` field |
| idevicecrashreport | Pull all `.crash` files, filter locally by `Identifier: com.example.app` in file content |
| idevicesyslog | Pipe through `grep -i <appId>` after retrieval |

### `executeCrashSignalsCapture` Update

```typescript
// In device-runtime-ios.ts executeCrashSignalsCapture:
if (isIosPhysicalDeviceId(deviceId)) {
  const physicalResult = await collectIosPhysicalCrashLogs({ repoRoot, deviceId, appId });
  // Build content string from physicalResult.entries
  // Set platformExtensions.iosPhysicalCrashes = physicalResult
  return { ...baseResult, platformExtensions: { iosPhysicalCrashes: physicalResult } };
}
// Existing simulator path unchanged
```

### Acceptance Criteria

- [ ] `collectIosPhysicalCrashLogs` is a private function in `device-runtime-ios.ts` (not on shared hooks)
- [ ] Tier 1 (`devicectl`) attempted first; explicit success/failure/no-data semantics
- [ ] Tier 2 (`idevicecrashreport`) attempted only if tier 1 returns `tool_not_available` or `device_disconnected`
- [ ] Tier 3 (`idevicesyslog`) uses **time-bounded window** (5 min), resolved in Node.js via `new Date()`, NOT shell `$(date ...)` (Oracle R2 fix #D3)
- [ ] `missingToolingAdvice` tells user which tool to install if all tiers fail
- [ ] `appId` filtering works per tier (see table above)
- [ ] iOS crash report parser extracts: process name, exception type, crashed thread frames
- [ ] Existing simulator path unchanged
- [ ] `platformExtensions` bag used for result extension (consistent with Plan 11-01)

---

## Plan 11-03: Structured Crash Attribution Summary

### Scope

Upgrade the current `buildLogSummary` (generic log bucketing) into a **crash-aware structured summary** that AI agents can use for attribution without reading raw crash files.

### Design Decision: New File, Not `action-outcome.ts`

(Oracle fix #3 — previous placement was architecturally wrong.)

**New file:** `packages/adapter-maestro/src/crash-attribution.ts`

Reasoning:
- `buildFailureAttribution` in `action-outcome.ts` operates on `ActionOutcomeSummary` and `EvidenceDeltaSummary` — high-level session/action metadata.
- Crash attribution operates on **raw crash log text, ANR traces, and iOS `.crash` files** — completely different input domain.
- Keeping them separate prevents `action-outcome.ts` from becoming a dumping ground for all attribution-like logic.

### Output Shape

```typescript
// packages/contracts/src/types.ts — new interface
export interface CrashAttribution {
  crashTypes: CrashType[];          // Array to support hybrid scenarios (Oracle fix #18)
  primaryCrashType: CrashType;      // the dominant type (Oracle R2 fix #D4)
  processName?: string;
  signal?: string;
  faultAddress?: string;
  crashedThread?: {
    name?: string;
    state?: string;
    topFrames: string[];            // up to 10 frames
  };
  suspectedCause?: string;
  confidence: "high" | "medium" | "low";
  relatedSignals: string[];
  suggestedActions: string[];
}

export type CrashType =
  | "anr"
  | "native_crash"
  | "oom"
  | "uncaught_exception"
  | "watchdog"
  | "unknown";
```

### Hybrid Crash Type Support (Oracle fix #18)

A single crash log can contain mixed signals (e.g., ANR followed by forced SIGKILL). `detectCrashTypes` returns all detected types:

```typescript
function detectCrashTypes(content: string, platform: Platform): CrashType[] {
  const types: CrashType[] = [];
  if (content.includes("ANR in") || content.includes("dispatching timed out")) types.push("anr");
  if (content.includes("FATAL EXCEPTION") || content.includes("java.lang.")) types.push("uncaught_exception");
  if (content.includes("SIGSEGV") || content.includes("SIGABRT") || content.includes("signal ")) types.push("native_crash");
  if (content.includes("lowmemorykiller") || content.includes("jetsam") || content.includes("EXC_CRASH (SIGKILL)")) types.push("oom");
  if (content.includes("watchdog") || content.includes(" hung ")) types.push("watchdog");
  if (types.length === 0) types.push("unknown");
  return types;
}
```

### Primary Crash Type Selection (Oracle R2 fix #D4)

When `detectCrashTypes` returns multiple types, `primaryCrashType` is selected by priority ordering:

```typescript
const CRASH_TYPE_PRIORITY: CrashType[] = [
  "anr",                // Most actionable for E2E
  "native_crash",       // Second — app-level native crash
  "watchdog",           // System killed unresponsive process
  "oom",                // Memory pressure
  "uncaught_exception", // Managed code exception
  "unknown",
];

function selectPrimaryCrashType(types: CrashType[]): CrashType {
  for (const candidate of CRASH_TYPE_PRIORITY) {
    if (types.includes(candidate)) return candidate;
  }
  return "unknown";
}
```

### Cheap Pre-Check Guard (Oracle fix #10)

```typescript
function buildCrashAttribution(content: string, platform: Platform): CrashAttribution | undefined {
  // Skip if no crash-like signals at all
  const cheapCrashSignals = ["ANR", "crash", "FATAL", "SIGSEGV", "SIGABRT", "EXC_", "Exception", "killed", "watchdog"];
  const hasAnyCrashSignal = cheapCrashSignals.some((s) => content.toLowerCase().includes(s.toLowerCase()));
  if (!hasAnyCrashSignal) return undefined;

  // Full attribution logic below...
}
```

### Suggested Cause Heuristics

| Pattern | Suspected Cause | Confidence |
|---|---|---|
| ANR + main thread in `ViewRootImpl`/`Choreographer` | UI thread blocking | high |
| ANR + main thread in `Binder` IPC | Slow IPC call | medium |
| ANR + no thread info (raw content only) | Unknown thread-level cause | low |
| Native crash + `SIGSEGV` at `0x0` | Null pointer dereference | high |
| Native crash + `SIGABRT` + `abort()` | Assertion or explicit abort | medium |
| iOS `EXC_BAD_ACCESS` + `KERN_INVALID_ADDRESS` | Dangling pointer / null access | high |
| iOS `EXC_CRASH (SIGKILL)` + jetsam | Memory pressure kill | high |

### Implementation Steps

1. **Create `packages/adapter-maestro/src/crash-attribution.ts`** (NEW file, not in action-outcome.ts)
2. **Add `CrashAttribution` interface** in `packages/contracts/src/types.ts`
3. **Add `buildCrashAttribution` function** with cheap pre-check guard
4. **`detectCrashTypes` returns array** (supports hybrid scenarios)
5. **`selectPrimaryCrashType`** with explicit priority ordering (Oracle R2 fix #D4)
6. **Update `getCrashSignalsWithRuntime`** to call `buildCrashAttribution` only when content has crash signals
7. **Add `crashAttribution?: CrashAttribution`** as optional field on `GetCrashSignalsData` contract
8. **Keep `content` field as human-readable string** (backward compatible, Oracle fix #8)

### Acceptance Criteria

- [ ] `crash-attribution.ts` is a new file (not in `action-outcome.ts`)
- [ ] `CrashAttribution` interface defined in `packages/contracts/src/types.ts`
- [ ] `buildCrashAttribution` has cheap pre-check guard (returns `undefined` when no crash signals)
- [ ] `detectCrashTypes` returns `CrashType[]` (supports hybrid: ANR + native_crash, etc.)
- [ ] `selectPrimaryCrashType` uses explicit priority ordering: anr > native_crash > watchdog > oom > uncaught_exception > unknown
- [ ] Crash type detection covers: anr, native_crash, uncaught_exception, oom, watchdog (Android + iOS)
- [ ] Suggested cause heuristics return at least 3 pattern matches with confidence
- [ ] `get_crash_signals` response includes `crashAttribution?: CrashAttribution` field (optional)
- [ ] `content` field remains human-readable string (backward compatible)
- [ ] Tests added with fixture crash reports
- [ ] Existing `buildLogSummary` unchanged

---

## Plan 11-04: Bounded Remote-File Read with Timeout and Size Guardrails

### Scope

Implement a reusable bounded file-read utility for ANR traces, crash dumps, and any future `adb shell cat` / `adb pull` needs. Renamed from "bounded `adb pull`" because the primary path is now `adb shell cat` (Oracle fix #1).

### Design

**New file:** `packages/adapter-maestro/src/diagnostics-pull.ts`

```typescript
export interface BoundedReadOptions {
  deviceId: string;
  remotePath: string;
  /** Max lines to read via shell cat. Default: 20000 (~1-8MB) */
  maxLines?: number;
  /** Fallback to adb pull if shell cat fails. Default: true */
  allowPullFallback?: boolean;
  /** Max file size in bytes for pull fallback. Default: 80MB */
  maxFileSizeBytes?: number;
  /** Timeout per operation in ms. Default: 60000 */
  timeoutMs?: number;
}

export interface BoundedReadResult {
  content: string;                    // always present (truncated to limits)
  status: "success" | "timeout" | "too_large" | "not_found" | "permission_denied" | "read_failed";
  readMethod: "shell_cat" | "adb_pull";
  bytesRead: number;                  // actual bytes read
  errorMessage?: string;
  durationMs: number;
}
```

### Primary Path: `adb shell cat` with `head`

**Oracle R2 critical fixes applied:**
- **#C1**: No `executeWithTimeout` wrapper — uses `executeRunner` directly which already supports `timeoutMs` (returns `exitCode: null` on timeout)
- **#C2**: Budget propagation — batch passes `remainingBudgetMs` to each call
- **#C3**: Shell injection — uses `shellEscape` from `runtime-shared.ts`

```typescript
import { executeRunner, shellEscape } from "./runtime-shared.js";

export async function boundedRemoteFileRead(options: BoundedReadOptions): Promise<BoundedReadResult> {
  const { deviceId, remotePath, maxLines = 20_000, timeoutMs = 60_000 } = options;
  const startTime = Date.now();

  // Step 1: Shell cat with head limit (natural size guard, no separate stat needed)
  // Oracle R2 fix #C3: use shellEscape to prevent shell injection from malicious filenames
  const escapedPath = shellEscape(remotePath);
  const catResult = await executeRunner(
    ["adb", "-s", deviceId, "shell", `cat ${escapedPath} | head -n ${maxLines}`],
    repoRoot, process.env, { timeoutMs },
  );
  // Oracle R2 fix #C1: executeRunner returns exitCode: null on timeout (no result.completed)
  if (catResult.exitCode !== null && catResult.exitCode === 0 && catResult.stdout.trim().length > 0) {
    return {
      content: catResult.stdout,
      status: "success",
      readMethod: "shell_cat",
      bytesRead: Buffer.byteLength(catResult.stdout, "utf8"),
      durationMs: Date.now() - startTime,
    };
  }

  // Step 2: If cat failed and pull fallback is allowed
  if (!options.allowPullFallback) {
    return {
      content: "",
      status: catResult.exitCode === null ? "timeout" : "permission_denied",
      readMethod: "shell_cat",
      bytesRead: 0,
      errorMessage: catResult.stderr || "shell cat failed",
      durationMs: Date.now() - startTime,
    };
  }

  // Step 3: Bounded adb pull fallback (with remaining budget)
  return boundedAdbPullFallback({ ...options, startTime, remainingBudgetMs: timeoutMs });
}
```

### Pull Fallback with Dynamic Budget (Oracle R2 fix #C2: budget propagation)

```typescript
async function boundedAdbPullFallback(params: {
  deviceId: string;
  remotePath: string;
  maxFileSizeBytes?: number;
  timeoutMs?: number;
  startTime: number;
  /** Remaining budget for this operation AND all subsequent sibling operations in the batch */
  remainingBudgetMs: number;
}): Promise<BoundedReadResult> {
  if (params.remainingBudgetMs <= 0) {
    return { content: "", status: "timeout", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
  }

  const sizeCheckTimeout = Math.min(5000, params.remainingBudgetMs * 0.3);  // 30% of remaining budget
  const pullTimeout = Math.min(params.timeoutMs ?? 10000, params.remainingBudgetMs * 0.7);  // 70% of remaining

  // Size check: stat → wc -c → wc via pipe (3-level fallback)
  const size = await checkRemoteFileSize(params.deviceId, params.remotePath, sizeCheckTimeout);
  if (size === "not_found") return { content: "", status: "not_found", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
  if (size === "too_large") return { content: "", status: "too_large", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
  if (size === "check_failed") {
    // Cannot determine size — proceed with pull but with reduced timeout
  }

  // Pull with timeout
  const escapedPath = shellEscape(params.remotePath);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "m2e-diagnostics-"));
  try {
    const pullResult = await executeRunner(
      ["adb", "-s", params.deviceId, "pull", escapedPath, tempDir],
      repoRoot, process.env, { timeoutMs: pullTimeout },
    );
    if (pullResult.exitCode === null) return { content: "", status: "timeout", readMethod: "adb_pull", bytesRead: 0, durationMs: Date.now() - params.startTime };
    if (pullResult.exitCode !== 0) return { content: "", status: "read_failed", readMethod: "adb_pull", bytesRead: 0, errorMessage: pullResult.stderr, durationMs: Date.now() - params.startTime };

    const content = await readFile(path.join(tempDir, path.basename(params.remotePath)), "utf8");
    return { content, status: "success", readMethod: "adb_pull", bytesRead: Buffer.byteLength(content, "utf8"), durationMs: Date.now() - params.startTime };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

### Three-Level Size Check (Oracle fix #17, R2 note: Level 3 is O(n), best-effort only)

```typescript
async function checkRemoteFileSize(
  deviceId: string,
  remotePath: string,
  timeoutMs: number,
): Promise<number | "not_found" | "too_large" | "check_failed"> {
  const maxBytes = 2 * 1024 * 1024;  // 2MB default
  const escapedPath = shellEscape(remotePath);

  // Level 1: stat -c %s (GNU coreutils, available on Android 8.0+)
  let result = await executeRunner(
    ["adb", "-s", deviceId, "shell", `stat -c %s ${escapedPath}`],
    repoRoot, process.env, { timeoutMs },
  );
  if (result.exitCode !== null && result.exitCode === 0) {
    const size = parseInt(result.stdout.trim(), 10);
    if (isNaN(size)) return "check_failed";
    if (size > maxBytes) return "too_large";
    return size;
  }

  // Level 2: wc -c (available on most Android versions, O(1) via fstat)
  result = await executeRunner(
    ["adb", "-s", deviceId, "shell", `wc -c < ${escapedPath}`],
    repoRoot, process.env, { timeoutMs },
  );
  if (result.exitCode !== null && result.exitCode === 0) {
    const size = parseInt(result.stdout.trim(), 10);
    if (isNaN(size)) return "check_failed";
    if (size > maxBytes) return "too_large";
    return size;
  }

  // Level 3: cat | wc -c — O(n), streams entire file. Best-effort only; expected to timeout for large files.
  // Kept as last resort for very old Android (< 8.0) where stat and wc -c <file> both fail.
  result = await executeRunner(
    ["adb", "-s", deviceId, "shell", `cat ${escapedPath} | wc -c`],
    repoRoot, process.env, { timeoutMs },
  );
  if (result.exitCode !== null && result.exitCode === 0) {
    const size = parseInt(result.stdout.trim(), 10);
    if (isNaN(size)) return "check_failed";
    if (size > maxBytes) return "too_large";
    return size;
  }

  // All levels failed — return check_failed so caller can decide
  return "check_failed";
}
```

### Batch Read with Dynamic Budget (Oracle R2 fix #C2: propagate remaining budget)

```typescript
export async function boundedRemoteFileReadBatch(params: {
  deviceId: string;
  remotePaths: string[];
  maxFiles?: number;          // Default: 3
  maxLines?: number;          // Default: 20000
  totalBudgetMs?: number;     // Default: 180000
  timeoutMs?: number;         // Default: 60000 per file
}): Promise<BoundedReadResult[]> {
  const startTime = Date.now();
  const totalBudget = params.totalBudgetMs ?? 180_000;
  const maxFiles = params.maxFiles ?? 3;
  const results: BoundedReadResult[] = [];

  for (const remotePath of params.remotePaths.slice(0, maxFiles)) {
    const elapsed = Date.now() - startTime;
    const remainingBudget = totalBudget - elapsed;
    if (remainingBudget <= 0) break;  // Budget exhausted

    // Oracle R2 fix #C2: pass remaining budget so individual calls self-limit
    const result = await boundedRemoteFileRead({
      deviceId,
      remotePath,
      maxLines: params.maxLines,
      timeoutMs: Math.min(params.timeoutMs ?? 10000, remainingBudget),
      allowPullFallback: true,
      // remainingBudget is passed via the timeoutMs cap; for adb pull fallback,
      // boundedAdbPullFallback receives remainingBudgetMs = remainingBudget
    });
    results.push(result);
  }

  return results;
}
```

Note (Oracle R2 O1): The batch function is sequential by design. Parallel size checks could save ~10s of the 30s budget, but parallel pulls compate budget enforcement. Sequential is the safe default; parallel optimization can be added later if benchmarks show the 30s budget is too tight in practice.

### Integration Points

| Consumer | How it uses bounded read |
|---|---|
| Plan 11-01 (ANR traces) | `boundedRemoteFileReadBatch` for `/data/anr/` files |
| Plan 11-02 (iOS via idevicecrashreport) | N/A — different tool, but could use bounded read pattern for `.crash` files |
| Future: tombstones, tombstone traces | Reuse `boundedRemoteFileRead` for any adb file read need |

### Implementation Steps

1. **Create `packages/adapter-maestro/src/diagnostics-pull.ts`**
2. **Implement `boundedRemoteFileRead`** with `adb shell cat | head -N` as primary (uses `shellEscape`), `adb pull` as fallback
3. **Implement `boundedAdbPullFallback`** with three-level size check and dynamic budget
4. **Implement `checkRemoteFileSize`** with 3-level fallback (stat → wc -c → cat | wc -c)
5. **Implement `boundedRemoteFileReadBatch`** with dynamic remaining budget passed to each call
6. **All code uses `executeRunner`** directly (no `executeWithTimeout` — Oracle R2 fix #C1)
7. **Add unit tests** mocking `executeRunner` for all 6 status cases + 3 size check levels
8. **Temp directory cleanup** in `finally` block for all error paths

### Acceptance Criteria

- [ ] `diagnostics-pull.ts` exports `boundedRemoteFileRead`, `boundedRemoteFileReadBatch`, `checkRemoteFileSize`
- [ ] Primary path is `adb shell "cat <escaped> | head -N"` (not `adb pull`)
- [ ] Uses `shellEscape` from `runtime-shared.ts` for all shell-interpolated paths (Oracle R2 fix #C3)
- [ ] Size check has 3-level fallback: `stat -c %s` → `wc -c < file` → `cat file | wc -c`
- [ ] Per-file timeout enforced via `executeRunner` `timeoutMs` option (Oracle R2 fix #C1 — no new `executeWithTimeout`)
- [ ] Batch passes remaining budget to individual calls (Oracle R2 fix #C2)
- [ ] Temp directory created via `mkdtemp`, cleaned up via `rm -rf` in `finally` for ALL error paths
- [ ] All 6 status cases + 3 size check levels covered by unit tests
- [ ] No changes to existing `executeRunner` behavior (backward compatible)

---

## Risk Analysis

| Risk | Impact | Mitigation |
|---|---|---|
| `adb shell cat /data/anr/` fails on some production devices | Partial coverage | `adb pull` fallback covers devices where pull works but cat doesn't |
| `libimobiledevice` not installed on macOS | Blocks Plan 11-02 tier 2 | Tier 1 (`devicectl`) is the primary path; tier 2 is optional enhancement |
| ANR trace files can be >80MB on long-running sessions | `head -N` naturally limits output | 20000 lines ≈ 1-8MB for typical ANR; `adb pull` fallback still has 80MB limit |
| iOS crash report format varies by iOS version | Parser brittleness | Parse defensively with optional fields; fall back to raw content |
| Adding new interfaces breaks existing contracts | API breakage risk | All new fields are optional (`?`); `platformExtensions` bag avoids schema changes |
| `stat`, `wc -c` both unavailable on very old Android (< 8.0) | Size check cannot run | `checkRemoteFileSize` returns `"check_failed"`; pull proceeds with timeout-only guardrail |
| Level 3 size check (`cat | wc -c`) streams entire file | O(n) defeats purpose | Documented as best-effort; expected to timeout for large files, degrades to `"check_failed"` |
| `xcrun devicectl device info crashes` JSON format unknown | Parser may not match | Research pending; fall back to `idevicecrashreport` tier if format is incompatible |
| ANR filename contains shell-special characters | Shell injection risk | All paths escaped via `shellEscape` from `runtime-shared.ts` (Oracle R2 fix #C3) |

## Verification Strategy

1. **Unit tests**: Mock `executeRunner` for each platform hook, verify correct command construction and error handling for all status cases
2. **Integration test**: Run against a real Android emulator with forced ANR (use `adb shell cmd activity inject-input` to trigger)
3. **Dry-run verification**: `get_crash_signals` with `dryRun: true` returns correct planned commands for new paths
4. **Evidence check**: Response `content` field contains structured crash sections; `crashAttribution` field is present when crash signals exist
5. **Budget enforcement test**: Verify `boundedRemoteFileReadBatch` stops when `totalBudgetMs` is exhausted
6. **Shell injection test**: Verify filenames with `"`, `$()`, backticks are safely escaped

## Files Changed Summary

| File | Change Type | Plan |
|---|---|---|
| `packages/adapter-maestro/src/device-runtime-android.ts` | Modify (add private function, update executeCrashSignalsCapture) | 11-01 |
| `packages/adapter-maestro/src/device-runtime-ios.ts` | Modify (add private function, branch on physical device) | 11-02 |
| `packages/adapter-maestro/src/device-runtime-platform.ts` | Modify (add `platformExtensions?: Record<string, unknown>` to CrashSignalExecutionResult) | 11-01, 11-02 |
| `packages/adapter-maestro/src/diagnostics-pull.ts` | **Create** (bounded remote file read utility) | 11-04 |
| `packages/adapter-maestro/src/crash-attribution.ts` | **Create** (structured crash attribution) | 11-03 |
| `packages/contracts/src/types.ts` | Modify (add `CrashAttribution`, `CrashType`, optional `crashAttribution` on GetCrashSignalsData) | 11-03 |
| `packages/adapter-maestro/src/index.ts` | Modify (export new public functions) | All |
| `packages/mcp-server/src/tools/get-crash-signals.ts` | No change (passes through) | — |

## Oracle Review Changes Applied

### Round 1 Fixes (1-19)

| # | Review Finding | Status |
|---|---|---|
| 1 | `adb shell cat` vs `adb pull` decision contradiction | ✅ Fixed — `adb shell cat` is now primary, `adb pull` is fallback |
| 2 | `pullAndParseAnrTraces` on shared hooks interface | ✅ Fixed — moved to private function in device-runtime-android.ts |
| 3 | `buildCrashAttribution` in wrong file | ✅ Fixed — new file `crash-attribution.ts` |
| 4 | `CrashSignalExecutionResult` breaking contract | ✅ Fixed — using `platformExtensions?: Record<string, unknown>` bag |
| 5 | `AnrTraceResult` over-structured (thread states) | ✅ Fixed — removed threadStates, kept rawContent + minimal fields |
| 6 | iOS tier failure semantics undefined | ✅ Fixed — explicit success/failure/no-data table for each tier |
| 7 | Size check doesn't distinguish "not found" | ✅ Fixed — `checkRemoteFileSize` returns typed result with `"not_found"` case |
| 8 | Total budget enforcement naive | ✅ Fixed — dynamic remaining budget passed to each operation |
| 10 | `buildCrashAttribution` called on every invocation | ✅ Fixed — cheap pre-check guard skips when no crash signals |
| 11 | `idevicesyslog -n 500` unbounded | ✅ Fixed — uses time-bounded window (5 min) |
| 12 | Files changed table omits platform.ts changes | ✅ Fixed — table updated |
| 13 | New interface locations unspecified | ✅ Fixed — each interface has explicit "Location" annotation |
| 14 | iOS physical tier appId filtering unspecified | ✅ Fixed — per-tier filtering table added |
| 16 | ANR temp file cleanup in error paths | ✅ Fixed — all pull paths wrapped in try/finally |
| 17 | `stat -c %s` unavailable on old Android | ✅ Fixed — 3-level fallback: stat → wc -c → cat | wc -c |
| 18 | `detectCrashType` single enum loses hybrid signals | ✅ Fixed — `detectCrashTypes` returns `CrashType[]` |
| 19 | `content` field format change has no migration path | ✅ Fixed — `content` stays human-readable; structured data in separate fields |

### Round 2 Fixes (C1-C3, D1-D4, O1-O3)

| # | Review Finding | Status |
|---|---|---|
| C1 | `executeWithTimeout` does not exist; code assumes `result.completed` | ✅ Fixed — uses `executeRunner` directly; checks `exitCode === null` for timeout |
| C2 | Batch function does not propagate budget to individual calls | ✅ Fixed — `remainingBudget` computed per iteration; passed via `timeoutMs` cap and `remainingBudgetMs` to fallback |
| C3 | Shell injection via ANR filename with `"` or `$()` | ✅ Fixed — uses `shellEscape` from `runtime-shared.ts` for all paths |
| D1 | `platformExtensions: Record<string, unknown>` sacrifices type safety | ⚠️ Accepted with documentation — documented expected keys per platform; future refinement to discriminated union noted |
| D2 | Level 3 size check is O(n), defeats purpose | ✅ Documented — explicitly labeled as "best-effort, expected to timeout for large files" |
| D3 | `idevicesyslog --timestamp` uses shell `$()` which won't work with `spawn` | ✅ Fixed — date resolved in Node.js via `new Date()`, passed as resolved string |
| D4 | `detectCrashTypes` primary type selection undefined | ✅ Fixed — `selectPrimaryCrashType` with explicit priority ordering: anr > native_crash > watchdog > oom > uncaught_exception > unknown |
| O1 | Consider parallel size checks in batch | ℹ️ Noted — deferred; sequential is safe default, parallel optimization can be added later |
| O2 | `ls -1t` may not work on Android 6-7 | ℹ️ Noted — acceptable risk; ANR files on old Android have date-based names so `ls -1 | tail -3` works as approximate fallback |
| O3 | Consider `ls -1 | tail -3` as cheaper alternative | ℹ️ Noted — kept as implicit fallback if `-t` is unsupported (ls errors out, returns empty) |
