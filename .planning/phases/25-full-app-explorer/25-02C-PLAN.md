---
phase: 25-full-app-explorer
plan: 02C
title: Integrate Android Explorer hooks provisionally behind the iOS-locked shell
status: planned
summary_file: 25-02C-SUMMARY.md
verify_file: 25-02C-VERIFY.md
requirements:
  - EXP-PLAT-02
  - EXP-PLAT-03
formal_truth_owners:
  - packages/explorer/src/explorer-platform-android.ts
  - packages/explorer/src/explorer-platform.ts
  - packages/explorer/src/ui-tree-parser.ts
  - packages/explorer/src/snapshot.ts
  - packages/explorer/src/backtrack.ts
  - scripts/explorer/test-explorer-android.ts
type: execute
wave: 3
depends_on:
  - 25-02B
---

# Phase 25 Plan 02C — Provisional Android Hook Integration

## Objective

- **What:** Add Android Explorer hook integration under the already-locked iOS shell, keeping Android explicitly provisional.
- **Why:** Android still needs continued real-device iteration, but it should no longer require shared parser/semantic changes that threaten iOS.
- **Output:** A working Android hook path that supports continued smoke debugging without redefining shared defaults or support boundaries.

## Goal

### Problem

Android Explorer work is still in active debugging mode. Without a provisional boundary, Android fixes keep leaking into shared code and increasing cross-platform risk.

### Expected Outcome

- [ ] Android XML parsing and actionable-container semantics live in `explorer-platform-android.ts`.
- [ ] Android can continue iterating through its hook path without changing iOS parity behavior.
- [ ] Android smoke remains runnable and explores beyond the homepage on the connected real device path.

### Non-goals

- Declaring Android parity with iOS.
- Promoting Android behavior from provisional to stable in this slice.
- Unifying Android and iOS fallback semantics into one shared default.

## Plan

### Strategy

Connect Android to the already-extracted hook shell as an additive implementation. Keep rollout feature-flag/shadow-mode minded: Android can iterate and gather evidence, but shared defaults remain defined by the iOS-locked path until Android stabilizes.

### Read First

- `.planning/phases/25-full-app-explorer/25-02C-CONTEXT.md`
- `.planning/phases/25-full-app-explorer/25-02C-RISKS.md`
- `.planning/phases/25-full-app-explorer/25-02C-VERIFY-COMMANDS.md`
- `.planning/phases/25-full-app-explorer/25-02B-PLAN.md`
- `.planning/phases/25-full-app-explorer/25-02-PLAN.md`
- `packages/explorer/src/explorer-platform.ts`
- `packages/explorer/src/ui-tree-parser.ts`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `scripts/explorer/test-explorer-android.ts`

### Task Breakdown

1. Implement `explorer-platform-android.ts` using current Android XML and actionable-row learnings.
2. Route Android snapshot parsing/title extraction/actionability through the Android hook.
3. Localize Android back verification and related heuristics to the Android hook path.
4. Keep Android-specific waits/workarounds provisional and documented; do not move them into shared defaults.
5. Verify Android smoke on the real device path and record remaining Android-only gaps.

### Risks / Unknowns

- Android may still need multiple rounds of real-device iteration after hook extraction.
- Some current Android heuristics may be too provisional to freeze as stable API/metadata.
- Temporary Android workarounds can easily spread into shared code unless guarded tightly.

### Done Criteria

- [ ] Android hook implementation exists and shared code no longer needs Android-specific parser logic.
- [ ] Android smoke reaches beyond the homepage through the hook path.
- [ ] iOS parity gates still remain green while Android keeps iterating.
- [ ] Remaining Android-only risks are documented as follow-on work, not hidden in shared code.

## Implement

### Planned Changes

- `packages/explorer/src/explorer-platform-android.ts` — Android hook implementation.
- `packages/explorer/src/ui-tree-parser.ts` — retain only low-level helper pieces still needed by Android hook.
- `packages/explorer/src/snapshot.ts` — Android hook integration through shared shell.
- `packages/explorer/src/backtrack.ts` — Android hook integration for back evidence.
- `scripts/explorer/test-explorer-android.ts` — keep Android smoke/probe harness aligned with provisional hook path.
- `packages/explorer/tests/**/*.test.ts` — Android hook regression coverage.

### Key Decisions To Preserve

- Android remains provisional/experimental in this slice.
- Android-specific heuristics must stay local to the Android hook path.
- iOS parity gates remain authoritative for shared behavior until a later Android-hardening slice explicitly changes that rule.

## Verify

### Test Cases

- [ ] Android XML payloads parse through the hook path into non-empty explorer snapshots.
- [ ] Android clickable container rows are discoverable through hook-derived actionability.
- [ ] Android smoke explores beyond the homepage via `test-explorer-android.ts`.
- [ ] iOS parity tests still pass unchanged.

### Verification Commands

```bash
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
pnpm build
EXPLORER_TIMEOUT_MS=180000 EXPLORER_MAX_DEPTH=2 pnpm exec tsx scripts/explorer/test-explorer-android.ts smoke
```

### Acceptance Criteria

- Android can keep evolving through its hook path without endangering the iOS baseline.
- The repo can reason about Android gaps as Android-local follow-on work rather than shared explorer fragility.

### Success Criteria

- Android is integrated through the new platform seam.
- Future Android debugging/modification work can stay local to hook modules plus Android-specific tests.
