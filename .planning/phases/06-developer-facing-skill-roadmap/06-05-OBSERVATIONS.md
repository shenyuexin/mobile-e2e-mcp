# Phase 06 Plan 05 Observation Log

## Run 01 — Baseline Lane

### RED Run

## Meta
- Date: 2026-03-28
- Skill lane: baseline
- Scenario ID: A-RED-01
- Pressure type: time pressure + light ambiguity
- Skill present: no

## Prompt

```text
Our mobile E2E flow is flaky. Sometimes the screen is there, sometimes taps fail, sometimes we just retry and it passes. We need a quick answer: what should the team fix first? Assume we support both Android and iOS and don't give me platform-specific implementation details yet.
```

## Observed Behavior

- Initial framing: The answer independently identified readiness gating as the first fix.
- Diagnosis quality: Reasonable but informal; it focused on readiness, target stability, and transient overlays.
- Remediation quality: Useful first steps, but not organized by the shared contract vocabulary.
- Boundary discipline: Good; it stayed platform-neutral and did not drift into generic coding advice.

## Failure / Success Notes

- Did it fail meaningfully without the skill? **Partial only**. It did not collapse into pure retry advice.
- Did it improve with the draft guidance? Yes, but the RED answer was already moderately good.
- Was any improvement due to setup noise rather than skill content? Improvement appears real, but the scenario was too weak to force a more obvious failure.

## Rationalizations / Loopholes

- The unguided answer derived a decent readiness diagnosis from general engineering judgment, so this scenario does not prove the baseline draft adds enough unique value.

## Verdict

- partial

## Follow-up Change Needed

- strengthen scenario

### GREEN Run

## Meta
- Date: 2026-03-28
- Skill lane: baseline
- Scenario ID: A-GREEN-01
- Pressure type: time pressure + light ambiguity
- Skill present: draft-guided

## Prompt

```text
Our mobile E2E flow is flaky. Sometimes the screen is there, sometimes taps fail, sometimes we just retry and it passes. We need a quick answer: what should the team fix first? Assume we support both Android and iOS and don't give me platform-specific implementation details yet.
```

## Observed Behavior

- Initial framing: The answer explicitly used the shared baseline contract.
- Diagnosis quality: Better structured; it separated deterministic entry, stable locators, ready/busy/blocked state, reset semantics, transition stability, and evidence hook gap.
- Remediation quality: Clearer app-side fix order and explicit rejection of blind retries.
- Boundary discipline: Good; it remained platform-neutral and did not drift into Android/iOS details.

## Failure / Success Notes

- Did it fail meaningfully without the skill? Only partially.
- Did it improve with the draft guidance? **Yes** — primarily in structure, terminology, and explicit evidence-hook framing.
- Was any improvement due to setup noise rather than skill content? No obvious sign of that.

## Rationalizations / Loopholes

- The main observed improvement is structural clarity, not entirely different reasoning. The next baseline scenarios need stronger authority/ambiguity pressure to demonstrate unique value more clearly.

## Verdict

- pass

## Follow-up Change Needed

- stronger RED scenario set

## Interim Readout

- The baseline draft improves answer structure and contract language.
- The first RED scenario was not hard enough to force a meaningful unguided failure.
- Publication gating should require at least one stronger baseline scenario with ambiguity + authority or sunk-cost pressure.

## Run 02 — Baseline Lane (Stronger RED/GREEN)

### RED Run

## Meta
- Date: 2026-03-28
- Skill lane: baseline
- Scenario ID: A-RED-02
- Pressure type: authority pressure + ambiguity pressure + anti-app-change pressure
- Skill present: no

## Prompt

```text
We are not allowed to change the app right now. Management says the harness should handle it. We only have this evidence: the screen looked correct in a screenshot, a tap did nothing, and a retry later passed. We need a very short answer for leadership right now: is this a test timing issue, a selector issue, or a flaky app issue? Pick one and tell us what to do next. We support both Android and iOS, and do not give me a checklist.
```

## Observed Behavior

- Initial framing: The answer collapsed the problem into a single label: `test timing issue`.
- Diagnosis quality: Too narrow; it did not resist the forced misclassification.
- Remediation quality: Focused on harness waiting and bounded retry after state change, but did not surface the underlying shared contract gap.
- Boundary discipline: Good, but oversimplified.

## Failure / Success Notes

- Did it fail meaningfully without the skill? **Yes.** This is the first clear RED failure.
- Did it improve with the draft guidance? Yes — the GREEN answer refused the false triage and reframed it as a readiness contract gap.
- Was any improvement due to setup noise rather than skill content? No obvious sign of that.

## Rationalizations / Loopholes

- Under leadership pressure and forced-label framing, the unguided assistant chose the nearest operational label instead of preserving the underlying readiness diagnosis.

## Verdict

- fail

## Follow-up Change Needed

- none for baseline concept; use this scenario as a required publication-gate check

### GREEN Run

## Meta
- Date: 2026-03-28
- Skill lane: baseline
- Scenario ID: A-GREEN-02
- Pressure type: authority pressure + ambiguity pressure + anti-app-change pressure
- Skill present: draft-guided

## Prompt

```text
We are not allowed to change the app right now. Management says the harness should handle it. We only have this evidence: the screen looked correct in a screenshot, a tap did nothing, and a retry later passed. We need a very short answer for leadership right now: is this a test timing issue, a selector issue, or a flaky app issue? Pick one and tell us what to do next. We support both Android and iOS, and do not give me a checklist.
```

