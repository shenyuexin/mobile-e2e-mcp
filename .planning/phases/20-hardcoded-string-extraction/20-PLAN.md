# Phase 20 Plan: Hardcoded String Extraction and Constant Centralization

**Phase ID**: 20
**Area**: tooling / code-quality
**Status**: planned
**Depends on**: Phase 3 (capability truth guardrails)

## Goal

Eliminate all hardcoded string literals that are duplicated across descriptor definitions, preset configurations, capability models, action planners, and test fixtures by extracting them into shared constant modules with a clear tiered architecture, ensuring compile-time typo protection and single-source-of-truth consistency.

---

## Oracle Review — Corrections Made

| # | Original Plan | Corrected | Reason |
|---|--------------|-----------|--------|
| 1 | "55 tool names" | **60 tool names** | `grep -c 'defineToolDescriptor({'` = 60 |
| 2 | Create `ToolNameString` type derived from `TOOL_NAMES` | **No new type** — `TOOL_NAMES` values must align with existing `MobileE2EMcpToolName` (`keyof MobileE2EMcpToolContractMap` in `server.ts`) | Avoids type redundancy; `MobileE2EMcpToolName` is the authoritative source |
| 3 | Expand `SupportedActionType` from 6 to 12 values | **Split into two types**: keep `SupportedActionType` (6 values, backward-compat) + new `ExtendedActionType` (12 values, internal recording/replay only) | Expanding would affect 15+ type references in contracts/types.ts and could break switch exhaustiveness checks |
| 4 | `CLI_COMMANDS` includes `backendId` values | **Separated**: `CLI_COMMANDS` = executable names only (`adb`, `xcrun`, `maestro`); `backendId` is a routing identifier (different concern) | `backendId` ("wda", "axe", "simctl") routes execution; CLI commands are the binaries invoked. They overlap but are not identical. |

---

## Architecture Design

### Tiered Constant Placement

Constants live at the **lowest package boundary that covers all consumers**:

```
@mobile-e2e-mcp/contracts/              ← Tier 1: cross-package shared truth
├── src/constants/
│   ├── tool-names.ts                   ← 60 tool names (mcp-server + adapter-maestro + scripts)
│   └── action-types.ts                 ← 12 action types (adapter-maestro recording/replay)
└── src/types.ts                        ← types derive FROM constants

@mobile-e2e-mcp/mcp-server/             ← Tier 2: mcp-server package only
├── src/constants/
│   └── policy-scopes.ts                ← 6 policy scope strings

@mobile-e2e-mcp/adapter-maestro/        ← Tier 3: adapter package only
├── src/constants/
│   ├── cli-commands.ts                 ← adb, maestro, xcrun, idb, simctl, devicectl, wda, axe
│   └── capability-groups.ts            ← 6 capability group names
└── src/capability-model.ts             ← uses TOOL_NAMES from contracts
```

### Naming Convention

**`camelCase` key → `snake_case` value**, consistent with `REASON_CODES`:

```typescript
// contracts/src/constants/tool-names.ts
export const TOOL_NAMES = {
  captureJsConsoleLogs: "capture_js_console_logs",
  startSession: "start_session",
  performActionWithEvidence: "perform_action_with_evidence",
  // ... all 60
} as const;
```

**Derivation direction**: types derive FROM constants, not the other way around:

```typescript
// Before: type drives, string literals everywhere
export type SupportedActionType = "tap_element" | "type_into_element" | ...;

// After: constant drives, type derives
export const ACTION_TYPES = {
  tapElement: "tap_element",
  typeIntoElement: "type_into_element",
  // ...
} as const;
export type SupportedActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];
```

### Why `as const` objects, not enums?

| Approach | Type safety | Runtime cost | Extensibility | Pattern match |
|----------|------------|-------------|---------------|---------------|
| `enum` | ✅ | Yes (IIFE) | ❌ closed | ❌ |
| `as const` object | ✅ | None | ✅ open | ✅ `"tap_element" in ACTION_TYPES` |
| Union type only | ✅ | None | N/A | ✅ but no runtime value |

The project already uses `REASON_CODES` with `as const` — this plan extends that pattern.

---

## Problem Inventory

### Category A: Tool Names — 60 names × 60+ locations (P0)

| File | Count | Pattern |
|------|-------|---------|
| `packages/mcp-server/src/index.ts` | 60 | `name: "capture_js_console_logs"` in TOOL_DESCRIPTORS |
| `packages/mcp-server/src/index.ts` | ~8 | `withPolicy("tool_name", ...)` / `withSessionExecution("tool_name", ...)` |
| `packages/mcp-server/src/cli/preset-runner.ts` | ~15 | `{ tool: "start_session" }` in preset steps |
| `packages/adapter-maestro/src/capability-model.ts` | 60+ | `buildToolCapability("tool_name", ...)` in Android/iOS capability builders |
| `packages/adapter-maestro/src/capability-model.ts` | 18 | `IOS_CONDITIONAL_TOOL_FRONTIER` / `ANDROID_CONDITIONAL_TOOL_FRONTIER` arrays |
| `scripts/validate-dry-run.ts` | 40+ | `name: "..."` in test case definitions |

