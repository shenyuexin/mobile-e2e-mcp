---
phase: 34-alternative-kill-test
plan: 01
summary_type: internal-planning
task_type: strategy
completed: 2026-05-23
requirements_completed:
  - PRACTICALITY-KILL-TEST-01
key_files:
  created:
    - .planning/phases/34-alternative-kill-test/SCENARIO-KILL-TEST.md
    - .planning/phases/34-alternative-kill-test/34-01-SUMMARY.md
    - .planning/phases/34-alternative-kill-test/34-01-VERIFY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
repo_truth_synced:
  - .planning/ROADMAP.md
  - .planning/STATE.md
verify_file: 34-01-VERIFY.md
---

# Phase 34 Plan 01 Summary

## Meta
- Task ID: 34-01
- Date: 2026-05-23
- Repo: mobile-e2e-mcp
- Branch: main
- Owner: Codex
- Type: strategy

## Goal

### Problem
Surviving Phase 33 scenarios could still be weak if existing tools plus small scripts solve them well enough.

### Expected Outcome
- [x] Each surviving scenario is tested against realistic alternatives.
- [x] The project is allowed to lose scenarios when alternatives are sufficient.
- [x] Remaining value is expressed as a concrete gap, not as broad positioning.
- [x] A `keep`, `narrow`, or `discard` verdict is recorded for each scenario.

### Non-goals
- No code changes.
- No onboarding work.
- No final wedge decision; Phase 35 owns selection.

## Plan

### Strategy
Represent alternatives at their strongest practical version, including "existing tool plus small internal script" rather than only out-of-the-box behavior.

### Task Breakdown
1. Read Phase 33 scenario findings and current repo evidence docs.
2. Checked current official alternative-tool positioning for Maestro, Appium, Detox/RN guidance, and Playwright MCP.
3. Wrote the best alternative-tool solution for each scenario.
4. Identified leftover value after alternatives.
5. Recorded keep/narrow/discard verdicts in `SCENARIO-KILL-TEST.md`.

### Risks / Unknowns
- This is still desk-analysis plus documentation review, not a live experiment.
- A small custom MCP wrapper could still kill much of the AI-safe-control scenario for teams with simple needs.
- Failure intelligence is weaker than it first looked because Maestro already has rich debug artifacts.

### Done Criteria
- [x] Every Phase 33 survivor has a serious alternative solution written down.
- [x] At least one scenario can be discarded or narrowed if alternatives are strong.
- [x] Remaining project value is tied to policy/session/evidence/recovery/agent contract or Explorer coverage, not generic execution.
- [x] Phase 35 has enough input to choose a wedge.

## Kill-Test Results

### 1. AI-safe mobile device control via MCP

Verdict: **keep / strongest**

Best alternative: custom MCP wrapper around adb/simctl/devicectl or Appium/Maestro commands with allowlists, logging, screenshots, simple session IDs, and timeouts.

Why the alternative is strong:

- It can be built quickly for a narrow internal agent.
- It can expose only the commands the team wants.
- It can collect basic screenshots/logs without adopting a large harness.

Remaining gap:

- Once the wrapper becomes serious, it must reimplement policy profiles, leases, structured envelopes, support-boundary reporting, deterministic-first resolution, fallback disclosure, evidence attachment, and recovery semantics.

Conclusion:

- This remains the strongest candidate, but the wedge should be phrased as **agent-governed mobile execution harness**, not generic mobile E2E.

### 2. Unknown-app Explorer coverage discovery

Verdict: **keep / narrow**

Best alternative: custom crawler using Appium page source or UIAutomator XML, screenshots, visited-state hashes, and manual/CI reporting.

Why the alternative is strong:

- Skilled teams can build a simple crawler for their app.
- Appium/UIAutomator already expose enough structure for basic screen discovery.
- Manual exploratory testing plus screenshots may be sufficient for small apps.

Remaining gap:

- Durable traversal requires state identity, cycle control, page-context handling, risk/skip rules, external-app boundaries, circuit breakers, failure review, and machine-readable coverage reports.

Conclusion:

- Explorer remains promising, but only if proven on a realistic app. Android Settings evidence proves traversal mechanics, not product-market usefulness.

### 3. Failure intelligence layer for existing mobile E2E

Verdict: **narrow / supporting**

