---
phase: 25-full-app-explorer
plan: 02B
title: Extract iOS Explorer platform hooks with no behavior change
status: planned
summary_file: 25-02B-SUMMARY.md
verify_file: 25-02B-VERIFY.md
requirements:
  - EXP-PLAT-01
  - EXP-PLAT-03
formal_truth_owners:
  - packages/explorer/src/explorer-platform.ts
  - packages/explorer/src/explorer-platform-ios.ts
  - packages/explorer/src/snapshot.ts
  - packages/explorer/src/backtrack.ts
  - packages/explorer/src/element-prioritizer.ts
  - packages/explorer/src/mcp-adapter.ts
type: execute
wave: 2
depends_on:
  - 25-02A
---

# Phase 25 Plan 02B — Extract iOS Explorer Platform Hooks

## Objective

- **What:** Introduce the Explorer platform hook interface and move iOS parsing/semantics behind the first hook implementation.
- **Why:** The shared explorer core needs a clean platform seam, but the first extraction must preserve the already-validated iOS lane exactly.
- **Output:** A thin platform registry plus an iOS hook implementation that keeps iOS behavior unchanged while shrinking platform assumptions in shared files.

## Goal

### Problem

Current explorer files still mix shared orchestration with iOS-specific parsing and semantic inference. That makes later Android work too likely to disturb the verified iOS path.

### Expected Outcome

- [ ] Explorer has a stable hook contract that shared orchestration can consume.
- [ ] iOS parsing, title extraction, actionable-element semantics, selector token derivation, and back verification are moved behind `explorer-platform-ios.ts`.
- [ ] iOS parity tests from 25-02A remain green with no intended behavior change.

### Non-goals

- Android hook extraction.
- Reworking explorer traversal/state-graph semantics.
- Expanding MCP contracts or tool surfaces.

## Plan

### Strategy

Create the smallest possible platform seam that shared explorer code can use. Port iOS behavior first, prove equivalence with 25-02A parity tests, and only then let shared files depend on the new hook outputs.

### Read First

- `.planning/phases/25-full-app-explorer/25-02B-CONTEXT.md`
- `.planning/phases/25-full-app-explorer/25-02B-RISKS.md`
- `.planning/phases/25-full-app-explorer/25-02B-VERIFY-COMMANDS.md`
- `.planning/phases/25-full-app-explorer/25-02A-PLAN.md`
- `.planning/phases/25-full-app-explorer/25-02-PLAN.md`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `packages/explorer/src/element-prioritizer.ts`
- `packages/explorer/src/mcp-adapter.ts`
- `packages/adapter-maestro/src/ui-runtime-platform.ts`

### Task Breakdown

1. Define `explorer-platform.ts` hook interfaces and registry shape.
2. Implement `explorer-platform-ios.ts` from current iOS explorer behavior.
3. Rewire `snapshot.ts` to consume iOS hook outputs for parsing/title extraction.
4. Rewire `backtrack.ts` to consume iOS hook outputs for back verification semantics.
5. Rewire `element-prioritizer.ts` only where hook-provided normalized facts replace platform-specific checks.
6. Keep `mcp-adapter.ts` thin and behavior-preserving.

### Risks / Unknowns

- A too-wide hook contract may just re-encode the shared-problem in a new abstraction.
- Shared files may still rely on raw iOS field names in subtle places.
- Selector or title behavior may drift if normalized outputs lose too much detail.

### Done Criteria

- [ ] Hook registry and iOS hook implementation exist.
- [ ] Shared explorer files consume iOS hook outputs instead of raw iOS parsing assumptions.
- [ ] 25-02A iOS parity tests stay green with no intentional behavior drift.

## Implement

### Planned Changes

- `packages/explorer/src/explorer-platform.ts` — hook interfaces/registry.
- `packages/explorer/src/explorer-platform-ios.ts` — iOS implementation.
- `packages/explorer/src/snapshot.ts` — iOS hook consumption.
- `packages/explorer/src/backtrack.ts` — iOS hook consumption.
- `packages/explorer/src/element-prioritizer.ts` — consume normalized facts where needed.
- `packages/explorer/src/mcp-adapter.ts` — keep bridge thin and stable.

### Key Decisions To Preserve

- iOS hook extraction is a refactor, not a behavior rewrite.
- Shared core should consume explorer-oriented facts, not raw iOS platform payloads.
- If a hook design choice would alter iOS semantics, stop and revise the contract before proceeding.

## Verify

### Test Cases

- [ ] All 25-02A iOS parity tests remain green.
- [ ] Shared explorer suite remains green.
- [ ] iOS hook path produces the same title/actionability/back semantics as before extraction.

### Verification Commands

```bash
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
pnpm build
```

### Acceptance Criteria

- Explorer now has a real platform seam anchored by a proven iOS implementation.
- iOS remains the authoritative lane for shared explorer behavior at this stage.

### Success Criteria

- The repo is ready for Android hook work without Android having to shape the shared contract first.
- Shared explorer files are materially thinner and less platform-coupled.
