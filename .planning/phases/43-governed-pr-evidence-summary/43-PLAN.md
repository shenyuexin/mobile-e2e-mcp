# Phase 43 Plan: Governed PR Evidence Summary

## Goal

Make the governed-control evidence usable in day-to-day code review by producing a compact PR/comment-ready Markdown and JSON summary from the validated evidence brief.

## Practicality Bet

Evidence is less useful if it stays scattered across showcase pages. A mobile developer or AI agent should be able to paste one compact summary into a PR and preserve the proof boundaries.

## Work Items

1. Add a generated PR/comment Markdown summary.
2. Add a machine-readable PR/comment JSON summary.
3. Add a generator with `--check` drift detection.
4. Add a semantic validator for the PR summary.
5. Wire the validator into `test:smoke`.
6. Update README/showcase/CI evidence and planning references.

## Boundary

This phase does not post comments to GitHub. It creates and validates the review-ready artifact. Automated publishing remains the next proof gap.

## Verification

- `pnpm run validate:governed-pr-evidence-summary`
- `pnpm run validate:governed-evidence-brief`
- `pnpm run test:smoke`
- `pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck`
- `git diff --check`