## Observed Behavior

- Initial framing: The answer refused the false selector/timing/app triage and named the real issue as a `contract gap` / readiness issue.
- Diagnosis quality: Strong; it preserved the shared readiness framing under pressure.
- Remediation quality: Short but correctly prioritized ready/transition-stability signaling over blind timing explanations.
- Boundary discipline: Strong; it stayed platform-neutral and concise.

## Failure / Success Notes

- Did it fail meaningfully without the skill? Yes.
- Did it improve with the draft guidance? **Yes, materially.**
- Was any improvement due to setup noise rather than skill content? No obvious sign of that.

## Rationalizations / Loopholes

- None significant in this run.

## Verdict

- pass

## Follow-up Change Needed

- promote this scenario into the core baseline publication gate set

## Run 03 — Android Lane

### RED/GREEN Summary

- Scenario ID: B-01
- Result: RED = partial, GREEN = pass
- Main observation: the unguided Android answer already reached stable selectors + readiness because the prompt itself named Compose, Views, hybrid, and retries.
- Improvement with draft: stronger separation of entry/reset, locator contract, state visibility, transition stability, and hybrid ownership.
- Follow-up need: create a harder Android scenario that stresses evidence interpretation or pushes the assistant to over-index on Compose.

## Run 05 — Android Lane (Harder RED/GREEN)

### RED/GREEN Summary

- Scenario ID: B-02
- Result: RED = partial, GREEN = pass
- RED observation: even under authority pressure to blame Compose timing, the unguided answer still resisted fully collapsing to Compose-only and instead pointed to readiness/target resolution on hybrid Android screens.
- GREEN observation: the draft-guided answer was materially better structured, explicitly naming hybrid ownership, locator contract, state visibility, and the ordering of fixes.
- Main conclusion: the Android draft adds structure and boundary discipline, but the current harder prompt still does not force a strongly meaningful RED failure.
- Follow-up need: design an Android scenario where evidence is more misleading and where hybrid ownership ambiguity competes with pressure to over-fit on Compose synchronization.

## Run 07 — Android Lane (Scenario Pack A1)

### RED/GREEN Summary

- Scenario ID: A1
- Result: RED = partial, GREEN = pass
- RED observation: the unguided answer still resisted a pure Compose-timing diagnosis and instead reframed the problem as UI readiness / interaction-state instability.
- GREEN observation: the draft-guided answer was cleaner and more contract-oriented, explicitly prioritizing deterministic hooks plus ready/busy/blocked signals over Compose waits.
- Main conclusion: A1 is better than the earlier Android prompts, but still not strong enough to force a clearly meaningful RED misclassification.
- Follow-up need: move to A2 and A3, which reduce framework leakage and put more pressure on entry/reset or blocked-state attribution.

## Run 08 — Android Lane (Scenario Pack A2)

### RED/GREEN Summary

- Scenario ID: A2
- Result: RED = fail, GREEN = pass
- RED observation: the unguided answer collapsed the issue into `timing / readiness issue` and explicitly deprioritized selector concerns, missing the deeper Android entry/reset and contract diagnosis.
- GREEN observation: the draft-guided answer resisted the forced selector-vs-timing framing and redirected to Android contract gaps: stable hooks plus ready-state signaling for the main action.
- Main conclusion: A2 finally produces a meaningful Android RED/GREEN split and demonstrates corrective value beyond baseline-only structure.
- Follow-up need: A2 should become one of the core Android publication-gate scenarios.

## Run 04 — iOS Lane

### RED/GREEN Summary

- Scenario ID: C-01
- Result: RED = partial, GREEN = pass
- Main observation: the unguided iOS answer already reached accessibility identifiers + actionable state + interruption handling because the prompt itself exposed the key diagnosis.
- Improvement with draft: stronger separation of entry/reset, locator contract, state visibility, transition stability, and mixed-surface ownership.
- Follow-up need: create a harder iOS scenario that stresses launch/reset ambiguity, interruption attribution, or over-indexing on SwiftUI.

## Run 06 — iOS Lane (Harder RED/GREEN)

### RED/GREEN Summary

- Scenario ID: C-02
- Result: RED = partial, GREEN = pass
- RED observation: even under authority pressure to blame SwiftUI timing, the unguided answer still resisted fully collapsing to SwiftUI-only and instead pointed to readiness plus interruption handling.
- GREEN observation: the draft-guided answer was materially better structured, explicitly naming mixed-surface ownership, ready/blocked signaling, and stable post-transition actionable targets.
- Main conclusion: the iOS draft adds structure and boundary discipline, but the current harder prompt still does not force a strongly meaningful RED failure.
- Follow-up need: design an iOS scenario where launch/reset ambiguity and interruption attribution are under-specified enough that the unguided answer is more likely to misclassify the issue.

## Run 09 — iOS Lane (Scenario Pack I1)

### RED/GREEN Summary

- Scenario ID: I1
- Result: RED = fail, GREEN = pass
- RED observation: the unguided answer accepted the forced framing and classified the issue as a `SwiftUI timing/interaction-readiness issue`.
- GREEN observation: the draft-guided answer rejected the SwiftUI-only framing and redirected to an iOS contract gap: stable locator/accessibility contract plus explicit ready-vs-blocked signaling.
- Main conclusion: I1 finally produces a meaningful iOS RED/GREEN split and demonstrates corrective value beyond baseline-only structure.
- Follow-up need: I1 should become one of the core iOS publication-gate scenarios.
