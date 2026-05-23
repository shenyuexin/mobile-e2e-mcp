---
phase: 33-existence-scenario-validation
plan: 01
summary_type: internal-planning
task_type: strategy
completed: 2026-05-23
requirements_completed:
  - PRACTICALITY-SCENARIO-01
key_files:
  created:
    - .planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md
    - .planning/phases/33-existence-scenario-validation/33-01-VERIFY.md
  modified:
    - .planning/phases/33-existence-scenario-validation/33-PLAN.md
    - .planning/phases/34-alternative-kill-test/34-PLAN.md
    - .planning/phases/35-wedge-selection/35-PLAN.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/practicality-redteam-report-2026-05-23.md
repo_truth_synced:
  - .planning/ROADMAP.md
  - .planning/STATE.md
verify_file: 33-01-VERIFY.md
---

# Phase 33 Plan 01 Summary

## Meta
- Task ID: 33-01
- Date: 2026-05-23
- Repo: mobile-e2e-mcp
- Branch: main
- Owner: Codex
- Type: strategy

## Goal

### Problem
The project needed a stricter answer to whether it has real usage scenarios before spending effort on onboarding, demos, or more capability expansion.

### Expected Outcome
- [x] Two to three candidate existence scenarios are defined with concrete user, current workaround, pain, and proof requirement.
- [x] Each scenario answers why existing tools may be insufficient without relying on vague "AI-first" positioning.
- [x] Each scenario has a smallest validation demo or evidence artifact.
- [x] Scenarios that do not survive initial scrutiny are explicitly discarded or narrowed.

### Non-goals
- No code changes.
- No public positioning updates.
- No final wedge decision before Phase 34 alternative kill testing.

## Plan

### Strategy
Evaluate scenarios as product-existence hypotheses rather than as documentation or demo tasks.

### Task Breakdown
1. Reframed Phases 33-35 around existence scenario validation, alternative kill testing, and wedge selection.
2. Evaluated three candidate scenarios against user, pain, workaround, alternative gap, and smallest proof.
3. Added a discard decision for the broad "generic mobile E2E platform" framing.
4. Recorded Phase 34 inputs and Phase 35 decision constraints.

### Risks / Unknowns
- No real user interview evidence exists yet.
- Phase 34 can still kill or narrow all surviving scenarios.
- Strongest current scenario may target AI-agent/platform builders rather than traditional mobile QA.

### Done Criteria
- [x] Every kept scenario names a concrete user and urgent pain.
- [x] Every kept scenario names the current workaround and why it is insufficient.
- [x] Every kept scenario has a smallest proof artifact.
- [x] At least one candidate is allowed to be discarded if it is weak.

## Scenario Findings

### Scenario 1: AI-safe mobile device control via MCP

Verdict: **keep as strongest candidate**

- User: AI-agent platform builders, internal developer-tool teams, or teams experimenting with autonomous mobile agents.
- Job-to-be-done: Let an agent operate a real/simulated mobile device without exposing raw, unbounded adb/Appium power.
- Current workaround: Give the agent shell access, adb/simctl/devicectl scripts, Appium/Maestro wrappers, or custom MCP tools.
- Why current workaround may be insufficient: Raw command surfaces do not naturally provide policy profiles, session leases, structured result envelopes, timeline evidence, bounded recovery, or clear support boundaries.
- What becomes possible: Agent-executed mobile actions with auditable policy/session/evidence context rather than blind command execution.
- Smallest proof: A short AI-agent run where the agent attempts a mobile task, the harness applies policy/session boundaries, returns structured evidence, and preserves enough context for review.
- Main dismissal risk: If a simple custom MCP wrapper around adb/Appium can provide "good enough" policy and evidence, this scenario weakens.

### Scenario 2: Failure intelligence layer for existing mobile E2E

Verdict: **narrow, not standalone replacement**

- User: Mobile QA/release engineers or app teams already using Maestro, Appium, Detox, XCTest, or Espresso.
- Job-to-be-done: Understand why a mobile flow failed and what to try next without manually piecing together screenshots, logs, UI tree, and device state.
- Current workaround: Runner failure output, screenshots, logcat/simctl logs, custom retry wrappers, manual reruns, and internal triage notes.
- Why current workaround may be insufficient: Existing tools can execute tests well, but teams often need structured reason codes, pre/post state, screenshot/crop evidence, interruption classification, recovery timeline, and remediation suggestions in one packet.
- What becomes easier: Triage and handoff for flaky or environment-sensitive mobile failures.
- Smallest proof: Same failing flow through a baseline runner and through this harness, comparing time-to-triage and artifact completeness.
- Main dismissal risk: If screenshots plus logs plus a small wrapper are enough, this becomes an incremental feature rather than a product wedge.

### Scenario 3: Unknown-app Explorer coverage discovery