### Category B: Action Types — 12 types × 40+ locations (P1)

| File | Count | Pattern |
|------|-------|---------|
| `packages/adapter-maestro/src/recording-mapper.ts` | ~15 | `actionType: "type_into_element"` |
| `packages/adapter-maestro/src/replay-step-planner.ts` | ~25 | `actionType: "tap_element"`, `actionType: "wait_for_ui"`, etc. |

Existing `SupportedActionType` in `types.ts` defines only 6 of 12 types used. Missing: `"tap"`, `"assert_not_visible"`, `"run_sub_flow"`, `"back"`, `"home"`, `"hide_keyboard"`.

**Resolution**: Split into `SupportedActionType` (6 values, backward-compat) + `ActionType` (12 values, full). Recording/replay code should use the broader `ActionType`.

### Category C: Policy Scopes — 6 values × 67+ locations (P1)

| File | Count | Values |
|------|-------|--------|
| `packages/mcp-server/src/index.ts` | 67+ | `"read"`, `"write"`, `"diagnostics"`, `"interrupt"`, `"interrupt-high-risk"`, `"none"` |

### Category D: CLI Command Names — 5 executables × 170+ locations (P2)

| File | Count | Values |
|------|-------|--------|
| `device-runtime-android.ts` | ~25 | `"adb"` repeated in every command builder |
| `performance-runtime.ts` | ~12 | `"adb"`, `"xcrun"`, `"perfetto"`, `"xctrace"` |
| `ui-runtime-android.ts` | ~3 | `"adb"` |
| `ios-backend-devicectl.ts` | ~4 | `"xcrun"`, `"maestro"` |
| `doctor-guidance.ts` | ~10 | `"adb"`, `"maestro"`, etc. |
| `doctor-runtime.ts` | ~5 | `"adb"`, `"xcrun"`, `"trace_processor"` |

**Note**: `"simctl"`, `"devicectl"`, `"xctrace"` are subcommands of `xcrun`, not standalone CLIs. They compose as `["xcrun", "simctl", ...]`. No separate constant needed for subcommands.

**Lower priority reason**: These are shell command literals that are unlikely to change (adb will always be called "adb"). Value is deduplication, not drift prevention.

**Separate concern**: `backendId` values (`"wda"`, `"axe"`, `"simctl"`, `"devicectl"`, `"maestro"`, `"idb"`) in `ios-backend-types.ts` are routing identifiers, NOT CLI command names. They stay as the existing union type.

### Category E: Capability Group Names — 6 names × 6 locations (P3)

| File | Count | Pattern |
|------|-------|---------|
| `capability-model.ts` | 6 | `summarizeGroup(..., "session_management", ...)` |

**Lowest priority**: used exactly once per group in `buildCapabilityProfile`. Minimal drift risk.

### Category F: Status/Outcome Literals — 529+ locations (OUT OF SCOPE)

`"success"`, `"failed"`, `"partial"`, `"none"` appear across index.ts, policy-guard.ts, preset-runner.ts, and all test files.

**Why out of scope**: These are already constrained by TypeScript union types (`ActionOutcomeStatus`, `ToolResult.status`). A typo causes a compile error — the type system is the guardrail. Extracting to `STATUS.failed` adds negligible value.

---

## Sub-tasks

### 20-01: Create `TOOL_NAMES` constant (contracts, Tier 1)

**File**: `packages/contracts/src/constants/tool-names.ts`

```typescript
export const TOOL_NAMES = {
  // Session lifecycle
  startSession: "start_session",
  endSession: "end_session",
  describeCapabilities: "describe_capabilities",
  runFlow: "run_flow",
  requestManualHandoff: "request_manual_handoff",
  // ... all 60, grouped by functional area
} as const;

/**
 * TOOL_NAMES values must match MobileE2EMcpToolName exactly.
 * MobileE2EMcpToolName = keyof MobileE2EMcpToolContractMap (server.ts)
 * is the authoritative source. TOOL_NAMES is the consumer-facing constant.
 * No new type is created here — existing MobileE2EMcpToolName remains canonical.
 */
```

Re-export from `packages/contracts/src/index.ts`:
```typescript
export { TOOL_NAMES } from "./constants/tool-names.js";
```

### 20-02: Create `ACTION_TYPES` constant (contracts, Tier 1)

**File**: `packages/contracts/src/constants/action-types.ts`

