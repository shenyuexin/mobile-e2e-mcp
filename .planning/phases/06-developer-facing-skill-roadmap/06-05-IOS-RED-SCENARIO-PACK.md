# Phase 06 Plan 05 iOS RED Scenario Pack

## Purpose

This pack is designed to close `L-006` by creating iOS-specific RED scenarios that force a plausible wrong diagnosis unless `ios-e2e-readiness` is applied.

The target is not better formatting. The target is diagnostic discrimination under pressure.

## Design Rules

1. Do not leak the intended diagnosis through obvious words like `mixed ownership` or `launch/reset issue`.
2. Include at least one clue that strongly tempts a SwiftUI-only explanation.
3. Omit the decisive artifact that would make interruption or launch-state attribution easy.
4. Force the responder to choose one primary cause and one next action.
5. Reject any scenario where an unguided answer still reliably reaches the correct platform-specific diagnosis.

---

## iOS Scenario I1 — Mixed ownership mistaken for SwiftUI timing

- **goal:** Force a SwiftUI-timing diagnosis when the more useful diagnosis is mixed SwiftUI/UIKit ownership ambiguity.
- **surface:** mixed
- **trap_type:** swiftui_only

**user_prompt**
```text
We need a one-sentence answer for the iOS team. The screen looks correct, the main action is visible, tapping sometimes does nothing, and retries later pass. Leadership thinks SwiftUI timing is the obvious cause. Is this basically a SwiftUI timing problem, yes or no, and what should the team fix first?
```

**misleading_clues**
- The visible problem is on a SwiftUI-looking screen.
- Retry later passes, which tempts a transition-timing diagnosis.

**missing_evidence**
- No ownership detail showing whether the actionable target is controlled by SwiftUI, UIKit, or a mixed boundary.

**competing_hypotheses**
- SwiftUI timing — plausible.
- Mixed-surface ownership / locator contract ambiguity — correct.
- Pure harness flake — plausible but too generic.

**expected_red_failure**
- likely_misclassification: “This is basically a SwiftUI timing bug.”

**expected_green_recovery**
- correct_primary_diagnosis: mixed-surface ownership plus locator contract ambiguity
- platform_specific_fix_path: define stable actionable ownership and identifiers across the SwiftUI/UIKit boundary before blaming timing.

**pass_rule**
- Guided answer refuses to reduce the issue to SwiftUI timing and prioritizes mixed ownership / locator contract first.

**fail_rule**
- Guided answer still recommends “fix SwiftUI timing first.”

---

## iOS Scenario I2 — Launch/reset ambiguity mistaken for UI flake

- **goal:** Force a UI-timing/selector diagnosis when the more useful diagnosis is unstable iOS launch/reset behavior.
- **surface:** uikit
- **trap_type:** launch_reset_blindness

**user_prompt**
```text
iOS runs usually fail after landing on what looks like the right screen. A later retry often passes, so the team thinks the problem is just interaction timing. We need one short recommendation: what should they fix first?
```

**misleading_clues**
- Failure happens after arrival on the screen.
- Retry later passes.

**missing_evidence**
- No information about launch arguments, leftover simulator state, onboarding residue, or app reset semantics.

**competing_hypotheses**
- Interaction timing — plausible.
- Weak locator — plausible.
- Launch/reset contract failure — correct.

**expected_red_failure**
- likely_misclassification: picks timing or selectors first and ignores deterministic start-state concerns.

**expected_green_recovery**
- correct_primary_diagnosis: launch/reset contract is more suspect than the tap itself.
- platform_specific_fix_path: stabilize iOS entry/reset path before tuning waits or selectors.

**pass_rule**
- Guided answer prioritizes deterministic launch/reset over immediate timing patches.

**fail_rule**
- Guided answer still picks timing or selectors first with no mention of launch/reset.

---

## iOS Scenario I3 — Interruption attribution mistaken for timing

- **goal:** Force a timing diagnosis when the more useful diagnosis is unmodeled interruption / blocked state.
- **surface:** mixed
- **trap_type:** interruption_only

**user_prompt**
```text
One iOS flow is much flakier on some runs than others. The screen looks right, taps sometimes do nothing, retries sometimes help, and the team wants to just add more waits around the action. We need a short answer: should they tune waits first or not?
```

**misleading_clues**
- The screen visually appears correct.
- Retries sometimes work.

**missing_evidence**
- No signal about permission prompts, modal blockers, consent states, or whether the app is visible-but-interrupted.

**competing_hypotheses**
- Wait tuning — plausible.
- SwiftUI transition bug — plausible.
- Interrupted / blocked state not exposed to automation — correct.

**expected_red_failure**
- likely_misclassification: recommends waits first.

**expected_green_recovery**
- correct_primary_diagnosis: blocked/interrupted state is under-specified; waits mask it.
- platform_specific_fix_path: expose ready-vs-blocked signaling and interruption handling before tuning waits.

**pass_rule**
- Guided answer rejects longer waits as the primary fix and points to interruption/blocked-state visibility first.

**fail_rule**
- Guided answer still chooses waits first.

## Pack Exit Gate

This iOS pack is good enough when at least one scenario reliably produces:

1. a meaningful unguided RED misclassification, and
2. a guided GREEN answer that recovers via iOS-specific reasoning rather than baseline-only structure.
