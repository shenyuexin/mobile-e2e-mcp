---
phase: 55-one-command-mobile-change-verification-ux
plan: 01
title: One-command mobile change verification UX
status: planned
summary_file: 55-01-SUMMARY.md
verify_file: 55-01-VERIFY.md
requirements:
  - DEV-EFF-01
  - LIVE-PROOF-01
formal_truth_owners:
  - package.json
  - packages/cli/src/index.js
  - scripts/showcase/mobile-change-verification.ts
  - scripts/showcase/mobile-change-device-readiness.ts
  - scripts/showcase/generate-mobile-change-live-proof-intake.ts
  - scripts/showcase/generate-mobile-change-handoff.ts
---

# Phase 55 Plan 01

## Goal

### Problem
Mobile change verification currently exists as several scripts, so developers must know which readiness, live proof, intake, and handoff commands to chain manually.

### Expected Outcome
- [ ] A single developer-facing command can run readiness, verification, intake, and handoff steps in the correct order.
- [ ] The command returns a compact verdict with evidence paths, proof level, blockers, and next command.
- [ ] Existing lower-level scripts remain usable and drift-validated.

### Non-goals
- Cloud device farm orchestration.
- Automatic source-code fixes.
- New MCP tool surface before the CLI workflow proves value.

## Plan

### Strategy
Build a thin orchestration layer over the existing proof/readiness/intake/handoff scripts, keeping each underlying evidence artifact intact while giving developers one obvious entrypoint.

### Read First
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `package.json`
- `packages/cli/src/index.js`
- `scripts/showcase/mobile-change-verification.ts`
- `scripts/showcase/mobile-change-device-readiness.ts`
- `scripts/showcase/generate-mobile-change-live-proof-intake.ts`
- `scripts/showcase/generate-mobile-change-handoff.ts`

### Task Breakdown
1. Define the command contract, flags, exit-code semantics, and output schema.
2. Add focused tests for success, no-device blocker, readiness blocker, and intake-rejected outcomes.
3. Implement the CLI orchestration without changing the lower-level proof artifact formats.
4. Wire a package script such as `verify:mobile-change`.
5. Update only the minimal README/showcase entrypoints needed to point users at the command.

### Risks / Unknowns
- The CLI package is currently very small, so the first implementation must avoid overbuilding a framework.
- Live execution remains device-dependent and must keep structured blocked outcomes.

### Done Criteria
- [ ] One command covers the common local verification path.
- [ ] Blocked outcomes are actionable without reading multiple artifact files.
- [ ] Existing smoke validation includes contract drift checks for the new command.

## Implement

### Planned Changes
- `packages/cli/src/index.js` — add the developer-facing orchestration entrypoint.
- `package.json` — add the top-level verification script.
- `scripts/showcase/**` — reuse or lightly adapt existing builders for machine-readable orchestration.
- `docs/showcase/**` — document the command as the primary entrypoint.

### Key Decisions To Preserve
- Transport success is not outcome success.
- Live proof claims must pass intake before promotion.
- Device-unavailable output is a valid blocked result, not a successful proof.

## Verify

### Test Cases
- [ ] Fixture-backed verification produces a completed offline proof bundle.
- [ ] No-device live verification produces a blocked verdict and next action.
- [ ] Intake rejection prevents proof promotion.
- [ ] Handoff summary points at the generated evidence.

### Verification Commands
```bash
pnpm run test:mobile-change-verification
pnpm run test:mobile-change-device-readiness
pnpm run test:mobile-change-live-proof-intake
pnpm run test:mobile-change-handoff
pnpm typecheck
pnpm run test:smoke
```

### Acceptance Criteria
- The command reduces the common workflow to one entrypoint without deleting lower-level proof controls.
- The output is structured enough for a PR/agent handoff.

### Success Criteria
- A developer can run one command, inspect one compact verdict, and follow one next action.
