---
phase: 26-page-context-detection
plan: 01
title: Normalize page context detection into repo-safe implementation slices
status: planned
summary_file: null
verify_file: null
depends_on: []
formal_truth_owners:
  - packages/contracts/src/types.ts
  - packages/contracts/src/index.ts
  - packages/contracts/src/reason-codes.ts
  - packages/core/src/services/page-context-detector.ts
  - packages/core/src/executor/action-router.ts
  - packages/core/src/policy-engine.ts
  - packages/adapter-maestro/src/detectors/
  - packages/mcp-server/src/policy-guard.ts
  - packages/mcp-server/src/tools/
  - README.md
  - docs/guides/ai-agent-invocation.zh-CN.md
---

# Phase 26 Plan 01 — Page Context Detection Planning Baseline

## Goal

### Problem

The repository has the building blocks for UI inspection, interruption handling, and deterministic action routing, but it does not yet have a normalized page-context capability that safely bridges surface semantics, action pre-flight, interruption routing, and evidence capture.

### Expected Outcome

- [ ] Phase 26 has a repo-native spec, issue list, and execution plan under `.planning/phases/26-page-context-detection/`.
- [ ] The design is normalized around current repo truth instead of the raw source document's contract drift.
- [ ] The future implementation order is explicit enough that a later execution session can start without recovering hidden context.
- [ ] The red-line blockers are called out as implementation gates, not buried as review comments.

### Non-goals

- Shipping page-context detection in code during this planning step.
- Updating runtime docs, contracts, or MCP tool registry as if the capability already exists.
- Broadening support claims before detector/runtime validation exists.

## Scope

### In Scope

- Create a repo-native planning package for the page-context proposal.
- Normalize the source design against repo contract/policy/evidence constraints.
- Preserve the source issue list as explicit implementation gates.
- Define the recommended implementation order and likely formal truth owners.

### Out of Scope

- Executing any code changes from the proposal.
- Claiming Phase 26 has already shipped the capability.
- Performing roadmap/state completion sync beyond this phase-package creation step.

## Plan

### Strategy

Use the source design as the target-state capability proposal, use the issue list as the correction layer, and turn both into a repo-safe execution baseline. The resulting plan should preserve the valuable architecture while forcing alignment with the repo's existing contract, policy, session, and evidence rules.

Implementation supersession rule: the external source design is background material only. Later implementation work in this phase should treat `26-SPEC.md` plus `ISSUE_LIST.md` as the Phase 26 planning truth whenever the older design examples conflict with repo-safe execution rules.

Phase 26 code-PR rule: implementation PRs must not use `page-context-design-final.md` as the cited implementation authority. PR rationale should cite `26-SPEC.md`, `ISSUE_LIST.md`, the relevant `26-0x-PLAN.md`, and any gate decision artifact instead.

Implementation entry rule: `26-SPEC.md` is the first document a future implementation session should open for Phase 26. `ISSUE_LIST.md` is the gate/checklist companion, and this `26-PLAN.md` remains the execution-order and scope-management companion.

Implementation gate checklist: `IMPLEMENTATION-GATE-CHECKLIST.md` is the practical go/no-go checklist for opening Phase 26 code work after reviewing `26-SPEC.md`.

Gate decision artifacts: each red-line gate should produce a short decision record before or at the end of execution. Use `26-01-DECISION.md` through `26-04-DECISION.md` to record the final choice, rejected alternatives, and the truth owners touched by that decision.

### Execution Slices

1. **26-01 — `ToolResult<T>` envelope alignment**
   - File: `.planning/phases/26-page-context-detection/26-01-PLAN.md`
   - Purpose: resolve the first hard gate by defining how page-context capability outputs stay inside the repo's existing result envelope instead of inventing a parallel top-level status model.

2. **26-02 — platform and app identity contract alignment**
   - File: `.planning/phases/26-page-context-detection/26-02-PLAN.md`
   - Purpose: resolve the second hard gate by locking Phase 26 to the live `Platform` and `appId` session/tool model, and by explicitly deciding how any iOS backend flavor detail is represented without redefining top-level platform truth.

