# Phase 26 Implementation Gate Checklist

## Objective

Turn the four original red-line blockers in Phase 26 into one practical go/no-go checklist for implementation startup.

Implementation may start **only after** this checklist has been reviewed and all gate items that apply to the first code slice have explicit answers.

## Entry Rule

- [ ] Start from `26-SPEC.md`, not from the external draft or remembered chat context.
- [ ] Read `ISSUE_LIST.md` before touching code.
- [ ] Use this checklist together with `26-PLAN.md` to decide whether the next implementation slice is truly unblocked.
- [ ] Confirm no Phase 26 implementation PR will cite `page-context-design-final.md` as the implementation authority.

## Gate Closure Record

| Gate | Status | Decision record | Notes |
|---|---|---|---|
| 26-01 | Closed | `26-01-DECISION.md` | Envelope shape, canonical payloads, type placement/export order |
| 26-02 | Closed | `26-02-DECISION.md` | Platform truth, app identity ownership, override policy |
| 26-03 | Closed | `26-03-DECISION.md` | `/status` vs `/source`, allowed runtime capture paths |
| 26-04 | Closed | `26-04-DECISION.md` | One-way mapper semantics, downstream interruption reuse |

## Gate 1 — `ToolResult<T>` Envelope Alignment (`26-01`)

- [ ] Confirm no Phase 26 tool will introduce custom top-level statuses such as `blocked`, `interrupted`, or `clear` outside the repo-standard `ToolResult<T>` envelope.
- [ ] Confirm `pageContext`, pre-flight decision details, interruption mapping details, and any related structured fields will live under `data` and/or existing envelope fields.
- [ ] Confirm blocked/interrupted/pre-flight outcomes have an agreed envelope-compatible representation before runtime code begins.
- [ ] Confirm the reason-code decision is treated separately from the envelope-shape decision.
- [ ] Confirm a canonical payload example exists in the gate artifacts before runtime code begins.
- [ ] Confirm the type placement/export order is locked before downstream consumers are changed.

## Gate 2 — Platform / App Identity Contract Alignment (`26-02`)

- [ ] Confirm top-level `Platform` remains aligned with live repo truth (`android | ios`) unless an explicit contract migration is approved first.
- [ ] Confirm iOS simulator / real-device / backend-lane differences are modeled as subordinate metadata rather than new top-level platform values such as `ios-sim` or `ios-real`.
- [ ] Confirm `appId` remains the canonical session/tool identity field unless there is an explicit repo-wide decision proving `targetAppId` is required.
- [ ] Confirm later Phase 26 tools will respect existing MCP session-bound validation for `platform` and `appId` consistency.

## Gate 3 — WDA `/source` Pre-flight Boundary (`26-03`)

- [ ] Confirm iOS real-device pre-flight does **not** route through WDA `/source`.
- [ ] Confirm lightweight pre-flight signals are explicitly identified (for example readiness/health probes and other deterministic low-cost signals).
- [ ] Confirm `/source` remains allowed only for explicit hierarchy-reading flows, explicit refresh, diagnostics, or bounded fallback.
- [ ] Confirm no shallow-parsing argument is being used to justify `/source` as a “cheap” pre-flight signal.

## Gate 4 — `PageContextType -> InterruptionType` Bridge (`26-04`)

- [ ] Confirm `PageContextType` is defined as surface semantics only.
- [ ] Confirm `InterruptionType` remains the governance/action taxonomy used for policy routing, telemetry, and interruption resolution.
- [ ] Confirm there is an explicit one-way mapper from `PageContextType` into `InterruptionType`.
- [ ] Confirm no later Phase 26 slice will branch policy, telemetry, or resolution directly on raw `PageContextType`.
- [ ] Confirm the mapper is allowed to consult extra signals where necessary (for example owner bundle/package, container role, visible action/button shape, or system-surface markers).

## Cross-Gate Decision Checks

- [ ] Confirm the current repo still has **no live `PageContextType` symbol** and that Phase 26 is not pretending the mapper already exists in code.
- [ ] Confirm the current repo still has interruption tools and taxonomy in place, so Phase 26 is integrating with existing interruption logic rather than replacing it.
- [ ] Confirm no proposed implementation slice silently expands support claims, public docs, or tool catalog language ahead of code/tests.
- [ ] Confirm later detector/runtime work will not start until the relevant gate decisions above are explicit enough to avoid reopening contract questions mid-implementation.

## Implementation Startup Questions

Before opening code work for a specific Phase 26 slice, answer all of the following in writing:

- [ ] Which of the four gates does this slice depend on?
- [ ] Which gate decisions are already locked by the existing Phase 26 plans?
- [ ] Which open decisions still need to be resolved before code starts?
- [ ] Which contracts/core/adapter/server/docs truth owners will be touched first?
- [ ] What would constitute scope drift for this slice?

## Exit Criteria

- [ ] All four original red-line blockers now have explicit planning slices (`26-01` through `26-04`).
- [ ] Each gate has a short decision record that captures the final choice instead of leaving the code to re-decide it implicitly.
- [ ] The next implementation slice can name which gates are already closed and which decisions remain open.
- [ ] A future implementation session can use this checklist to decide “can we start code now?” without re-deriving the Phase 26 blockers from scratch.
