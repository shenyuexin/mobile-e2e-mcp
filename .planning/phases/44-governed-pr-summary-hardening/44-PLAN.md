# Phase 44 Plan: Governed PR Summary Hardening

## Goal

Make the PR evidence summary generator safer to reuse and harder to regress.

## Practicality Bet

The PR summary is now an active review artifact. If the generator has import side effects or no unit-level coverage, it is fragile for future CI/GitHub automation.

## Work Items

1. Add a regression test proving the generator module can be imported without writing or logging.
2. Add a rendering test for the compact PR comment sections.
3. Change the generator so `main()` only runs when invoked as a CLI.
4. Wire the test into `test:smoke`.

## Boundary

No new evidence claims and no GitHub posting behavior. This phase hardens the already used summary generation path.

## Verification

- `pnpm run test:governed-pr-evidence-summary`
- `pnpm run validate:governed-pr-evidence-summary`
- `pnpm run test:smoke`
- `pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck`
- `git diff --check`