```typescript
export const ACTION_TYPES = {
  // Primary actions (match SupportedActionType — 6 values, backward-compat)
  tapElement: "tap_element",
  typeIntoElement: "type_into_element",
  waitForUi: "wait_for_ui",
  launchApp: "launch_app",
  terminateApp: "terminate_app",
  swipe: "swipe",
  // Extended actions (used by recording-mapper / replay-step-planner only — 6 more)
  tap: "tap",
  assertNotVisible: "assert_not_visible",
  runSubFlow: "run_sub_flow",
  back: "back",
  home: "home",
  hideKeyboard: "hide_keyboard",
} as const;

/** The full 12-value union — used internally by recording/replay layer. */
export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

/** The original 6-value subset — kept for backward compatibility. */
export type SupportedActionType =
  | typeof ACTION_TYPES.tapElement
  | typeof ACTION_TYPES.typeIntoElement
  | typeof ACTION_TYPES.waitForUi
  | typeof ACTION_TYPES.launchApp
  | typeof ACTION_TYPES.terminateApp
  | typeof ACTION_TYPES.swipe;
```

**Breaking change**: Replace the old `type SupportedActionType` definition in `types.ts:25` with an import from `constants/action-types.ts`. The 6-value type remains identical — no consumer behavior change. Extended action users should switch to the broader `ActionType` type.

Re-export from `packages/contracts/src/index.ts`:
```typescript
export { ACTION_TYPES, type ActionType, type SupportedActionType } from "./constants/action-types.js";
```

### 20-03: Create `POLICY_SCOPES` constant (mcp-server, Tier 2)

**File**: `packages/mcp-server/src/constants/policy-scopes.ts`

```typescript
export const POLICY_SCOPES = {
  none: "none",
  read: "read",
  write: "write",
  diagnostics: "diagnostics",
  interrupt: "interrupt",
  interruptHighRisk: "interrupt-high-risk",
} as const;

export type ToolPolicyRequirement = typeof POLICY_SCOPES[keyof typeof POLICY_SCOPES];
```

**Breaking change**: Remove the inline `type ToolPolicyRequirement` from `index.ts` and import from the constant module instead.

### 20-04: Create `CLI_COMMANDS` constant (adapter-maestro, Tier 3)

**File**: `packages/adapter-maestro/src/constants/cli-commands.ts`

```typescript
export const CLI_COMMANDS = {
  // Android CLI
  adb: "adb",
  // Cross-platform
  maestro: "maestro",
  traceProcessor: "trace_processor",
  // iOS toolchain
  xcrun: "xcrun",
  xctrace: "xctrace",
  // Note: "simctl", "devicectl" are subcommands of xcrun, not standalone CLIs.
  // They are used as string literals in command arrays like ["xcrun", "simctl", ...].
  // No separate constant needed — they compose with CLI_COMMANDS.xcrun.
} as const;

/**
 * Backend routing IDs (backendId) are a SEPARATE concern from CLI commands.
 * backendId = "wda" | "axe" | "simctl" | "devicectl" | "maestro" | "idb"
 * lives in ios-backend-types.ts as a type-level routing identifier.
 * It is NOT the same as a CLI executable name.
 * Do NOT merge backendId into this constant module.
 */
```

### 20-05: Create `CAPABILITY_GROUPS` constant (adapter-maestro, Tier 3)

**File**: `packages/adapter-maestro/src/constants/capability-groups.ts`

```typescript
export const CAPABILITY_GROUPS = {
  sessionManagement: "session_management",
  recordingAndReplay: "recording_and_replay",
  appLifecycle: "app_lifecycle",
  artifactsAndDiagnostics: "artifacts_and_diagnostics",
  uiInspection: "ui_inspection",
  uiActions: "ui_actions",
} as const;
```

### 20-06: Refactor `index.ts` — use TOOL_NAMES + POLICY_SCOPES

1. Replace all 60 `name: "tool_name"` with `name: TOOL_NAMES.camelCaseName`
2. Replace `withPolicy("tool_name", ...)` with `withPolicy(TOOL_NAMES.camelCaseName, ...)`
3. Replace `withSessionExecution("tool_name", ...)` similarly
4. Replace `requiredScopes: ["read"]` with `requiredScopes: [POLICY_SCOPES.read]`
5. Remove inline `type ToolPolicyRequirement` (now from POLICY_SCOPES)
6. Update `createServer()` registry construction to use `TOOL_NAMES` keys

### 20-07: Refactor `capability-model.ts` — use TOOL_NAMES

