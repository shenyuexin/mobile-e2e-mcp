# Phase 43 Summary: Governed PR Evidence Summary

## Completed

- Added `docs/showcase/evidence/governed-control-brief/pr-comment.md`.
- Added `docs/showcase/evidence/governed-control-brief/pr-comment.json`.
- Added `scripts/showcase/generate-governed-pr-evidence-summary.ts`.
- Added `scripts/showcase/validate-governed-pr-evidence-summary.ts`.
- Added `generate:governed-pr-evidence-summary` and `validate:governed-pr-evidence-summary`.
- Wired the PR summary validator into `test:smoke`.
- Updated README/showcase/CI evidence links and the governed evidence brief.

## Practical Outcome

The current governed-control proof can now be copied into a PR comment as a compact, boundary-aware evidence summary. The summary is generated from the validated brief and fails CI smoke if it drifts.

## Remaining Gap

Automated PR comment publishing is still pending.
