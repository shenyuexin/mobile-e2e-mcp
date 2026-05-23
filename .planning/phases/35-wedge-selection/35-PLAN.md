---
phase: 35-wedge-selection
plan: 01
title: Wedge selection
status: planned
summary_file: 35-01-SUMMARY.md
verify_file: 35-01-VERIFY.md
requirements:
  - PRACTICALITY-WEDGE-01
formal_truth_owners:
  - .planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md
  - .planning/phases/34-alternative-kill-test/34-01-SUMMARY.md
  - README.md
  - docs/strategy/mobile-developer-workflow-analysis.md
---

# Phase 35 Plan 01

## Goal

### Problem
If the project tries to be a broad mobile E2E platform, it competes directly with mature tools. It needs one narrow wedge where its policy, session, evidence, recovery, Explorer, and MCP-agent design produce a clear reason to exist.

### Expected Outcome
- [ ] One primary wedge is selected from Phase 33/34 findings.
- [ ] Supporting capabilities are explicitly separated from the core wedge.
- [ ] The selected wedge has a 7-day proof plan and a 30-day productization path.
- [ ] README/product positioning changes are proposed only if the wedge is strong enough.

### Non-goals
- Keeping all possible users as first-class targets.
- Expanding every platform/framework lane.
- Building the selected wedge in this phase.
- Turning adoption polish into a substitute for product truth.

## Plan

### Strategy
Choose the narrowest credible entry point. The phase should make an opinionated product decision: one main wedge, one or two supporting capabilities, and explicit non-wedges.

### Candidate Wedges
1. **AI-safe mobile device control via MCP**
   - Primary user: AI-agent builders and teams letting agents operate phones.
   - Core claim: raw adb/Appium is unsafe and too unstructured for autonomous agents; this harness adds policy, session, evidence, and recovery boundaries.
2. **Failure intelligence layer for mobile E2E**
   - Primary user: teams already using mobile runners but struggling with triage.
   - Core claim: the harness augments existing execution with structured diagnosis, evidence, and remediation.
3. **Explorer for mobile app coverage discovery**
   - Primary user: teams needing fast coverage maps for unknown or changing apps.
   - Core claim: before writing flows, the harness can discover screens, navigation paths, and failure evidence.

### Read First
- `.planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md`
- `.planning/phases/34-alternative-kill-test/34-01-SUMMARY.md`
- `.planning/practicality-redteam-report-2026-05-23.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `README.md`
- `docs/strategy/mobile-developer-workflow-analysis.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`

### Task Breakdown
1. Score each surviving wedge on pain frequency, pain intensity, alternative strength, differentiation, proof cost, and adoption path.
2. Select one primary wedge.
3. Mark other surviving scenarios as supporting capabilities or deferred bets.
4. Define the selected wedge's 7-day validation demo.
5. Define the selected wedge's 30-day productization path.
6. Record any README/strategy wording that should change after proof exists.

### Wedge Scorecard
- Concrete user
- Pain frequency
- Pain intensity
- Current workaround strength
- Differentiation after Phase 34 kill test
- Smallest proof artifact
- 7-day validation feasibility
- 30-day productization feasibility
- Commercial/portfolio value
- Risk of being dismissed by serious mobile engineers

### Risks / Unknowns
- The best wedge may be AI-agent infrastructure, not traditional QA tooling.
- Explorer may be a strong product wedge but a weaker general E2E claim.
- Failure intelligence may work best as an augmentation layer rather than a standalone runner.

### Done Criteria
- [ ] One primary wedge is chosen.
- [ ] Non-primary scenarios are categorized as supporting, deferred, or discarded.
- [ ] The selected wedge has a concrete 7-day demo and 30-day productization path.
- [ ] The phase names what should not be built next.

## Implement

### Planned Changes
- `.planning/phases/35-wedge-selection/35-01-SUMMARY.md` — wedge decision, scorecard, and next-step recommendation.
- Optional `.planning/phases/35-wedge-selection/WEDGE-SCORECARD.md` — detailed scoring if needed.
- README/strategy docs should not change until the selected wedge has proof, unless the phase explicitly decides current wording is misleading.

### Key Decisions To Preserve
- Only one primary wedge should drive near-term execution.
- Tool catalog expansion is not a product strategy.
- Supporting capabilities should serve the wedge, not compete with it.

## Verify

### Test Cases
- [ ] The selected wedge survives the Phase 34 alternative kill test.
- [ ] The decision explains why non-selected wedges are not primary.
- [ ] The 7-day proof plan is concrete enough to execute next.
- [ ] The 30-day path avoids broad platform expansion.

### Verification Commands
```bash
git diff -- .planning/phases/35-wedge-selection
```

### Acceptance Criteria
- The phase answers: "If this project deserves to exist, what is the first narrow reason?"
- The next execution phase can begin without re-litigating broad positioning.

### Success Criteria
- Future work optimizes for the selected wedge instead of trying to satisfy every possible mobile E2E use case.