Verdict: **keep/narrow as coverage-discovery candidate**

- User: QA leads, product/release reviewers, agencies, or teams onboarding to an unfamiliar mobile app.
- Job-to-be-done: Get a map of reachable screens and navigation paths before writing formal flows.
- Current workaround: Manual clickthrough, exploratory testing notes, screenshots, analytics/sitemap guesses, or writing smoke flows by hand.
- Why current workaround may be insufficient: Manual exploration is hard to reproduce and does not automatically produce state graph, coverage summary, failure review, rule decisions, and machine-readable artifacts.
- What becomes possible: A first-pass coverage/evidence artifact without manually authoring every flow first.
- Smallest proof: Run Explorer on a realistic app and produce tree/report/summary/failure-review artifacts that a tester can use to prioritize flows.
- Main dismissal risk: Current strongest proof is Android Settings Explorer evidence; a serious app team may not accept Settings traversal as proof of app-product value.

### Discarded framing: generic mobile E2E platform / replacement

Verdict: **discard as primary scenario**

- Reason: Appium, Maestro, Detox, XCTest, and Espresso are too strong for a broad replacement story.
- Keep only as supporting context: The project can orchestrate mobile E2E workflows, but the usage scenario should not be "use this instead of existing mobile E2E tools."
- Replacement criterion: Only revisit this if repeated external evidence shows teams prefer this harness as their primary runner, not just as an agent/evidence layer.

## Phase 34 Inputs

Recommended kill-test order:

1. AI-safe mobile device control via MCP.
2. Unknown-app Explorer coverage discovery.
3. Failure intelligence layer for existing mobile E2E.

Phase 34 should try hard to solve each with existing tools plus small scripts. If the leftover value is not clearly tied to policy/session/evidence/recovery/agent contracts or Explorer coverage artifacts, the scenario should be narrowed or discarded.

## Implement

### Changes
- `.planning/phases/33-existence-scenario-validation/33-PLAN.md` — reframed Phase 33 as existence scenario validation.
- `.planning/phases/34-alternative-kill-test/34-PLAN.md` — replaced adoption-friction work with alternative kill testing.
- `.planning/phases/35-wedge-selection/35-PLAN.md` — replaced reliability proof with wedge selection.
- `.planning/ROADMAP.md` — updated Future Candidates names and purposes.
- `.planning/STATE.md` — updated current resume context.
- `.planning/practicality-redteam-report-2026-05-23.md` — added revision note for the stricter phase sequence.
- `.planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md` — captured scenario decisions.
- `.planning/phases/33-existence-scenario-validation/33-01-VERIFY.md` — captured verification evidence.

### Key Decisions
- Do not optimize first-run adoption until a real usage scenario survives scrutiny.
- Do not use broad "mobile E2E platform" as the primary wedge.
- Treat AI-safe mobile device control as the strongest candidate going into Phase 34, but not yet as the final wedge.
- Treat failure intelligence as likely augmentation, not replacement.
- Treat Explorer as a plausible independent wedge only if it proves value on realistic apps, not only Settings traversal.

### Deviations
- The original Phase 34 adoption-friction plan was intentionally replaced because it assumed adoption desire before proving scenario existence.

## Verify

### Test Cases
- [x] Each scenario has user, pain, workaround, insufficient alternative, proof artifact, and verdict.
- [x] The phase summary identifies which scenario should enter Phase 34 kill testing first.
- [x] No public docs are updated as if the scenario is already validated.

### Evidence Types
- [x] file readback
- [x] diff check
- [ ] external user evidence
- [ ] live demo evidence

### Evidence
```bash
git diff --check
# passed with no output
```

- Old phase naming check:
  - Checked `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/practicality-redteam-report-2026-05-23.md`, and the active `33/34/35` plan files.
  - No old phase names remain in those planning owners.

### Result
- Success for planning execution.
- Product proof remains unproven until Phase 34/35 and later demo work.

### Execution Metrics
- Verification scenarios run: 2 local checks.
- Environments checked: local planning workspace.
- Notable evidence count: 3 scenario verdicts plus 1 discarded framing.

## Retro

### What went well
- The phase now attacks the right question: whether a real usage scenario exists.

### What went wrong
- The previous Phase 34 optimized adoption before proving demand.

### Reusable Rule
- If a project has a broad architecture story but unclear demand, validate existence scenarios and alternatives before improving onboarding.

### Optimization Ideas
- Phase 34 should include at least one concrete "existing tool plus script" sketch per scenario, not only prose comparison.

## Source-of-Truth Sync

- Formal repo truth affected: no.
- Planning truth updated: `.planning/ROADMAP.md`, `.planning/STATE.md`, and phase plans.

## Next Step

- Ready for Phase 34 Alternative Kill Test.
