---
name: android-e2e-readiness
description: Use when Android mobile E2E flows are flaky, Compose and View screens disagree with automation, hybrid screens are ambiguous, retries hide the real issue, or the team keeps collapsing the problem to selector-vs-timing without checking Android-specific readiness contracts.
---

# Android E2E Readiness

## Overview
Use this skill after the shared baseline when the problem is clearly Android-specific. The goal is to turn vague “Compose timing” or “weak selector” debates into Android-specific contract fixes around entry/reset, stable hooks, hybrid ownership, ready-state visibility, and blocked-state interpretation.

## When to Use

- Android-only mobile E2E is flaky
- Compose screens look correct but taps miss or do nothing
- View screens rely on repeated labels or weak ids
- Hybrid Compose/View screens are hardest to diagnose
- Restarting a flow makes it pass and the team is debating timing vs selector

Do **not** use this before the baseline skill when the problem is still cross-platform and the team lacks shared readiness vocabulary.

## Inheritance Rule

This skill **extends** `mobile-e2e-readiness-baseline`.

Do not redefine the shared contract terms:

- deterministic entry
- stable locators
- ready / busy / blocked state
- reset semantics
- transition stability
- evidence hooks
- remediation path

Instead, answer what they mean on Android.

## Quick Reference

| Android layer | Question to ask first | Typical app-side fix |
|---|---|---|
| Entry / reset | Is the flow reproducible from a stable Android entry path? | Fix deep link / intent entry and reset assumptions |
| Compose hooks | Are critical nodes addressable by `testTag` and semantics? | Add stable tags and state/role exposure |
| View hooks | Are actions addressable by stable `resource-id` / useful `contentDescription`? | Add durable ids and reduce repeated-label ambiguity |
| Hybrid ownership | Is one target clearly owned across Compose/View boundaries? | Define one actionable owner and one stable hook |
| State visibility | Can automation tell ready from busy or blocked? | Expose actionable ready-state and blocker signals |
| Blocked state | Could dialogs, sheets, OEM blockers, or protected states be present? | Surface blocked-vs-ready explicitly before tuning waits |

## Symptom → Next Action

| Failure signal | Most likely Android gap | Ask for this next | First app-side fix to try |
|---|---|---|---|
| Compose screen visible but tap misses | Compose hook or actionability gap | Whether the node has `testTag`/semantics and was actionable | Add stable tags plus actionability signal |
| View list fails on repeated labels | Weak View locator contract | Whether the row has stable `resource-id` or useful identity | Add durable ids and reduce repeated-label targeting |
| Hybrid screen is the flakiest | Hybrid ownership ambiguity | Which tree actually owns the tappable target | Define one actionable owner and one stable hook |
| Restarting the flow makes it pass | Entry/reset contract gap | Whether the flow started from a stable Android entry path | Fix deep link / intent entry and session reset assumptions |
| One device is worse than others | Blocked/interrupted state gap | Whether a dialog, sheet, OEM prompt, or protected state was present | Expose blocked-vs-ready state before tuning waits |

## Repo Toolchain Hints

When the Android report is weak, collect:

1. `perform_action_with_evidence`
2. `get_screen_summary`
3. `explain_last_failure`
4. `rank_failure_candidates`

Use those outputs before arguing about Compose timing.

## Core Pattern

Diagnose Android flakiness in this order:

1. **Entry / reset** — is the app entering the flow deterministically?
2. **Locator contract** — is the target owned and addressable by a durable Android hook?
3. **State visibility** — is the UI truly actionable or only visible?
4. **Blocked-state check** — could a dialog, sheet, OEM interruption, or protected state be present?
5. **Transition stability** — are taps happening during transient motion or stale layout?

Do not start with “just add more Compose waits.”

## Forced-Choice Handling

If someone forces a false choice like:

- weak selector
- timing issue
- Compose bug

and the evidence is “screen looked right, action did nothing, restart later passed,” do **not** casually choose one of those labels first.

The Android answer is:

- first suspect an **Android contract gap**, especially entry/reset or ready-state signaling,
- then check whether the action target is weakly owned across Compose / View boundaries.

If forced to pick one narrow label, prefer **Android readiness / contract issue** over pure timing.

## Quick Response Pattern

Use this shape when the user wants a short answer:

1. Say it is **not just timing** unless the evidence is unusually clean.
2. Name the most likely Android gap first:
   - entry/reset,
   - stable hook,
   - hybrid ownership,
   - ready / blocked state.
3. Tell them to fix the app-side contract before adding more waits.

## Action-Oriented Answer Template

Prefer this answer shape:

1. **Most likely Android gap**
2. **Why the current evidence points there**
3. **What Android evidence to collect next if still unsure**
4. **What Android app-side contract to change first**
5. **When to switch to `android-development`**

## Fix Order

When the diagnosis is still ambiguous, use this Android fix order:

1. stabilize entry/reset,
2. make the actionable target durably addressable,
3. expose ready-vs-blocked state,
4. only then tune waits or transition handling.

This prevents the common mistake of masking a contract gap with synchronization patches.

## Evidence To Ask For Next

If the first report is thin, ask for:

- whether the failing flow started from a clean Android entry path
- whether the target lives in Compose, Views, or a mixed surface
- whether the target is visible but not actionable vs. missing vs. blocked
- one failing hierarchy or screen summary at the action moment
- whether retry succeeded without any meaningful state change

Ask for Compose/View ownership evidence before recommending more waits.

## Handoff Rule

Use this skill to identify the **Android-specific contract gap**.

- If the problem is still cross-platform, hand back to `mobile-e2e-readiness-baseline`.
- If you have already isolated the Android contract gap and now need to change app code, hand off to `android-development`.

This skill explains where Android readiness is weak; `android-development` is what you use to actually implement the fix.

## Worked Example

**Signal:** “Compose screen renders, taps miss, hybrid screens are worst, restart later passes.”

**Good answer:**
“This is probably not just Compose timing. Check hybrid ownership first: if the tappable target is weakly owned across Compose/View boundaries, retries will only mask it. Fix one durable owner plus one stable hook, then expose ready-vs-blocked state before adding more waits.”

## Overlay Focus

### Compose
- `testTag` presence and naming quality
- semantics clarity and role/state exposure
- not confusing visible with actionable

### View system
- stable `resource-id`
- repeated-label ambiguity
- useful `contentDescription` instead of text-only targeting

### Hybrid
- one actionable owner across Compose and Views
- target resolution ambiguity at the boundary
- mixed navigation and synchronization assumptions

## Common Mistakes

- Treating every Android flake as a Compose timing problem
- Choosing selector vs timing before checking deterministic entry/reset
- Ignoring hybrid ownership and assuming one tree owns the action
- Using retries to hide missing blocked-state or ready-state contracts
- Tuning waits before the app exposes stable hooks and actionability signals
- Staying in readiness mode after the contract gap is already clear instead of handing off to Android implementation work

## Boundary

This skill is Android-specific. If the diagnosis is still cross-platform or unclear, load `mobile-e2e-readiness-baseline` first and come back here only when Android-specific interpretation is required.
