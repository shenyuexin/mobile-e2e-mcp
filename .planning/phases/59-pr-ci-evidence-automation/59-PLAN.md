---
phase: 59-pr-ci-evidence-automation
plan: 01
title: PR and CI evidence automation
status: planned
summary_file: 59-01-SUMMARY.md
verify_file: 59-01-VERIFY.md
requirements:
  - DEV-EFF-05
  - REVIEW-EVIDENCE-01
formal_truth_owners:
  - .github/workflows
  - scripts/showcase
  - docs/showcase/ci-evidence.md
  - package.json
---

# Phase 59 Plan 01

## Goal

### Problem
Verification artifacts are useful, but developers still need to manually decide what to attach to PRs or CI summaries.

### Expected Outcome
- [ ] The one-command verification flow emits a PR-ready summary artifact.
- [ ] CI can upload compact evidence artifacts without requiring a live device by default.
- [ ] Proof-level labels make dry-run, blocked, failed, and successful-live outcomes impossible to confuse.

### Non-goals
- Posting GitHub comments by default.
- Making physical devices mandatory for normal CI.
- Turning evidence absence into a release hard block without configuration.

## Plan

### Strategy
Package the Phase 55 verdict, Phase 50 handoff, and Phase 58 success evidence into CI-friendly artifacts and optional PR summary text.

### Read First
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.github/workflows/ci.yml`
- `.github/workflows/real-device-acceptance.yml`
- `docs/showcase/ci-evidence.md`
- `scripts/showcase/generate-mobile-change-handoff.ts`

### Task Breakdown
1. Define CI artifact shape for mobile change verification.
2. Add dry-run CI artifact generation.
3. Add optional live evidence artifact path for self-hosted/device jobs.
4. Add validator tests that proof-level labels are preserved.

### Risks / Unknowns
- CI workflow changes can become noisy if artifact names are not stable.
- PR summary must remain compact enough for actual review use.

### Done Criteria
- [ ] CI produces or validates mobile verification evidence artifacts.
- [ ] PR summary text is generated from structured evidence.
- [ ] Live-device dependency remains optional unless configured.

## Implement

### Planned Changes
- `.github/workflows/**` — artifact generation/upload and validation wiring.
- `scripts/showcase/**` — PR/CI summary artifact builder.
- `docs/showcase/ci-evidence.md` — proof levels and artifact locations.

### Key Decisions To Preserve
- README/doc updates must reflect actual CI behavior, not aspirational live-device coverage.
- Artifact validation should run without a device.

## Verify

### Test Cases
- [ ] Dry-run CI artifact is generated and validates.
- [ ] Successful-live artifact path validates when evidence exists.
- [ ] Blocked/no-device artifact is labeled as blocked, not failed app behavior.

### Verification Commands
```bash
pnpm run test:smoke
pnpm typecheck
```

### Acceptance Criteria
- Reviewers can understand mobile verification status from one CI/PR artifact.

### Success Criteria
- Mobile verification becomes part of the normal review loop instead of a manual local ritual.