Best alternative: Maestro debug output/AI reports or Appium/Detox/native test hooks collecting screenshots, logs, videos, CI artifacts, and custom failure parsers.

Why the alternative is strong:

- Maestro already provides rich debug artifacts, including screenshots, videos, logs, commands JSON, and AI reports.
- Appium and native frameworks can integrate deeply with test frameworks and CI.
- Teams can add enough triage scripting for common cases.

Remaining gap:

- Cross-tool reason codes, session timelines, policy-aware recovery attempts, ranked candidates, known remediation routing, and agent-consumable envelopes.

Conclusion:

- Useful, but not strong enough as the primary wedge without external evidence. It should support AI-safe execution or Explorer.

### 4. Generic mobile E2E replacement

Verdict: **discard**

Reason:

- Maestro, Appium, Detox, XCTest, and Espresso are too mature for a broad replacement story.
- The project should stop trying to win as "another mobile E2E runner."

## Phase 35 Recommendation

Primary candidate:

- **AI-safe mobile device control via MCP**

Secondary candidate:

- **Unknown-app Explorer coverage discovery**

Supporting capability:

- **Failure intelligence layer**

Discarded:

- **Generic mobile E2E replacement**

Phase 35 should decide whether to:

1. Select AI-safe mobile device control as the primary wedge and use Explorer/failure intelligence as proof/differentiation layers.
2. Select Explorer as the primary wedge if agent-safe control feels too infrastructure-heavy.
3. Defer wedge selection if neither has a concrete 7-day proof path.

## Implement

### Changes
- `.planning/phases/34-alternative-kill-test/SCENARIO-KILL-TEST.md` — detailed kill-test matrix.
- `.planning/phases/34-alternative-kill-test/34-01-SUMMARY.md` — phase conclusion.
- `.planning/phases/34-alternative-kill-test/34-01-VERIFY.md` — verification record.
- `.planning/ROADMAP.md` — Phase 34 completion sync.
- `.planning/STATE.md` — resume point moved to Phase 35.

### Key Decisions
- Existing tools can kill broad runner/replacement positioning.
- Failure intelligence is valuable but should be supporting, not primary, unless external evidence proves acute demand.
- AI-safe mobile device control survives because "small MCP wrapper" grows into the same policy/session/evidence/recovery problem this repo already models.
- Explorer survives only as a narrow coverage-discovery candidate requiring realistic-app proof.

### Deviations
- No live tool experiment was run. Phase 34 remained a planning/strategy kill test because the immediate user request was to proceed phase-by-phase after planning.

## Verify

### Test Cases
- [x] Alternatives are represented by their strongest practical version, not strawmen.
- [x] Each scenario has a clear keep/narrow/discard verdict.
- [x] Any claimed remaining gap is specific and testable.

### Evidence Types
- [x] planning artifact
- [x] source/reference review
- [x] diff check
- [ ] live benchmark

### Evidence
```bash
git diff --check
# passed with no output
```

Key reference context checked:

- `README.md` project positioning and tool catalog.
- `docs/showcase/README.md` evidence boundaries.
- `docs/showcase/ci-evidence.md` CI and real-device proof boundaries.
- `docs/strategy/mobile-developer-workflow-analysis.md` workflow gaps and current MCP chains.
- Official alternative docs for Maestro, Appium, React Native testing guidance, and Playwright MCP.

### Result
- Success for strategy/planning kill test.
- Remaining proof gap: no live side-by-side experiment yet.

### Execution Metrics
- Verification scenarios run: 1 local diff check plus documentation/reference review.
- Environments checked: local planning workspace.
- Notable evidence count: 4 scenario verdicts.

## Retro

### What went well
- The kill test forced the project away from broad runner positioning.

### What went wrong
- Failure intelligence became less wedge-like once Maestro's existing debug artifact story was considered seriously.

### Reusable Rule
- If an existing tool plus one small script can satisfy a scenario, keep that scenario only if the leftover gap is expensive, recurring, and strategically aligned.

### Optimization Ideas
- Phase 35 should score wedges with proof cost, not just differentiation.

## Source-of-Truth Sync

- Formal repo truth affected: no.
- Planning truth updated: `.planning/ROADMAP.md`, `.planning/STATE.md`, and Phase 34 artifacts.

## Next Step

- Ready for Phase 35 Wedge Selection.