3. **26-03 — WDA `/source` pre-flight removal**
   - File: `.planning/phases/26-page-context-detection/26-03-PLAN.md`
   - Purpose: resolve the third hard gate by separating lightweight real-device pre-flight checks from heavy WDA hierarchy capture, so Phase 26 does not route page-context gating through `/source`.

4. **26-04 — page-context to interruption taxonomy mapping**
   - File: `.planning/phases/26-page-context-detection/26-04-PLAN.md`
   - Purpose: resolve the fourth hard gate by defining the explicit one-way bridge from `PageContextType` into the repo's existing `InterruptionType` model, policy routing, and interruption telemetry path.

Advancement rule: do not start later runtime-facing Phase 26 slices until `26-01` has locked the envelope shape, reason-code placement rules, and MCP-facing result semantics for page-context-related tools, `26-02` has locked the contract-safe platform/app identity model, `26-03` has locked the deterministic pre-flight boundary for iOS real-device detection, and `26-04` has locked the explicit mapping bridge into the existing interruption taxonomy.

### Current Post-Gate Integration Status

- Gates `26-01` through `26-04` are now closed at their first implementation seam.
- The first post-gate integration slice is now in place: minimal end-to-end `get_page_context` wiring across contracts, adapter-maestro, and mcp-server.
- The second post-gate integration slice is now in place: a dedicated deterministic page-context detector/runtime seam (`page-context-detector.ts`) and `get_page_context` now consumes that detector instead of embedding all derivation logic inline.
- The third post-gate integration slice is now in place: Android-specific deterministic detector enhancement for foreign-owner overlays, using stable summary signals (`blockingSignals`, `readiness`, `ownerPackage`, `appId`) rather than new parser or fallback paths.
- The fourth post-gate integration slice is now in place: iOS simulator deterministic detector enhancement for foreign Apple-owned dialog-like surfaces, using stable summary signals (`blockingSignals`, `readiness`, `ownerBundle`, `appId`) rather than new parser or fallback paths.
- The fifth post-gate integration slice is now in place: a bounded page-context detector service with private TTL caching, and `get_page_context` now routes through that service instead of calling the detector directly.
- The sixth post-gate integration slice is now in place: bounded post-action cache invalidation for page-context results, clearing session-scoped detector cache when a write action materially changes state.
- The seventh post-gate integration slice is now in place: `get_screen_summary` reuses the page-context service and exposes `pageContext` alongside existing screen-summary data.
- The eighth post-gate integration slice is now in place: `inspect_ui` reuses the page-context service on successful summary paths and exposes `pageContext` alongside existing UI inspection data.
- The ninth post-gate integration slice is now in place: `perform_action_with_evidence` records pre-action page-context gating hints and mapped interruption semantics before action execution.
- The tenth post-gate integration slice is now in place: explorer main pipeline carries `pageContext` through snapshot, page registry, summary.json, and report.md.
- The eleventh post-gate integration slice is now in place: explorer engine runtime traces log `pageType` at root capture, before tap, and after transition/rejection using `snapshot.pageContext`.
- The current integration remains intentionally read-only and bounded. It still does **not** claim full cross-platform detector completeness, core service orchestration, or bounded fallback coverage.

### Read First

- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/PLANNING-PROTOCOL.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/architecture/adapter-code-placement.md`
- external operator-provided source design: `page-context-design-final.md`
- external operator-provided issue list: `issue_list.md`
- `.planning/phases/03-capability-truth-guardrails/03-CONTEXT.md`
- `.planning/phases/22-back-navigation-capability/22-PLAN.md`
- `.planning/phases/25-full-app-explorer/25-SPEC.md`
- `.planning/phases/25-full-app-explorer/ISSUE_LIST.md`

### Task Breakdown

1. **Normalize the source design into a repo-native spec.**
   - Preserve the core capability idea.
   - Fold in the review corrections so the spec no longer implies unsafe contract or runtime choices.
   - Keep `26-SPEC.md` positioned as the single implementation entrypoint for this phase.

2. **Promote the source issue list into an execution gate.**
   - Separate red-line blockers from high-priority refinements.
   - Turn review findings into explicit GO / NO-GO conditions.

3. **Define the implementation slices in repo order.**
   - Contracts and taxonomy alignment first.
   - Deterministic platform detectors second.
   - Core service and MCP exposure third.
   - Policy/interruption integration fourth.
   - Bounded vision fallback last.

4. **Anchor future implementation against formal truth owners.**
   - Make the likely contracts/core/adapter/server/docs touch points explicit.
   - Keep support-boundary sync requirements visible from the start.

### Risks / Unknowns

- The source issue list references live repo truth, but this planning step does not independently re-verify every code claim.
- `.planning/ROADMAP.md` is referenced by existing planning docs but is currently absent from the workspace snapshot, so this plan does not attempt roadmap sync.
- The future implementation may need one or more numbered follow-on plans if the scope is split across contract/runtime/policy slices.

### Current Shipped Status

- This plan creates planning artifacts only.
- No shipped code, tool surface, or support boundary has been changed yet.

### Done Criteria

- [ ] A future implementer can identify the capability goal, the blockers, the delivery order, and the likely repo touch points from Phase 26 alone.
- [ ] The phase artifact set preserves both source inputs: the design intent and the issue list.
- [ ] The phase package does not overclaim that the feature is already implemented.
- [ ] The phase package stays aligned with `.planning` conventions used elsewhere in the repo.

## Implement

### Planned Changes

- `.planning/phases/26-page-context-detection/26-SPEC.md` — normalized target-state capability spec derived from the source design and corrections.
- `.planning/phases/26-page-context-detection/ISSUE_LIST.md` — repo-native issue and gating list derived from the source review notes.
- `.planning/phases/26-page-context-detection/26-PLAN.md` — execution baseline for future implementation.

### Key Decisions To Preserve

- Treat page context as an **AI-first capability expansion**, not as a local adapter tweak.
- Resolve contract drift before any runtime implementation begins.
- Keep deterministic detection primary and any fallback explicit, bounded, and auditable.
- Do not let page-context taxonomy fork away from interruption taxonomy without a mapper.
- Do not reintroduce heavy pre-flight paths that violate the repo's deterministic-first guardrails.

### Future Implementation Slices

#### Slice 1 — Contracts and taxonomy

- Define `PageContext` types and supporting enums.
- Normalize outputs to `ToolResult<T>`.
- Resolve platform/backend and app identity modeling.
- Define `PageContextType -> InterruptionType` mapping.
- Make an explicit reason-code decision before runtime work starts: the current repo does not define `PAGE_CONTEXT_INTERRUPTED`, so Slice 1 must choose whether to add it or reuse an existing code path.

#### Slice 2 — Deterministic platform detectors

- Android tolerant signal parsing.
- iOS real-device lightweight WDA detection.
- iOS simulator top-window AXe scanning.
- Scoped subtree extraction for alert metadata.

#### Slice 3 — Core service and MCP exposure

- singleton detector service
- TTL cache and explicit invalidation hooks
- `get_page_context`
- optional page-context reuse in existing read tools

#### Slice 4 — Policy and interruption integration

- action pre-flight gating
- config additions
- shared detector reuse in interruption-related tools

#### Slice 5 — Bounded fallback and evidence

- policy-gated vision fallback
- explicit confidence and evidence semantics
- artifact/timeline integration

## Verify

### Test Cases

- [ ] The phase package clearly separates source design intent from implementation blockers.
- [ ] The issue list can be used as an execution gate without reopening the original review text.
- [ ] The plan lists concrete future slices in a dependency-safe order.
- [ ] The artifacts use repo-native planning structure and naming.

### Verification Commands

This planning-only step does not require build/test execution. Verify by inspecting the created files and their placement under `.planning/phases/26-page-context-detection/`.

### Acceptance Criteria

- Phase 26 captures the page-context proposal in a way that is actionable for future execution.
- The planning artifacts make the four red-line blockers impossible to miss.
- The resulting package is consistent with repo planning conventions and does not redefine shipped behavior.

### Success Criteria

- A later execution session can use Phase 26 as the starting point for implementation planning.
- The design and issue inputs no longer live only in external download paths.
- The phase package reduces future decision cost instead of adding another ambiguous design note.
