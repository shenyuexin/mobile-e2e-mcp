---
phase: 34-adoption-friction-reduction
plan: 01
title: First-30-minute adoption path
status: planned
summary_file: 34-01-SUMMARY.md
verify_file: 34-01-VERIFY.md
requirements:
  - PRACTICALITY-ADOPT-01
formal_truth_owners:
  - README.md
  - README.zh-CN.md
  - docs/showcase/ci-evidence.md
  - docs/guides/golden-path.md
  - package.json
---

# Phase 34 Plan 01

## Goal

### Problem
The project has many tools and evidence paths, but a first-time user can still struggle to know which path proves value quickly, what is current vs legacy, and what is smoke proof vs real-device proof.

### Expected Outcome
- [ ] A first-30-minute quickstart path is defined and validated.
- [ ] The README points users to one recommended proof path before the full 66-tool catalog.
- [ ] Setup prerequisites are classified as required, optional, self-hosted, or evidence-only.
- [ ] Current vs legacy scripts and proof levels are easier to distinguish.

### Non-goals
- Rewriting all documentation.
- Making self-hosted real-device acceptance universally available.
- Hiding legitimate support limitations.

## Plan

### Strategy
Turn existing honesty about evidence boundaries into a sharper onboarding funnel: install, run/validate, inspect artifact, understand boundary, choose next path.

### Read First
- `.planning/practicality-redteam-report-2026-05-23.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `README.md`
- `README.zh-CN.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
- `docs/guides/golden-path.md`
- `package.json`

### Task Breakdown
1. Inventory current entrypoints and classify them: quickstart, smoke, offline evidence, live probe, self-hosted acceptance, legacy.
2. Select one primary first-run path and one no-device evidence-validation fallback.
3. Add a compact "AI Agent / First 30 Minutes" path to README.
4. Move broad tool catalog below the recommended workflow or add a guided map before it.
5. Update showcase/CI docs so proof levels are visible without reading multiple pages.
6. Validate commands from a clean shell where possible.

### Risks / Unknowns
- Over-simplifying setup could understate platform dependencies.
- README can become too long if the quickstart repeats showcase and CI docs.
- Existing users may still need direct tool catalog access; keep it available but not primary.

### Done Criteria
- [ ] A first-time reader sees one recommended command/path before the full catalog.
- [ ] No-device and real-device proof paths are clearly separate.
- [ ] Legacy scripts are marked as compatibility/demo history, not the current proof spine.
- [ ] README and showcase docs agree on proof boundaries.

## Implement

### Planned Changes
- `README.md` — first-30-minute path and sharper positioning.
- `README.zh-CN.md` — matching Chinese entry path if README changes materially.
- `docs/showcase/README.md` — proof-path index.
- `docs/showcase/ci-evidence.md` — concise proof-level alignment.
- `docs/guides/golden-path.md` — optional deeper walkthrough if needed.
- `package.json` — optional alias script for the recommended validation path.

### Key Decisions To Preserve
- Do not imply README proof equals real-device rerun unless a device actually ran.
- Keep "not a replacement for every framework internals" visible.
- Prefer one recommended path over a broad menu.

## Verify

### Test Cases
- [ ] Quickstart command/path can be followed from docs without hidden prerequisites.
- [ ] No-device validation path succeeds on committed artifacts or dry-run contracts.
- [ ] Real-device path has explicit prerequisites and expected outputs.
- [ ] Links to current evidence resolve.

### Verification Commands
```bash
pnpm run validate:probe-dry-run
pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4
```

### Acceptance Criteria
- A user can tell in 30 minutes whether the project is worth deeper setup.
- Adoption docs reduce ambiguity between current, legacy, smoke, and acceptance paths.

### Success Criteria
- README becomes sharper without broadening unsupported claims.
- Showcase and CI evidence docs become a trust-building path rather than scattered references.
