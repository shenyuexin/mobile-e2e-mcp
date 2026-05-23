---
phase: 25-full-app-explorer
plan: 02A
title: Lock iOS Explorer baseline parity before hook extraction
status: planned
summary_file: 25-02A-SUMMARY.md
verify_file: 25-02A-VERIFY.md
requirements:
  - EXP-PLAT-01
  - EXP-PLAT-02
formal_truth_owners:
  - packages/explorer/src/snapshot.ts
  - packages/explorer/src/backtrack.ts
  - packages/explorer/src/element-prioritizer.ts
  - packages/explorer/tests/**/*.test.ts
  - scripts/explorer/test-explorer.ts
type: execute
wave: 1
depends_on:
  - phase: 25
    note: This is the first execution slice for the iOS-baseline-first hook refactor.
---

# Phase 25 Plan 02A — Lock iOS Explorer Baseline Parity

## Objective

- **What:** Turn commit `7804ac5d` into an explicit iOS Explorer behavioral baseline with fixture-backed parity gates.
- **Why:** The current Android-driven experimentation has already proven that shared explorer changes can accidentally redefine iOS semantics. Baseline lock must happen before hook extraction.
- **Output:** A regression harness that protects iOS parsing, title extraction, actionable-element classification, and back verification from accidental drift.

## Goal

### Problem

Explorer has no repo-tracked parity gate that says “this is the verified iOS behavior we must preserve while refactoring.” Without that gate, even well-intended platform-hook work can silently move iOS behavior.

### Expected Outcome

- [ ] iOS direct-tree and wrapped-payload shapes are both covered by explicit explorer tests.
- [ ] iOS title extraction, actionability filtering, and backtrack verification are pinned to the `7804ac5d` baseline.
- [ ] Any future shared explorer/parser changes that alter iOS behavior fail fast in tests.

### Non-goals

- Implementing hooks yet.
- Stabilizing Android behavior in this slice.
- State-graph redesign beyond what is needed to freeze the current iOS baseline.

## Plan

### Strategy

Capture the currently verified iOS semantics as the first-class truth source. Encode them as fixture-driven tests before moving any parsing or semantics behind hook modules.

### Read First

- `.planning/phases/25-full-app-explorer/25-02A-CONTEXT.md`
- `.planning/phases/25-full-app-explorer/25-02A-RISKS.md`
- `.planning/phases/25-full-app-explorer/25-02A-VERIFY-COMMANDS.md`
- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/PLANNING-PROTOCOL.md`
- `.planning/phases/25-full-app-explorer/25-02-PLAN.md`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `packages/explorer/src/element-prioritizer.ts`
- `packages/explorer/tests/**/*.test.ts`

### Task Breakdown

1. Identify the iOS behaviors from `7804ac5d` that must be preserved during refactor.
2. Add fixture-backed tests for iOS direct-tree and wrapped inspect payloads.
3. Add parity tests for title extraction and actionable-element classification.
4. Add backtrack verification tests for iOS-specific back semantics.
5. Add one explicit “shared parser change should not alter iOS baseline” guard test if needed.

### Risks / Unknowns

- Some iOS semantics may currently be implicit and need fixture capture before they can be asserted.
- Existing tests may accidentally validate implementation details rather than user-visible behavior.
- Wrapped-payload vs direct-tree differences may require small test helpers before assertions stay readable.

### Done Criteria

- [ ] `7804ac5d` iOS behaviors are described and enforced by tests.
- [ ] iOS parity tests cover parse shape, title extraction, actionability, and back verification.
- [ ] Future hook extraction work has a clear stop/go gate for iOS regressions.

## Implement

### Planned Changes

- `packages/explorer/tests/` — add iOS baseline fixtures and parity tests.
- `packages/explorer/src/snapshot.ts` — only minimal changes required to expose stable test seams, if needed.
- `packages/explorer/src/backtrack.ts` — only minimal changes required to expose stable test seams, if needed.
- `packages/explorer/src/element-prioritizer.ts` — only minimal changes required to support baseline assertions, if needed.

### Key Decisions To Preserve

- iOS baseline behavior is the source of truth for this refactor sequence.
- Android experimentation must not change or weaken these baseline gates.
- Tests should assert externally meaningful behavior, not current incidental field ordering.

## Verify

### Test Cases

- [ ] iOS direct-tree inspect payload produces expected explorer snapshot/title/actionable targets.
- [ ] iOS wrapped inspect payload produces identical explorer semantics to direct-tree payload.
- [ ] iOS backtrack verification still recognizes successful return paths.
- [ ] Existing explorer suite stays green with the new baseline tests.

### Verification Commands

```bash
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
```

### Acceptance Criteria

- The repo contains an explicit, reproducible iOS Explorer baseline for refactor safety.
- Shared explorer refactors can no longer silently alter iOS behavior without failing tests.

### Success Criteria

- iOS is protected before any hook extraction starts.
- Phase 25 follow-on slices can treat iOS parity as a hard merge gate.
