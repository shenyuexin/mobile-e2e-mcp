# Phase 26 Issue List — Page Context Detection

This file normalizes the source review notes from `/Users/linan/Downloads/issue_list.md` into an execution-oriented backlog for Phase 26.

## Red-Line Blockers

These items must be resolved before implementation starts.

Planning supersession rule: when the original external design examples conflict with this issue list or `26-SPEC.md`, implementation should follow the Phase 26 planning artifacts rather than the older draft pseudocode.

### 1. Result-envelope drift

**Problem**

The source design introduces custom top-level statuses such as `blocked`, `interrupted`, and `clear`, plus standalone return bodies like `{ status, reasonCode?, pageContext }`. That conflicts with the repo's existing `ToolResult<T>` contract and shared result-envelope semantics.

**Required correction**

- Keep the repo-standard top-level envelope.
- Move page-context/interruption detail into `data`.
- Add new reason codes only if existing taxonomy cannot express the outcome.
- The current repo does **not** define `PAGE_CONTEXT_INTERRUPTED`; Slice A must decide whether to add it or reuse an existing reason-code path before any runtime implementation begins.

**Why it matters**

If this is not fixed first, contracts, server wrappers, contract tests, and tool-output validations will drift immediately.

### 2. Platform and app identity contract drift

**Problem**

The source design expands `platform` to `android | ios-sim | ios-real` and alternates between `appId` and `targetAppId` in ways that do not match current contract truth.

**Required correction**

- Keep platform truth aligned with the live repo model.
- Model iOS execution flavor/backend separately instead of exploding `Platform` if possible.
- Define a single rule for session-owned `appId` versus request-level `targetAppId` override behavior.

**Why it matters**

This affects sessions, MCP tool context, routing, capability reporting, and tests before detector code even runs.

### 3. WDA `/source` still violates pre-flight constraints

**Problem**

The design says pre-flight must avoid heavy full-tree serialization, but the iOS real-device L2 path still uses WDA `/source`.

**Required correction**

- Remove `/source` from pre-flight.
- If `/source` is ever used, confine it to a slow diagnostic path, explicit refresh, or bounded fallback path.

**Why it matters**

Client-side shallow parsing does not change the fact that `/source` is still a server-side hierarchy serialization path.

### 4. Dual taxonomy without a mapper

**Problem**

The proposed `PageContextType` introduces surface-level categories that overlap with the repo's existing `InterruptionType`, but no explicit mapper is defined.

**Required correction**

- Define a one-way `PageContextType -> InterruptionType` mapping layer.
- Allow the mapper to use additional signals such as owner bundle, button shape, or system-surface markers.

**Why it matters**

Without this bridge, interruption handling, policy gating, and timeline statistics will fork into parallel classification systems.

## High-Priority Correctness Issues

### 5. TTL cache needs explicit invalidation, not only a 500ms window

Keep the short TTL for anti-jitter behavior, but invalidate cached context after successful state-changing actions such as tap, type, navigate_back, launch, or reset.

### 6. Android parsing is too brittle in its current form

The source review notes that not only the fragment regex but also `parseCurrentFocus()` and `parseWindowType()` are too optimistic. Android detection should prefer host-side tolerant line parsing over narrow regex assumptions.

### 7. WDA subtree extraction is too broad

`extractAlertTitle()` and `extractAlertButtons()` must not scan globally. They should scope to the detected alert/sheet subtree.

### 8. AXe tree assumptions are too rigid

The iOS simulator path should scan the first two layers for top-level window/modal candidates instead of hard-coding a single child index path.

## Medium-Priority Design Constraints

### 9. Vision fallback should be constrained by runtime requirements, not locked to one library too early

Document the real requirements first:

- no native addon requirement for the chosen path
- CI portability across supported environments
- bounded cold-start overhead
- explicit timeout/circuit-breaker behavior

Then choose the lightest implementation that satisfies those constraints.

### 10. WDA session-prefix handling should be guaranteed in the client abstraction

Do not leave WDA session-prefix assumptions only in risk notes. The client layer should own that contract.

## Wording Corrections / Non-Issues

### 11. `detect_interruption` is not a stub assumption anymore

The source issue list notes that the repo already exposes interruption tools in the catalog and server/tool layers. Phase 26 should frame the work as **integration and reuse**, not as if those tools do not exist.

## Execution Order Recommendation

1. Resolve all four red-line blockers.
2. Then harden deterministic detector design details.
3. Then define policy integration and cache invalidation.
4. Leave bounded vision fallback as the last delivery slice.

## GO / NO-GO Gate

Phase 26 should remain **NO-GO for implementation** until all of the following are explicitly resolved in the planning and/or contracts:

- new outputs are normalized to `ToolResult<T>`
- platform/app identity semantics are contract-safe
- WDA `/source` is removed from pre-flight
- `PageContextType -> InterruptionType` mapping is defined
