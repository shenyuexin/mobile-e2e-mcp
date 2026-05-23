---
phase: 35-reliability-differentiation-evidence
plan: 01
title: Reliability and differentiation evidence
status: planned
summary_file: 35-01-SUMMARY.md
verify_file: 35-01-VERIFY.md
requirements:
  - PRACTICALITY-RELIABILITY-01
formal_truth_owners:
  - docs/strategy/mobile-developer-workflow-analysis.md
  - docs/showcase/ci-evidence.md
  - README.md
  - package.json
---

# Phase 35 Plan 01

## Goal

### Problem
The project's adoption case depends on reliability under repeated runs and differentiation beyond raw mobile automation, but current visible evidence is stronger for single artifacts than for repeated-run trust and cross-tool comparison.

### Expected Outcome
- [ ] A repeated-run evidence loop records pass rate, failure categories, timing, and artifact locations.
- [ ] At least one reliability feature gap is selected for implementation or explicit deferral based on product value.
- [ ] Differentiation evidence is tied to concrete workflows: failure triage, Explorer coverage, recovery, or agent-safe execution.
- [ ] Support-boundary docs are updated only where evidence supports them.

### Non-goals
- Solving all P0/P1 gaps from the developer workflow analysis in one phase.
- Expanding platform claims before proof exists.
- Building enterprise/cloud/device-farm functionality.

## Plan

### Strategy
Prioritize proof loops over new surface area. Use repeated runs and failure classification to decide which reliability gap actually blocks adoption next.

### Read First
- `.planning/practicality-redteam-report-2026-05-23.md`
- `docs/strategy/mobile-developer-workflow-analysis.md`
- `docs/showcase/ci-evidence.md`
- `docs/showcase/README.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`

### Task Breakdown
1. Pick a narrow repeated-run target: Explorer evidence validation, probe dry-run, Android probe, RN Android acceptance, or killer demo path from Phase 33.
2. Add or document a loop runner that preserves every run's artifacts.
3. Emit reliability summary: pass/fail/expected diagnostic, duration, reason category, artifact path.
4. Compare outcomes against the red-team proof gaps.
5. Select the next reliability feature from the P0/P1 list only if evidence shows it is the blocker.
6. Update docs with measured trust boundaries.

### Candidate Reliability Improvements
- Network-aware orchestration adoption during actions.
- Probe/Explorer baseline lifecycle governance: expiry, review metadata, broader probe integration.
- Checkpoint-chain replay evidence hardening.
- Flow validation before export.
- Historical failure memory across sessions.
- WebView context detection if killer demo exposes hybrid-screen pain.
- Flutter debug lane only after Flutter becomes a chosen proof target.

### Risks / Unknowns
- Repeated-run automation may expose environmental noise rather than product defects.
- Adding new tools before proof could increase maintenance burden.
- Framework/profile evidence may still be too broad; keep one lane as the proof target.

### Done Criteria
- [ ] Repeated-run evidence exists and is preserved as artifacts or docs.
- [ ] Failure categories are machine-consumable enough for future trend comparison.
- [ ] At least one next reliability investment is justified by evidence, not architecture appeal alone.
- [ ] Public docs do not overstate support based on internal planning conclusions.

## Implement

### Planned Changes
- `scripts/**` — optional repeated-run harness if no existing command can loop and summarize evidence.
- `docs/showcase/ci-evidence.md` — measured evidence boundary updates.
- `docs/strategy/mobile-developer-workflow-analysis.md` — reprioritize gaps using measured adoption/reliability data.
- `README.md` — only if the measured proof changes public positioning.
- `package.json` — optional validation alias for the repeated-run path.

### Key Decisions To Preserve
- Evidence first, capability expansion second.
- Repeated-run failures should become structured categories, not anecdotal notes.
- Cross-platform/framework claims must follow measured lanes.

## Verify

### Test Cases
- [ ] Loop runner preserves per-run artifacts.
- [ ] Summary classifies expected diagnostics separately from unexpected failures.
- [ ] Documentation names the environment and proof level.
- [ ] Existing smoke and probe contract checks still pass.

### Verification Commands
```bash
pnpm run validate:probe-dry-run
pnpm run test:probe-report-contract
pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4
```

Add live-device or killer-demo loop commands when the target is selected.

### Acceptance Criteria
- Reliability evidence can answer "does this work repeatedly?" for one narrow workflow.
- The next feature investment is justified by observed failures or adoption friction.

### Success Criteria
- The project gains a measured reliability story, not just a capability list.
- Future support-boundary updates can cite repeated-run evidence.
