---
phase: 34-alternative-kill-test
plan: 01
title: Alternative kill test
status: planned
summary_file: 34-01-SUMMARY.md
verify_file: 34-01-VERIFY.md
requirements:
  - PRACTICALITY-KILL-TEST-01
formal_truth_owners:
  - .planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md
  - .planning/practicality-redteam-report-2026-05-23.md
  - docs/strategy/mobile-developer-workflow-analysis.md
---

# Phase 34 Plan 01

## Goal

### Problem
Surviving scenarios from Phase 33 still may not justify this project if existing tools plus light scripting solve them well enough.

### Expected Outcome
- [ ] Each surviving scenario is tested against realistic alternatives.
- [ ] The project is allowed to lose scenarios when alternatives are sufficient.
- [ ] Remaining value is expressed as a concrete gap, not as broad positioning.
- [ ] A `keep`, `narrow`, or `discard` verdict is recorded for each scenario.

### Non-goals
- Reducing onboarding friction.
- Writing broad comparison marketing copy.
- Building support for every alternative tool.
- Forcing the project to win every comparison.

## Plan

### Strategy
Actively try to kill the project thesis. For each Phase 33 scenario, ask whether Maestro, Appium, Detox, native XCTest/Espresso, Playwright MCP patterns, or a small adb/script wrapper is enough.

### Alternatives To Test
- **Maestro**: simple flow authoring, screenshots, CI-friendly YAML.
- **Appium**: broad ecosystem and standardized automation APIs.
- **Detox**: strong React Native app-owned testing.
- **XCTest/Espresso**: deterministic native test ownership.
- **Playwright MCP + mobile bridge pattern**: agent-friendly orchestration around custom device commands.
- **Ad-hoc adb/simctl/devicectl scripts**: quick one-off device control.

### Read First
- `.planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md`
- `.planning/practicality-redteam-report-2026-05-23.md`
- `README.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
- `docs/strategy/mobile-developer-workflow-analysis.md`

### Task Breakdown
1. Take each kept/narrowed Phase 33 scenario and write the best alternative-tool solution.
2. Estimate implementation effort and operational complexity for that alternative.
3. Identify what remains missing after the alternative solution.
4. Decide whether the remaining gap is meaningful enough for this project.
5. Produce `SCENARIO-KILL-TEST.md` or fold the table into `34-01-SUMMARY.md`.
6. Rank surviving scenarios by strength after alternatives have had their best case.

### Kill-Test Table Fields
- Scenario
- Existing tool solution
- Setup/implementation effort
- What the alternative solves well
- What remains missing
- Does `mobile-e2e-mcp` still matter?
- Verdict: `keep`, `narrow`, or `discard`

### Risks / Unknowns
- Some scenarios may collapse into "Maestro plus scripts is enough"; that is a useful result.
- The best wedge may be narrower than the current README framing.
- A fair comparison may require limited experiments, not just desk analysis.

### Done Criteria
- [ ] Every Phase 33 survivor has a serious alternative solution written down.
- [ ] At least one scenario can be discarded or narrowed if alternatives are strong.
- [ ] Remaining project value is tied to policy/session/evidence/recovery/agent contract or Explorer coverage, not generic execution.
- [ ] Phase 35 has enough input to choose a wedge.

## Implement

### Planned Changes
- `.planning/phases/34-alternative-kill-test/34-01-SUMMARY.md` — final kill-test matrix and verdicts.
- Optional `.planning/phases/34-alternative-kill-test/SCENARIO-KILL-TEST.md` — full comparison if the matrix is large.
- No code changes planned unless a tiny experiment is needed to make a comparison fair.

### Key Decisions To Preserve
- If an existing tool plus a small script solves the scenario well enough, discard the scenario.
- A project wedge must be based on leftover value after alternatives, not on feature count.
- Traditional mobile E2E tools are strong; the project should not pretend otherwise.

## Verify

### Test Cases
- [ ] Alternatives are represented by their strongest practical version, not strawmen.
- [ ] Each scenario has a clear keep/narrow/discard verdict.
- [ ] Any claimed remaining gap is specific and testable.

### Verification Commands
```bash
git diff -- .planning/phases/34-alternative-kill-test
```

### Acceptance Criteria
- The phase answers: "Why not just use existing tools?"
- Weak scenarios are removed before productization work begins.

### Success Criteria
- Phase 35 can choose a single wedge from evidence, not preference.
