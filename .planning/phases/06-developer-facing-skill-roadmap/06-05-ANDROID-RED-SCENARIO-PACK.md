# Phase 06 Plan 05 Android RED Scenario Pack

## Purpose

This pack is designed to close `L-005` by creating Android-specific RED scenarios that force a plausible wrong diagnosis unless `android-e2e-readiness` is applied.

The target is not better formatting. The target is diagnostic discrimination under pressure.

## Design Rules

1. Do not leak the intended diagnosis through obvious words like `hybrid ownership` or `selector contract`.
2. Include at least one clue that strongly tempts a Compose-only explanation.
3. Omit the one decisive artifact that would make the diagnosis easy.
4. Force the responder to choose one primary cause and one next action.
5. Reject any scenario where an unguided answer still reliably reaches the correct platform-specific diagnosis.

---

## Android Scenario A1 — Hybrid ownership mistaken for Compose timing

- **goal:** Force a wrong Compose-synchronization diagnosis when the more useful diagnosis is mixed-tree ownership / target resolution ambiguity.
- **surface:** hybrid
- **trap_type:** compose_only

**user_prompt**
```text
We need a one-sentence answer for the Android team. A screen looks correct, the primary CTA is visible, tapping sometimes does nothing, and retries later pass. Leadership thinks Compose just needs better waits. Is this basically a Compose timing problem, yes or no, and what should the team fix first?
```

**misleading_clues**
- The CTA is visibly rendered in a Compose-heavy screen.
- A later retry succeeds, which tempts a synchronization-only diagnosis.

**missing_evidence**
- No hierarchy ownership detail showing whether the action target is actually owned by a Compose node, a View wrapper, or a mixed boundary.

**competing_hypotheses**
- Compose synchronization gap — plausible.
- Mixed ownership / target resolution ambiguity — correct.
- Pure harness flake — plausible but too generic.

**expected_red_failure**
- likely_misclassification: “This is basically a Compose timing bug.”

**expected_green_recovery**
- correct_primary_diagnosis: hybrid ownership / selector contract ambiguity
- platform_specific_fix_path: clarify one actionable target owner, strengthen stable hooks across the Compose/View boundary, then add synchronization only if instability remains.

**pass_rule**
- Guided answer refuses to reduce the issue to Compose waits and prioritizes ownership/locator contract first.

**fail_rule**
- Guided answer still recommends “just add more Compose waits” as the first fix.

---

## Android Scenario A2 — Entry/reset ambiguity mistaken for flaky tap behavior

- **goal:** Force a timing/selector diagnosis when the more useful diagnosis is unstable Android entry/reset.
- **surface:** views
- **trap_type:** sync_only

**user_prompt**
```text
Android runs usually fail after landing on what looks like the right screen. Sometimes the main action does nothing, but if the team restarts the flow it passes. We are under pressure to patch the test quickly. Is this more likely a weak selector or a timing issue, and what is the one thing to fix first?
```

**misleading_clues**
- The failure appears on-screen at tap time.
- Restarting makes it pass, which tempts “timing” or “selector” answers.

**missing_evidence**
- No evidence about whether the app entered from a deterministic deep link / intent path or from a dirty session state.

**competing_hypotheses**
- Weak selector — plausible.
- Timing issue — plausible.
- Entry/reset contract failure — correct.

**expected_red_failure**
- likely_misclassification: picks selector or timing and ignores reproducibility/entry assumptions.

**expected_green_recovery**
- correct_primary_diagnosis: entry/reset contract is more suspect than the tap itself.
- platform_specific_fix_path: stabilize Android entry path and session reset before tuning selectors or waits.

**pass_rule**
- Guided answer prioritizes deterministic Android entry/reset over immediate selector/timing patches.

**fail_rule**
- Guided answer still chooses timing or selector as the first fix with no mention of entry/reset.

---

## Android Scenario A3 — OEM/device blocker mistaken for app timing issue

- **goal:** Force a timing diagnosis when the more useful diagnosis is blocked/interrupted state on Android devices.
- **surface:** hybrid
- **trap_type:** interruption_blindness

**user_prompt**
```text
One Android device is much flakier than the others. The screen looks right, taps sometimes do nothing, retries sometimes help, and the team wants to standardize on longer waits. We need a short answer: should we tune waits first or not?
```

**misleading_clues**
- Device-specific flakiness can look like a pure timing issue.
- Retries sometimes work.

**missing_evidence**
- No signal about whether an inline blocker, OEM dialog, permission sheet, or protected state is present.

**competing_hypotheses**
- Wait tuning — plausible.
- App-wide selector weakness — plausible.
- Blocked/interrupted state not exposed to automation — correct.

**expected_red_failure**
- likely_misclassification: recommends longer waits as the first move.

**expected_green_recovery**
- correct_primary_diagnosis: blocked/interrupted state is under-specified; waits mask it.
- platform_specific_fix_path: expose blocked-vs-ready signals, then revisit wait tuning only after blockers are visible.

**pass_rule**
- Guided answer rejects longer waits as the primary fix and points to blocked-state visibility first.

**fail_rule**
- Guided answer still picks waits first.

## Pack Exit Gate

This Android pack is good enough when at least one scenario reliably produces:

1. a meaningful unguided RED misclassification, and
2. a guided GREEN answer that recovers via Android-specific reasoning rather than baseline-only structure.
