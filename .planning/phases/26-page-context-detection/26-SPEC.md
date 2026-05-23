# Phase 26: Page Context Detection and Pre-flight Governance

## Summary

Phase 26 organizes the proposed **page context detection** capability into a repo-native planning package for later implementation.

The capability goal is to let the harness detect whether the current surface is a normal page, dialog, alert, sheet, modal, system overlay, or other special context before or during tool execution, then feed that signal into MCP tools, interruption handling, policy gating, and evidence timelines.

This phase is intentionally a **planning-and-normalization** slice, not a claim that the repository already ships this capability.

## Current Shipped Status

- No runtime, contract, tool-registry, or public-doc behavior has been changed by this phase package.
- This directory records planning inputs and implementation gates only.

## Source Inputs

- External source design doc: `page-context-design-final.md` (operator-provided)
- External source review/issues doc: `issue_list.md` (operator-provided)
- Repo planning rules: `.planning/PLANNING-PROTOCOL.md`
- Capability-expansion guardrail: `docs/engineering/ai-first-capability-expansion-guideline.md`

## Planning Truth / Supersession Rule

- For any later implementation work in this phase, `26-SPEC.md` and `ISSUE_LIST.md` are the planning truth for scope, blockers, and implementation gates.
- The original external design doc remains background/reference material only.
- If the original design doc conflicts with these Phase 26 planning artifacts, the Phase 26 artifacts win.
- Any future Phase 26 code PR must not cite `page-context-design-final.md` as the implementation authority. If that document is mentioned at all, it must be cited as background material only.

## Implementation Entry Rule

- `26-SPEC.md` is the single implementation entry document for Phase 26.
- Any later execution session should start from this file first, then use `ISSUE_LIST.md` as the blocking/gating companion document and `26-PLAN.md` as the execution-order companion document.
- Implementers should not start from the external design draft, isolated issue notes, or remembered chat context.
- If any future Phase 26 sub-plan is created, it should explicitly reference this rule rather than creating a competing implementation entrypoint.

## Problem Statement

The source design identifies a useful missing capability: the harness can already inspect UI, classify interruptions, and run deterministic actions, but it does not yet have a unified, cross-platform **page context** layer that can answer questions like:

- is the current surface a normal app page or an interrupting overlay?
- should the next action be blocked, allowed, or routed to interruption handling?
- can existing tools reuse one detection result instead of re-deriving similar signals independently?

The review notes show that the raw design is directionally strong but not yet safe to implement as-is because several parts drift from live repo truth.

## Capability Goal

Target-state outcome for later implementation:

Introduce a page-context capability that is:

1. **Deterministic-first** on Android, iOS simulator, and iOS real-device lanes.
2. **Contract-safe** with the repo's existing `ToolResult<T>` envelope, reason-code taxonomy, session model, and platform model.
3. **Policy-aware** so action pre-flight can block or allow execution using explicit settings.
4. **Evidence-backed** so every detection can be written into timeline/artifact flows and later reused by explain/replay/remediation paths.
5. **Bounded in fallback behavior** so any visual downgrade remains explicit, optional, and auditable.

## Locked Scope

### In scope

- Define a normalized `PageContext` contract and related data types.
- Add deterministic detector lanes for Android, iOS simulator, and iOS real device.
- Add a core `PageContextDetector` service with caching and explicit invalidation behavior.
- Expose `get_page_context` and reuse page-context data in existing tool surfaces where appropriate.
- Add policy-driven action pre-flight interception.
- Define how page context maps into existing interruption classification and recovery semantics.
- Define bounded vision fallback constraints and evidence requirements.

### Out of scope

- Shipping the feature in the current planning-only phase.
- Implicit platform-enum expansion that breaks current `Platform` contracts.
- Any OCR-first or unbounded vision path.
- Hiding platform differences behind a fake universal abstraction.
- Expanding support claims before tests, docs, and capability reporting are aligned.

## Design Synthesis

### 1. Contracts first, runtime second

The implementation must start from `packages/contracts`, not from adapter code. The design should define:

- `PageContextType`
- `DetectionSource`
- `PageContext`
- MCP input/output data types that remain compatible with the repo's current result envelope
- any new reason codes only when the current taxonomy cannot express the new outcome cleanly

### 2. Deterministic platform detection lanes

The source design proposes three platform-specific detector families:

- **Android**: `dumpsys window` + `dumpsys activity top` as fast deterministic signals
- **iOS real device / WDA**: active app info plus lightweight existence checks for alert/sheet surfaces
- **iOS simulator / axe**: accessibility-tree inspection with shallow top-window scanning

