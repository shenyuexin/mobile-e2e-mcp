---
phase: 35-wedge-selection
plan: 01
summary_type: internal-planning
task_type: strategy
completed: 2026-05-23
requirements_completed:
  - PRACTICALITY-WEDGE-01
key_files:
  created:
    - .planning/phases/35-wedge-selection/WEDGE-SCORECARD.md
    - .planning/phases/35-wedge-selection/35-01-SUMMARY.md
    - .planning/phases/35-wedge-selection/35-01-VERIFY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
repo_truth_synced:
  - .planning/ROADMAP.md
  - .planning/STATE.md
verify_file: 35-01-VERIFY.md
---

# Phase 35 Plan 01 Summary

## Meta
- Task ID: 35-01
- Date: 2026-05-23
- Repo: mobile-e2e-mcp
- Branch: main
- Owner: Codex
- Type: strategy

## Goal

### Problem
The project needed one narrow wedge instead of continuing as a broad mobile E2E platform story.

### Expected Outcome
- [x] One primary wedge is selected from Phase 33/34 findings.
- [x] Supporting capabilities are explicitly separated from the core wedge.
- [x] The selected wedge has a 7-day proof plan and a 30-day productization path.
- [x] README/product positioning changes are proposed only if the wedge is strong enough.

### Non-goals
- No code changes.
- No public docs changes yet.
- No new MCP tools.
- No attempt to keep all candidate scenarios as primary.

## Plan

### Strategy
Choose the wedge that best survives alternatives and best explains why this repo should exist.

### Task Breakdown
1. Scored the three surviving wedge candidates.
2. Selected one primary wedge.
3. Demoted other candidates to supporting/secondary roles.
4. Defined the selected wedge's 7-day proof plan.
5. Defined a 30-day productization path.
6. Identified what should not be built next.

### Risks / Unknowns
- The selected wedge still needs proof from a concrete agent-driven run.
- The best initial user is narrower than the README's current broad mobile E2E framing.
- External validation from real agent builders is still missing.

### Done Criteria
- [x] One primary wedge is chosen.
- [x] Non-primary scenarios are categorized as supporting, deferred, or discarded.
- [x] The selected wedge has a concrete 7-day demo and 30-day productization path.
- [x] The phase names what should not be built next.

## Wedge Decision

Selected primary wedge:

**AI-safe mobile device control via MCP**

Recommended positioning:

> A governed mobile execution harness for AI agents: policy-bounded, session-oriented, evidence-rich, and deterministic-first.

Why this wedge wins:

- It fits the repo's real differentiators: MCP contracts, policy profiles, sessions, evidence, recovery, and support-boundary reporting.
- It avoids trying to beat Appium/Maestro/Detox/XCTest/Espresso as raw test runners.
- It explains the project as infrastructure for AI agents, not a conventional mobile QA tool.
- It gives Explorer and failure intelligence clear roles as proof and differentiation layers.

## Supporting / Secondary Capabilities

### Explorer coverage discovery

Classification: **secondary wedge candidate / proof layer**

Use Explorer to show that governed agent execution can discover and document app state, not just issue commands.

Constraint:

- Do not lead with Explorer as the primary wedge until it proves value on a realistic app beyond Android Settings.

### Failure intelligence

Classification: **supporting capability**

Use failure intelligence to make the selected wedge credible after actions run: reason codes, evidence, ranked candidates, remediation, and recovery.

Constraint:

- Do not position it as a standalone primary wedge until external evidence shows teams need it more than existing runner artifacts.

## Discarded / Non-Wedges

- Generic mobile E2E platform replacement.
- Broad Android/iOS/RN/Flutter parity pitch.
- Tool catalog as product strategy.
- Enterprise governance/compliance platform.
- Cloud/device-farm scale-out.

## 7-Day Proof Plan

Objective:

Prove that an AI agent can operate a mobile target through a governed MCP harness and leave reviewable evidence that raw adb/Appium/Maestro wrappers do not naturally produce.

Tasks:

1. Define one governed-agent scenario with a concrete mobile target and policy profile.
2. Create an agent task that includes one safe action and one policy-sensitive or ambiguous action.
3. Run or simulate the baseline "custom wrapper" alternative.
4. Run the harness path through session/policy/evidence tooling.
5. Compare baseline vs harness on auditability, bounded control, support-boundary clarity, and evidence quality.
6. Package the proof as a planning/showcase artifact with commands, transcript, outputs, and caveats.
7. Decide whether README positioning should change.

Required artifact:

- `output/showcase/governed-agent-mobile-control/<timestamp>/` or a planning equivalent if no live device is available.

## 30-Day Productization Path

Week 1:

- Complete governed-agent proof.
- Identify missing evidence/report fields.

Week 2:

- Harden the governed golden path:
  - `doctor`
  - `describe_capabilities`
  - `start_session`
  - governed action
  - evidence review
  - remediation/recovery
  - `end_session`

Week 3:

- Add side-by-side proof against custom wrapper or Maestro/Appium baseline.

Week 4:

- Update README/strategy docs only if proof supports the new positioning.
- Plan the smallest missing product gap as the next implementation phase.

## What Not To Build Next

- Do not add more broad MCP tools just to expand the catalog.
- Do not lead with React Native/Flutter parity.
- Do not polish onboarding until the governed-agent proof is convincing.
- Do not expand cloud/device farm support.
- Do not make failure intelligence the main product story yet.

## Recommended Next Phase

Add a new future phase:

**Phase 36: Governed Agent Mobile Control Proof**

Goal:

- Produce the 7-day proof artifact for the selected wedge.

Success condition:

- A reviewer can see why raw adb/Appium/Maestro access is insufficient for autonomous or semi-autonomous AI agents.

## Implement

### Changes
- `.planning/phases/35-wedge-selection/WEDGE-SCORECARD.md` — wedge scoring and selected path.
- `.planning/phases/35-wedge-selection/35-01-SUMMARY.md` — wedge decision and next-phase recommendation.
- `.planning/phases/35-wedge-selection/35-01-VERIFY.md` — verification record.
- `.planning/ROADMAP.md` — Phase 35 completion and Phase 36 candidate sync.
- `.planning/STATE.md` — resume point moved to governed-agent proof.

### Key Decisions
- Primary wedge is AI-safe mobile device control via MCP.
- Explorer becomes a secondary wedge candidate/proof layer.
- Failure intelligence becomes a supporting capability.
- Broad mobile E2E replacement remains discarded.
- Next concrete work should be a proof artifact, not more abstract strategy.

### Deviations
- No README/product docs were changed because proof has not been produced yet.

## Verify

### Test Cases
- [x] The selected wedge survives the Phase 34 alternative kill test.
- [x] The decision explains why non-selected wedges are not primary.
- [x] The 7-day proof plan is concrete enough to execute next.
- [x] The 30-day path avoids broad platform expansion.

### Evidence Types
- [x] scorecard
- [x] planning artifact
- [x] diff check
- [ ] live product proof

### Evidence
```bash
git diff --check
# passed with no output
```

### Result
- Success for wedge selection.
- Product proof still required before public positioning changes.

### Execution Metrics
- Verification scenarios run: 1 local diff check plus scorecard review.
- Environments checked: local planning workspace.
- Notable evidence count: 1 selected primary wedge, 2 supporting/secondary roles, 5 non-wedges.

## Retro

### What went well
- Phase 35 forced the project to pick one story.

### What went wrong
- The prior broad positioning made too many capabilities look equally important.

### Reusable Rule
- If a project has many technically interesting capabilities, choose the wedge that makes the rest obviously supporting.

### Optimization Ideas
- The next phase should be evidence-producing and should end with a concrete yes/no on README repositioning.

## Source-of-Truth Sync

- Formal repo truth affected: no.
- Planning truth updated: `.planning/ROADMAP.md`, `.planning/STATE.md`, and Phase 35 artifacts.

## Next Step

- Plan or execute Phase 36 Governed Agent Mobile Control Proof.
