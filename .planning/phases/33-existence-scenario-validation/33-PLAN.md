---
phase: 33-existence-scenario-validation
plan: 01
title: Existence scenario validation
status: planned
summary_file: 33-01-SUMMARY.md
verify_file: 33-01-VERIFY.md
requirements:
  - PRACTICALITY-SCENARIO-01
formal_truth_owners:
  - .planning/practicality-redteam-report-2026-05-23.md
  - docs/strategy/mobile-developer-workflow-analysis.md
  - README.md
---

# Phase 33 Plan 01

## Goal

### Problem
Before improving onboarding or adding capabilities, the project needs to prove it has real usage scenarios that are not already solved well enough by Appium, Maestro, Detox, XCTest/Espresso, Playwright MCP patterns, or small adb scripts.

### Expected Outcome
- [ ] Two to three candidate existence scenarios are defined with concrete user, current workaround, pain, and proof requirement.
- [ ] Each scenario answers why existing tools are insufficient without relying on vague "AI-first" positioning.
- [ ] Each scenario has a smallest validation demo or evidence artifact.
- [ ] Scenarios that do not survive initial scrutiny are explicitly discarded or narrowed.

### Non-goals
- Building the final demo.
- Improving first-run onboarding.
- Expanding MCP tool surface.
- Claiming a product wedge before alternatives are tested in Phase 34.

## Plan

### Strategy
Treat this phase as a product-existence test. The output should be a short list of scenarios that might justify the project, not a polished adoption plan.

### Candidate Scenarios
1. **AI-safe mobile device control via MCP**
   - Hypothesis: AI agents should not be handed raw adb/Appium power; they need policy, session leases, structured results, and evidence.
2. **Failure intelligence layer for mobile E2E**
   - Hypothesis: Existing mobile runners execute actions, but do not produce enough structured diagnosis, recovery context, and agent-consumable evidence.
3. **Unknown-app Explorer coverage discovery**
   - Hypothesis: Teams sometimes need a coverage/evidence map before writing flows, and manual flow authoring is the wrong first step.

### Read First
- `.planning/practicality-redteam-report-2026-05-23.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `README.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
- `docs/strategy/mobile-developer-workflow-analysis.md`
- `docs/guides/ai-agent-invocation.zh-CN.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`

### Task Breakdown
1. For each candidate scenario, define the exact user profile and job-to-be-done.
2. Document what the user does today without this project.
3. Identify what existing tools fail to provide, if anything.
4. Define the smallest proof that would make the scenario credible.
5. Mark each scenario as `candidate`, `narrow`, or `discard`.
6. Produce `33-01-SUMMARY.md` with the surviving scenarios and evidence gaps.

### Scenario Evaluation Questions
- Who exactly has this problem?
- How often does the problem happen?
- What is painful enough that they would try a new tool?
- What do they use today?
- Why is "existing tool + small script" not enough?
- What must be proven in under 7 days?
- What would make a serious mobile engineer dismiss the scenario?

### Risks / Unknowns
- The strongest user may be AI-agent builders, not traditional mobile QA teams.
- The project may need to narrow away from "mobile E2E platform" toward "AI-safe mobile harness".
- Some impressive current capabilities may be supporting features, not the core wedge.

### Done Criteria
- [ ] Every kept scenario names a concrete user and urgent pain.
- [ ] Every kept scenario names the current workaround and why it is insufficient.
- [ ] Every kept scenario has a smallest proof artifact.
- [ ] At least one candidate is allowed to be discarded if it is weak.

## Implement

### Planned Changes
- `.planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md` — scenario findings and keep/narrow/discard decisions.
- Optional `.planning/phases/33-existence-scenario-validation/SCENARIOS.md` — detailed scenario cards if the summary becomes too dense.
- No code changes planned.

### Key Decisions To Preserve
- Do not optimize adoption before proving someone has a strong reason to adopt.
- Do not position as a generic replacement for established mobile E2E tools.
- A scenario only survives if existing tools leave a meaningful gap.

## Verify

### Test Cases
- [ ] Each scenario has user, pain, workaround, insufficient alternative, proof artifact, and verdict.
- [ ] The phase summary identifies which scenario should enter Phase 34 kill testing first.
- [ ] No public docs are updated as if the scenario is already validated.

### Verification Commands
```bash
git diff -- .planning/phases/33-existence-scenario-validation
```

### Acceptance Criteria
- The phase answers: "Does this project have a real usage scene?"
- The output makes it possible to reject weak scenarios early.

### Success Criteria
- The next phase can test surviving scenarios against existing tools instead of debating positioning abstractly.
