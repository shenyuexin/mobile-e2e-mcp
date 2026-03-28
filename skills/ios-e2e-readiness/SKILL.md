---
name: ios-e2e-readiness
description: Use when iOS mobile E2E flows are flaky, SwiftUI and UIKit surfaces disagree with automation, mixed screens are ambiguous, retries hide the real issue, or the team keeps collapsing the problem to timing-only or SwiftUI-only without checking iOS-specific readiness contracts.
---

# iOS E2E Readiness

## Overview
Use this skill after the shared baseline when the problem is clearly iOS-specific. The goal is to turn vague “SwiftUI timing” or “just add waits” debates into iOS-specific contract fixes around launch/reset behavior, stable identifiers, mixed ownership, ready-state visibility, interruption handling, and post-transition actionability.

## When to Use

- iOS-only mobile E2E is flaky
- SwiftUI screens look correct but controls are not reliably actionable
- UIKit lists rely on repeated labels or weak identity
- Mixed SwiftUI/UIKit surfaces are hardest to diagnose
- Retries pass later and the team is debating timing vs selectors vs interruptions

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

Instead, answer what they mean on iOS.

## Quick Reference

| iOS layer | Question to ask first | Typical app-side fix |
|---|---|---|
| Launch / reset | Is the flow reproducible from a stable iOS launch/reset path? | Fix launch args/env, URL entry, and stale app/simulator assumptions |
| SwiftUI hooks | Are critical controls addressable by stable `accessibilityIdentifier` and clear state? | Add identifiers and actionable state exposure |
| UIKit hooks | Are controls and cells addressable by stable identifiers instead of repeated labels? | Add durable identifiers and reduce repeated-label ambiguity |
| Mixed ownership | Is one target clearly owned across SwiftUI/UIKit boundaries? | Define one actionable owner and one stable identifier |
| State visibility | Can automation tell ready from busy or blocked? | Expose explicit actionable ready-state and blocker signals |
| Interruption handling | Could a permission, modal, or protected state be blocking action? | Surface interruption/blocked-state explicitly before tuning waits |

## Symptom → Next Action

| Failure signal | Most likely iOS gap | Ask for this next | First app-side fix to try |
|---|---|---|---|
| SwiftUI screen visible but control does nothing | Identifier or actionability gap | Whether the control has stable `accessibilityIdentifier` and actionable state | Add stable identifiers plus ready/blocked state |
| UIKit list fails on repeated labels | Weak UIKit locator contract | Whether cells/controls have stable identifiers | Add durable identifiers and reduce repeated-label targeting |
| Mixed screens are the messiest | Mixed ownership ambiguity | Which layer owns the actionable target | Define one owner and one stable identifier |
| Retry later passes | Launch/reset or transition contract gap | Whether the flow started from a clean launch/reset path | Fix launch/reset assumptions before tuning waits |
| Permission/modal interruptions derail runs | Interruption-state gap | Whether the app was visible but blocked/interrupted | Expose interruption/blocked state before tuning waits |

## Repo Toolchain Hints

When the iOS report is weak, collect:

1. `perform_action_with_evidence`
2. `get_screen_summary`
3. `explain_last_failure`
4. `detect_interruption`

Use those outputs before arguing about SwiftUI timing.

## Core Pattern

Diagnose iOS flakiness in this order:

1. **Launch / reset** — is the app entering the flow deterministically?
2. **Locator contract** — is the target owned and addressable by a durable iOS hook?
3. **State visibility** — is the UI truly actionable or only visible?
4. **Interruption check** — could a modal, permission prompt, consent state, or protected state be present?
5. **Transition stability** — are taps happening during transient navigation, sheet, or stale-screen state?

Do not start with “just add more waits around SwiftUI.”

## Forced-Choice Handling

If someone forces a false choice like:

- SwiftUI timing bug
- weak selector
- flaky app

and the evidence is “screen looked right, action did nothing, retry later passed,” do **not** casually choose one of those labels first.

The iOS answer is:

- first suspect an **iOS contract gap**, especially launch/reset, stable identifiers, ready-state signaling, or interruption handling,
- then check whether the action target is weakly owned across SwiftUI / UIKit boundaries.

If forced to pick one narrow label, prefer **iOS readiness / contract issue** over pure timing.

## Quick Response Pattern

Use this shape when the user wants a short answer:

1. Say it is **not just SwiftUI timing** unless the evidence is unusually clean.
2. Name the most likely iOS gap first:
   - launch/reset,
   - stable identifier,
   - mixed ownership,
   - ready / blocked / interrupted state.
3. Tell them to fix the app-side contract before adding more waits.

## Action-Oriented Answer Template

Prefer this answer shape:

1. **Most likely iOS gap**
2. **Why the current evidence points there**
3. **What iOS evidence to collect next if still unsure**
4. **What iOS app-side contract to change first**
5. **When to switch to `ios-development`**

## Fix Order

When the diagnosis is still ambiguous, use this iOS fix order:

1. stabilize launch/reset,
2. make the actionable target durably identifiable,
3. expose ready-vs-blocked-or-interrupted state,
4. only then tune waits or transition handling.

This prevents the common mistake of masking a contract gap with SwiftUI-timing fixes.

## Evidence To Ask For Next

If the first report is thin, ask for:

- whether the failing flow started from a clean launch/reset path
- whether the target lives in SwiftUI, UIKit, or a mixed surface
- whether the target is visible but not actionable vs. blocked by an interruption/modal
- one failing hierarchy or screen summary at the action moment
- whether retry succeeded without any meaningful state change

Ask for launch/reset and interruption evidence before recommending more waits.

## Handoff Rule

Use this skill to identify the **iOS-specific contract gap**.

- If the problem is still cross-platform, hand back to `mobile-e2e-readiness-baseline`.
- If you have already isolated the iOS contract gap and now need to change app code, hand off to `ios-development`.

This skill explains where iOS readiness is weak; `ios-development` is what you use to actually implement the fix.

## Worked Example

**Signal:** “SwiftUI screen looks right, control is visible, tap does nothing, retry later passes.”

**Good answer:**
“This is probably not just SwiftUI timing. Check whether the action target is durably identifiable and truly actionable, especially if SwiftUI/UIKit ownership is mixed. Fix stable identifiers plus ready-vs-blocked signaling before tuning waits.”

## Overlay Focus

### SwiftUI
- `accessibilityIdentifier` placement and coverage
- visible vs actionable state
- sheet / alert / navigation transition stability

### UIKit
- stable identifiers on cells, controls, and navigation elements
- repeated-label ambiguity
- modal/loading overlay visibility

### Mixed
- one actionable owner across SwiftUI and UIKit
- identifier ownership at the boundary
- mixed launch/reset and interruption attribution gaps

## Common Mistakes

- Treating every iOS flake as a SwiftUI timing problem
- Choosing timing vs selector before checking deterministic launch/reset
- Ignoring mixed ownership and assuming one framework owns the action
- Missing interruption/blocked-state interpretation and tuning waits instead
- Using retries to hide missing identifier and actionability contracts
- Staying in readiness mode after the contract gap is already clear instead of handing off to iOS implementation work

## Boundary

This skill is iOS-specific. If the diagnosis is still cross-platform or unclear, load `mobile-e2e-readiness-baseline` first and come back here only when iOS-specific interpretation is required.
