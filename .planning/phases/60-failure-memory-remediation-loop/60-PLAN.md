---
phase: 60-failure-memory-remediation-loop
plan: 01
title: Failure memory remediation loop
status: planned
summary_file: 60-01-SUMMARY.md
verify_file: 60-01-VERIFY.md
requirements:
  - DEV-EFF-06
  - FAILURE-INTELLIGENCE-01
formal_truth_owners:
  - packages/core/src/failure-memory-store.ts
  - packages/mcp-server/src/tools/suggest-known-remediation.ts
  - scripts/showcase
  - package.json
---

# Phase 60 Plan 01

## Goal

### Problem
Failure packets explain one run, but developers still lose time when the same classes of mobile failures recur across sessions or PRs.

### Expected Outcome
- [ ] Repeated failure packets can be summarized into known failure patterns.
- [ ] The system recommends bounded next actions based on evidence, policy, and prior outcomes.
- [ ] Recommendations can be surfaced through handoff or the one-command verification result.

### Non-goals
- Autonomous source edits.
- LLM-only root-cause attribution.
- Flaky-test prediction as a product claim.

## Plan

### Strategy
Connect existing failure packet output to local failure memory and remediation routing, keeping suggestions deterministic and evidence-backed.

### Read First
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `packages/core/src/failure-memory-store.ts`
- `packages/mcp-server/src/tools/suggest-known-remediation.ts`
- `scripts/showcase/generate-mobile-change-handoff.ts`

### Task Breakdown
1. Define how mobile change failure packets map into known failure records.
2. Add tests for repeated app_readiness, environment, selector, network, and policy failure patterns.
3. Extend handoff or verification verdict output with bounded recommended next actions.
4. Keep confidence and proof-level labels visible.

### Risks / Unknowns
- Existing failure memory may not yet capture all packet fields needed for useful grouping.
- Overeager suggestions could mislead developers if evidence is weak.

### Done Criteria
- [ ] Repeated failure categories produce stable grouped summaries.
- [ ] Recommendations cite evidence and stop at bounded next actions.
- [ ] Weak evidence produces inspect-first guidance rather than false certainty.

## Implement

### Planned Changes
- `packages/core/src/failure-memory-store.ts` — grouping or lookup support if needed.
- `packages/mcp-server/src/tools/suggest-known-remediation.ts` — mobile change packet routing if needed.
- `scripts/showcase/**` — fixture-backed failure pattern examples and validators.

### Key Decisions To Preserve
- Recommendations must remain policy-bounded.
- A suggestion is not proof of root cause unless evidence supports it.

## Verify

### Test Cases
- [ ] Repeated readiness failures suggest readiness-contract fixes.
- [ ] Environment failures suggest device doctor/preflight steps.
- [ ] Network failures route to network diagnosis.
- [ ] Low-confidence patterns route to inspect/collect evidence first.

### Verification Commands
```bash
pnpm --filter @mobile-e2e-mcp/core test
pnpm --filter @shenyuexin/mobile-e2e-mcp test
pnpm typecheck
pnpm run test:smoke
```

### Acceptance Criteria
- The debug loop gets shorter because repeat failures lead to concrete next actions.

### Success Criteria
- Developers spend less time re-reading logs for known mobile failure classes.
