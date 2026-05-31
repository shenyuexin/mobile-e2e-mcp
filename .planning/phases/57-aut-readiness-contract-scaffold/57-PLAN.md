---
phase: 57-aut-readiness-contract-scaffold
plan: 01
title: AUT readiness contract scaffold
status: planned
summary_file: 57-01-SUMMARY.md
verify_file: 57-01-VERIFY.md
requirements:
  - DEV-EFF-03
  - AUT-CONTRACT-01
formal_truth_owners:
  - scripts/showcase/mobile-change-device-readiness.ts
  - packages/contracts/src/types.ts
  - configs/profiles
  - package.json
---

# Phase 57 Plan 01

## Goal

### Problem
Live verification is fragile when the app-under-test does not define deterministic entry, reset, and ready-state signals.

### Expected Outcome
- [ ] Developers can scaffold a minimal readiness contract for an app.
- [ ] The contract validator catches missing app id, readiness signal, reset semantics, and deterministic entry assumptions.
- [ ] The live verification flow can consume the contract without bespoke environment variables.

### Non-goals
- Full automatic app instrumentation.
- Framework-wide code generation.
- Treating OCR/CV-only readiness as strong proof.

## Plan

### Strategy
Create a small explicit readiness-contract format and generator that favors stable IDs, accessibility identifiers, deep links, and reset commands before fallback.

### Read First
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/guides/ui-stabilization-timing.md`
- `scripts/showcase/mobile-change-device-readiness.ts`
- `configs/profiles`

### Task Breakdown
1. Define the readiness contract shape and proof-level semantics.
2. Add scaffold and validation commands.
3. Wire the contract into the one-command verification UX.
4. Add fixtures for native Android, React Native, and Flutter-style contract examples if existing repo examples support them.

### Risks / Unknowns
- Existing demo apps may not expose stable readiness identifiers.
- Contract shape should stay small enough that teams will actually adopt it.

### Done Criteria
- [ ] A minimal contract can be generated and validated offline.
- [ ] Missing contract fields produce actionable errors.
- [ ] Live proof readiness can point to a contract file instead of loose env vars.

## Implement

### Planned Changes
- `scripts/showcase/**` or `packages/cli/src/index.js` — scaffold and validate commands.
- `packages/contracts/src/types.ts` — shared types only if the contract becomes a repo-level data model.
- `configs/profiles/**` — examples only if they are source-of-truth profile inputs.

### Key Decisions To Preserve
- AUT readiness is a prerequisite for strong success proof.
- Deterministic readiness outranks visual fallback.

## Verify

### Test Cases
- [ ] Valid minimal Android readiness contract.
- [ ] Missing app id.
- [ ] Missing deterministic ready-state signal.
- [ ] Contract marked visual-only cannot be promoted as strong proof.

### Verification Commands
```bash
pnpm typecheck
pnpm run test:smoke
```

### Acceptance Criteria
- Developers get a concrete contract file and validation errors before they attempt live proof.

### Success Criteria
- The project no longer depends on hidden environment-variable knowledge to run app-specific live verification.