The review notes tighten this further:

- Android parsing should be tolerant and line-based, not fragile regex-only parsing.
- iOS real-device pre-flight must not depend on WDA `/source` because that is still a heavy page-source path.
- iOS subtree extraction should be scoped to the alert/sheet subtree instead of globally scraping all text/buttons.
- iOS simulator detection should scan top-level windows/candidates instead of assuming a fixed `children[0] -> children[0]` shape.

### 3. Core service + MCP exposure

The design remains strongest when detection is centralized in one reusable service layer that:

- runs platform detection
- evaluates policy-aware interruptibility
- caches recent results for short windows
- supports explicit invalidation after state-changing actions
- appends timeline/evidence data without forcing duplicate collection paths

The public MCP surface should then consume that service rather than reimplement detection logic inside each tool.

### 4. Policy and interruption integration

Page context should describe **surface semantics**. Interruption handling should continue to describe **governance/action semantics**. The two need an explicit mapper, not two disconnected taxonomies.

Recommended layering:

- `PageContextType` = what surface is visible
- `InterruptionType` = how the harness should reason about and handle it
- `PageContext -> InterruptionType` mapper = explicit bridge used by interruption tools and action pre-flight

### 5. Bounded fallback and evidence

Visual fallback is acceptable only when:

- deterministic signals remain primary
- fallback is policy-gated and off by default
- fallback confidence stays bounded and explicit
- evidence is written into artifacts/timeline in a machine-consumable form

The review correctly pushes this toward **constraints first** rather than prematurely hard-locking one library stack.

## Red-Line Corrections Before Implementation

The issue list identifies four design blockers that must be resolved before implementation begins:

1. **All new outputs must remain inside the existing `ToolResult<T>` envelope.**
2. **`Platform` and `appId/targetAppId` semantics must be aligned with live contracts instead of inventing parallel fields.**
3. **WDA `/source` must be removed from the pre-flight path.**
4. **`PageContextType` must map explicitly into the existing interruption taxonomy.**

These are not optional refinements. They are the entry gate for safe implementation.

## Recommended Delivery Slices

### Slice A — Contract and taxonomy alignment

- Normalize `ToolResult<T>` usage
- Define page-context data model
- Resolve platform/backend modeling
- Resolve `appId` / `targetAppId` override rules
- Add `PageContextType -> InterruptionType` mapper design
- Decide the reason-code strategy up front: the current repo does **not** define `PAGE_CONTEXT_INTERRUPTED`, so Slice A must explicitly choose whether to add that reason code or reuse an existing taxonomy path before any runtime code begins.

### Slice B — Deterministic detector runtime

- Android tolerant parsing
- iOS WDA lightweight detection without `/source` in pre-flight
- iOS axe top-window scanning
- subtree-scoped alert/button extraction

### Slice C — Core service and MCP exposure

- singleton detector service
- TTL cache + post-action invalidation hooks
- `get_page_context`
- optional `inspect_ui.pageContext` reuse

### Slice D — Policy/interceptor integration

- pre-flight action gating
- policy config additions
- interruption-tool reuse through the shared detector/mapper

### Slice E — Bounded vision fallback and evidence

- policy-gated fallback
- explicit confidence semantics
- evidence storage and timeline wiring
- no OCR-first path and no unbounded waits

## File Impact Preview

Likely affected formal truth owners if this phase is executed later:

- `packages/contracts/src/types.ts` or focused page-context types module
- `packages/contracts/src/index.ts`
- `packages/contracts/src/reason-codes.ts`
- `packages/core/src/services/page-context-detector.ts`
- `packages/core/src/executor/action-router.ts`
- `packages/core/src/policy-engine.ts`
- `packages/adapter-maestro/src/detectors/*`
- `packages/adapter-vision/src/*` (only for bounded fallback slice)
- `packages/mcp-server/src/policy-guard.ts`
- `packages/mcp-server/src/tools/get-page-context.ts`
- existing interruption tool handlers and/or their shared mapper path
- `README.md`
- `docs/guides/ai-agent-invocation.zh-CN.md`
- relevant tests across contracts/core/adapters/mcp-server

## Acceptance Gates For Future Execution

The implementation phase should not be considered done until all of the following are true:

- contract changes are compatible with the repo's existing result-envelope model
- deterministic pre-flight does not trigger forbidden heavy paths
- page-context and interruption semantics are explicitly bridged
- action success does not rely on stale cached context after state-changing actions
- support boundaries and invocation guidance are updated alongside code/tests
- capability claims remain aligned with live registry and verification evidence