1. Replace all `buildToolCapability("tool_name", ...)` with `buildToolCapability(TOOL_NAMES.camelCaseName, ...)`
2. Replace `IOS_CONDITIONAL_TOOL_FRONTIER` array entries with `TOOL_NAMES.*` references
3. Replace `ANDROID_CONDITIONAL_TOOL_FRONTIER` array entries similarly
4. The `FULL`, `PARTIAL`, `UNSUPPORTED`, `CONDITIONAL` local constants are fine as-is (type-constrained)

### 20-08: Refactor `preset-runner.ts` — use TOOL_NAMES

1. Replace all `{ tool: "tool_name" }` with `{ tool: TOOL_NAMES.camelCaseName }`
2. Update `invokePresetStep` string comparisons to use `TOOL_NAMES.*`

### 20-09: Refactor `recording-mapper.ts` and `replay-step-planner.ts` — use ACTION_TYPES

1. Replace all `actionType: "type_into_element"` with `actionType: ACTION_TYPES.typeIntoElement`
2. Replace all `actionType: "tap"` with `actionType: ACTION_TYPES.tap`
3. etc. for all 12 action types
4. Change `actionType` field types from `SupportedActionType` to `ActionType` (the broader 12-value type) in these two files only

### 20-10: Refactor adapter-maestro CLI command usage

1. Replace `["adb", "-s", deviceId, ...]` with `[CLI_COMMANDS.adb, "-s", deviceId, ...]`
2. Replace `"xcrun"` with `CLI_COMMANDS.xcrun`
3. Replace `"maestro"` with `CLI_COMMANDS.maestro`
4. Subcommands like `"simctl"`, `"devicectl"`, `"xctrace"` compose with `CLI_COMMANDS.xcrun`: `[CLI_COMMANDS.xcrun, "simctl", ...]`
5. `backendId` type and values in `ios-backend-types.ts` are **not** changed — they are routing identifiers, not CLI executables

### 20-11: Refactor capability group names

1. Replace `summarizeGroup(..., "session_management", ...)` with `summarizeGroup(..., CAPABILITY_GROUPS.sessionManagement, ...)`
2. All 6 occurrences in `buildCapabilityProfile`

### 20-12: Verify — zero regressions

- `pnpm build` passes
- `pnpm test` passes
- `pnpm lint` passes
- No runtime behavior change (all string values preserved identically)

---

## Execution Order

```
20-01 (TOOL_NAMES) ──┬── 20-06 (refactor index.ts)
                     ├── 20-07 (refactor capability-model.ts)
                     ├── 20-08 (refactor preset-runner.ts)
                     └── scripts/tools update
                     │
20-02 (ACTION_TYPES) ──┬── 20-09 (refactor recording-mapper, replay-step-planner)
                       └── types.ts backward compat update
                       │
20-03 (POLICY_SCOPES) ─── 20-06 (shared refactoring)
                       │
20-04 (CLI_COMMANDS) ─── 20-10 (refactor device-runtime-*, performance-*, doctor-*)
                       │
20-05 (CAPABILITY_GROUPS) ─── 20-11 (refactor buildCapabilityProfile)
                       │
                       └── 20-12 (verification)
```

**Wave 1**: 20-01, 20-02, 20-03, 20-04, 20-05 (define constants — parallel)
**Wave 2**: 20-06, 20-07, 20-08, 20-09, 20-10, 20-11 (refactor consumers — parallel)
**Wave 3**: 20-12 (verify — sequential)

---

## Constraints

- Must not change any runtime behavior or MCP tool contract surface
- Must maintain backward compatibility for all 60 tool name strings (values must not change)
- `TOOL_NAMES` values must match `MobileE2EMcpToolName` (`keyof MobileE2EMcpToolContractMap`) exactly
- `SupportedActionType` must remain a 6-value type for backward compatibility; new `ActionType` (12 values) is additive only
- `SupportedActionType` type must remain available at the same export path (types.ts re-export)
- `backendId` union type in `ios-backend-types.ts` is NOT touched — routing identifiers ≠ CLI commands
- Test files are **in scope** for constant migration where they construct tool call arguments (preset-runner, stdio-server tests); test assertions using `"success"`/`"failed"` are out of scope (Category F)

## Verification

1. Build: `pnpm build` — zero errors
2. Tests: `pnpm test` — all pass
3. Lint: `pnpm lint` — zero issues
4. Manual: verify `describe_capabilities` output still lists all 60 tool names with identical snake_case strings

## Rejected Alternatives

- **Per-file constants**: Duplicates the established `REASON_CODES` pattern; tiered placement by consumer scope is cleaner
- **Runtime enum**: `as const` object is simpler, no JS overhead, same compile-time safety, supports `"key" in CONST` runtime checks
- **Central `constants.ts` mega-file**: Harder to navigate; one constant module per concept is better for discovery and import granularity
- **Code generation from TOOL_DESCRIPTORS**: Over-engineering for a one-time extraction; manual constants are auditable and the source list is finite
