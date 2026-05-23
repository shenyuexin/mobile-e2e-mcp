# Phase 25 Plan 02 — Explorer Hook Refactor Index

## Purpose

This document is the navigation layer for the Explorer hook refactor.

Phase 25 Plan 02 is intentionally split into smaller execution slices because:

1. `7804ac5d` is the known-good iOS baseline.
2. Current Android work is still exploratory and must not define shared defaults.
3. Hook extraction, parity locking, and Android integration should not be mixed into one execution unit.

## Execution Order

### Slice 1 — `25-02A`

- File: `25-02A-PLAN.md`
- Checklist: `25-02A-CHECKLIST.md`
- Context: `25-02A-CONTEXT.md`
- Risks: `25-02A-RISKS.md`
- Verify: `25-02A-VERIFY-COMMANDS.md`
- Goal: lock iOS baseline parity before any platform seam extraction.
- Hard gate: must be green before `25-02B` starts.

### Slice 2 — `25-02B`

- File: `25-02B-PLAN.md`
- Checklist: `25-02B-CHECKLIST.md`
- Context: `25-02B-CONTEXT.md`
- Risks: `25-02B-RISKS.md`
- Verify: `25-02B-VERIFY-COMMANDS.md`
- Goal: extract iOS hook implementation with no intended behavior change.
- Hard gate: must preserve all `25-02A` parity checks before `25-02C` starts.

### Slice 3 — `25-02C`

- File: `25-02C-PLAN.md`
- Checklist: `25-02C-CHECKLIST.md`
- Context: `25-02C-CONTEXT.md`
- Risks: `25-02C-RISKS.md`
- Verify: `25-02C-VERIFY-COMMANDS.md`
- Goal: integrate Android through a provisional hook path without changing iOS-defined shared behavior.
- Status rule: Android remains provisional/experimental in this slice.

## Shared Guardrails

- `7804ac5d` is the iOS behavior baseline.
- Android changes must not redefine shared explorer defaults in Phase 25 Plan 02.
- Shared explorer code should consume normalized platform facts, not raw platform payload fields.
- If a change mixes “iOS parity preservation” and “Android behavior evolution” in one PR, treat it as high risk and split it.

## Recommended Reading Order

1. `25-02-PLAN.md`
2. `25-02-README.md`
3. `25-02A-CONTEXT.md`
4. `25-02A-PLAN.md`
5. `25-02A-CHECKLIST.md`
6. `25-02A-VERIFY-COMMANDS.md`
7. `25-02B-CONTEXT.md`
8. `25-02B-PLAN.md`
9. `25-02B-CHECKLIST.md`
10. `25-02B-VERIFY-COMMANDS.md`
11. `25-02C-CONTEXT.md`
12. `25-02C-PLAN.md`
13. `25-02C-CHECKLIST.md`
14. `25-02C-VERIFY-COMMANDS.md`

## Stop / Go Checkpoints

### Stop after 25-02A if

- iOS direct-tree and wrapped-payload parity is still ambiguous.
- Backtrack parity relies on undocumented incidental behavior.
- Snapshot/title/actionability tests are still implementation-detail-heavy instead of behavior-focused.

### Stop after 25-02B if

- iOS behavior changed but the only explanation is “refactor side effect”.
- Shared core still directly checks iOS-specific raw fields.
- Hook output contract is too wide or under-specified.

### Stop after 25-02C if

- Android only works by introducing shared defaults that weaken iOS parity guarantees.
- Android smoke passes only with temporary workarounds now leaking into shared orchestration.
- Support-boundary language starts implying Android stability that the evidence does not justify.
