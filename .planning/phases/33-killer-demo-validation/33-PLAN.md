---
phase: 33-killer-demo-validation
plan: 01
title: Killer demo validation
status: planned
summary_file: 33-01-SUMMARY.md
verify_file: 33-01-VERIFY.md
requirements:
  - PRACTICALITY-DEMO-01
formal_truth_owners:
  - README.md
  - docs/showcase/README.md
  - docs/showcase/killer-demo.md
  - package.json
---

# Phase 33 Plan 01

## Goal

### Problem
The project has a strong architecture story but needs one small, repeatable demo that proves why a mobile team or AI-agent builder would choose this harness instead of just using Maestro/Appium/native scripts.

### Expected Outcome
- [ ] A repo-owned killer demo scenario is specified with target app, exact flow, failure injection point, expected failure, and expected evidence.
- [ ] A one-command demo path produces a timestamped evidence bundle.
- [ ] A baseline comparison against Maestro, Appium, native script, or ad-hoc script is captured.
- [ ] The resulting report shows what task becomes easier and what artifact quality improves.

### Non-goals
- Proving every platform/framework lane.
- Adding new MCP tools unless the demo exposes a hard blocker.
- Replacing existing Explorer/probe evidence.

## Plan

### Strategy
Use the strongest current differentiation: failure-intelligence plus evidence bundling. Keep the demo narrow enough to run repeatedly and broad enough to show why the harness is not just another tap/type runner.

### Read First
- `.planning/practicality-redteam-report-2026-05-23.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/showcase/README.md`
- `docs/showcase/failure-intelligence-demo.md`
- `docs/showcase/ci-evidence.md`
- `docs/guides/ai-agent-invocation.zh-CN.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`

### Task Breakdown
1. Choose target app and scenario: repo demo app first, RN Android follow-up only if setup is already clean.
2. Define failure injection: network unavailable, interruption dialog, permission gate, or missing target.
3. Implement or document a one-command runner that writes to `output/showcase/killer-demo/<timestamp>/`.
4. Run a baseline comparison through Maestro/Appium/native/ad-hoc script.
5. Run the harness path and collect structured evidence.
6. Write `docs/showcase/killer-demo.md` with before/after findings.
7. Link the demo from README/showcase only after evidence exists.

### Risks / Unknowns
- RN demo setup may depend on local Expo state; keep the first proof on the most reproducible app path.
- A failure that is too artificial will not persuade mobile engineers.
- A demo that requires a self-hosted phone may be less adoptable; provide emulator/simulator or offline evidence validation when possible.

### Done Criteria
- [ ] A future maintainer can run or validate the demo without hidden chat context.
- [ ] The demo produces machine-consumable evidence and a human report.
- [ ] The report compares this harness to at least one existing approach.
- [ ] README/showcase wording states the proof boundary precisely.

## Implement

### Planned Changes
- `docs/showcase/killer-demo.md` — public-facing proof narrative and artifact index.
- `docs/showcase/README.md` — link to the killer demo after evidence exists.
- `package.json` — optional demo/validation script if a stable command is added.
- `scripts/**` — optional narrow runner only if existing scripts cannot produce the bundle.

### Key Decisions To Preserve
- The demo must prove workflow value, not platform breadth.
- Positive claims must be backed by a command, artifact, screenshot/video, test result, or comparison.
- If the demo uses historical or offline evidence, the boundary must be explicit.

## Verify

### Test Cases
- [ ] Demo command succeeds or produces an expected diagnostic failure with evidence.
- [ ] Baseline comparison artifact exists.
- [ ] Harness evidence bundle includes timeline/report/summary/screenshots or equivalent artifacts.
- [ ] Re-running the demo does not overwrite previous evidence.

### Verification Commands
```bash
pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4
pnpm run validate:probe-dry-run
```

Add the final killer-demo command here when implemented.

### Acceptance Criteria
- The demo answers: "Why not just Maestro/Appium/native scripts?"
- The demo answers: "What task became easier or more trustworthy?"
- The demo produces visible evidence suitable for README/showcase linking.

### Success Criteria
- A skeptical mobile engineer can understand the value in under 5 minutes from the demo artifacts.
- A future AI agent can use the demo as the canonical product proof path.
