# Phase 57 Summary: AUT Readiness Contract Scaffold

## What Changed

- Added a small `mobile-change-readiness-contract/v1` format for app-under-test readiness assumptions.
- Added scaffold, validation, and drift-check commands for a default Android contract at `configs/readiness/mobile-change.android.json`.
- Added tests for valid deterministic contracts, missing app id, missing deterministic ready-state signals, and visual-only weak-proof contracts.
- Wired `verify:mobile-change -- --live --contract=<path>` so the one-command UX can consume a contract file instead of relying only on environment variables.

## Evidence Produced

- `configs/readiness/mobile-change.android.json`
- Focused readiness-contract unit tests.
- Contract-backed one-command live-blocked run showing readiness is supplied by the contract and the remaining blocker is device availability.

## Deviations From Plan

- The contract stayed in the showcase/CLI layer rather than `packages/contracts` for this first slice. That keeps the surface small until Phase 58 proves the repo-owned app success path.
- Framework-specific RN/Flutter examples were deferred until the repo-owned app target is selected.

## Follow-On Work

- Phase 58 should use the scaffolded contract as the app-specific success proof input.
- Later work can promote the contract shape into `packages/contracts` if it becomes a stable public interface.

## Repo Truth Owners Updated

- `configs/readiness/mobile-change.android.json`
- `scripts/showcase/mobile-change-readiness-contract.ts`
- `scripts/showcase/mobile-change-readiness-contract.test.ts`
- `scripts/showcase/mobile-change-one-command.ts`
- `scripts/showcase/mobile-change-one-command.test.ts`
- `package.json`
- `README.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
