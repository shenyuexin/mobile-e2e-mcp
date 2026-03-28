---
name: mobile-e2e-readiness-baseline
description: Use when mobile E2E flows are flaky across Android and iOS, visible screens are not reliably actionable, retries hide the real problem, or a team needs a platform-neutral readiness review before platform-specific guidance.
---

# Mobile E2E Readiness Baseline

## Overview
Use this skill to diagnose **app-side readiness contract gaps** before jumping into platform-specific fixes. The core idea is simple: a flow is flaky because the app is not exposing deterministic entry, stable locators, actionable state, reset semantics, or enough evidence for the harness to explain failures.

## When to Use

- Cross-platform mobile E2E is flaky and retries sometimes “fix” it
- A screen looks visible but actions are not reliably actionable
- The team is debating timing vs selector vs flaky app without a shared vocabulary
- You want platform-neutral triage before loading Android or iOS-specific skills

Do **not** use this when the problem is already clearly Android-only or iOS-only and you need platform implementation detail.

## Quick Reference

| Contract | Question to ask first | Typical app-side fix |
|---|---|---|
| Deterministic entry | Can the flow be entered repeatably? | Add a stable entry path and remove hidden setup assumptions |
| Stable locators | Are targets addressable without brittle text-only selection? | Add durable automation hooks |
| Ready / busy / blocked state | Can automation tell visible from actionable? | Expose explicit state signals |
| Reset semantics | Can the run start cleanly every time? | Define reset/start-state behavior |
| Transition stability | Are taps happening during transient state? | Define stable post-transition conditions |
| Evidence hooks | Can failures explain why they failed? | Surface enough app-side signal for diagnosis |
| Remediation path | Does the fix point to the app, not just retries? | Change contracts before adding more retries |

## Symptom → Next Action

| Failure signal | Most likely gap | Ask for this next | First app-side fix to try |
|---|---|---|---|
| Screen is visible but tap does nothing | Ready / blocked state gap | Screen summary or failing action evidence | Expose actionable ready-vs-blocked state |
| Retry later passes | Entry/state/transition contract gap | Exact retry path and whether state changed | Stabilize entry/reset and post-transition conditions |
| Element is missing on some runs | Locator or entry contract gap | Whether the run entered from a clean start path | Add durable hooks and fix deterministic entry |
| Failure report is too vague | Evidence hook gap | `perform_action_with_evidence` result or `get_screen_summary` | Expose richer app-side failure signal |

## Repo Toolchain Hints

If the report is thin, this repo already has a useful failure-intelligence chain:

1. `perform_action_with_evidence`
2. `explain_last_failure`
3. `rank_failure_candidates`
4. `suggest_known_remediation`

Use `get_screen_summary` first when the team only has a screenshot or vague “tap did nothing” evidence.

## Core Pattern

When a flow is flaky, diagnose in this order:

1. **Entry** — is the flow being entered deterministically?
2. **Locators** — are critical actions stably addressable?
3. **State** — is the UI truly ready, busy, blocked, or mid-transition?
4. **Reset** — can the flow start from a known-good state?
5. **Evidence** — does the app expose enough signal to explain failure?

Do not start with “add more retries.” Retries are a bounded fallback, not the primary fix.

## Forced-Choice Handling

If someone forces a false choice like:

- timing issue
- selector issue
- flaky app

and the evidence is only “screen looked right, tap did nothing, retry later passed,” do **not** casually choose one of those labels.

The baseline answer is:

- this is first a **readiness contract gap**, or
- if forced to pick a label, call it a **readiness issue**, not a pure timing/selector/flaky-app claim.

Why: visible is not the same as actionable, and retries often hide missing entry/state/evidence contracts rather than proving a single timing bug.

## Quick Response Pattern

Use this shape when the user wants a short answer:

1. Name the issue as a **readiness contract gap**.
2. Say what is missing first:
   - deterministic entry,
   - stable locator,
   - explicit ready/busy/blocked state, or
   - reset/evidence hook.
3. Tell them to fix the app-side contract before adding more retries.

## Action-Oriented Answer Template

Prefer this answer shape:

1. **Most likely gap**
2. **Why that gap fits the current evidence**
3. **What evidence to collect next if still unsure**
4. **What app-side contract to change first**
5. **What to verify after the change**

## Evidence To Ask For Next

If the first report is thin, ask for the smallest set of facts that changes diagnosis quality:

- the exact screen or flow where the failure happens
- whether the flow was entered from a deterministic start path or a reused session
- whether the target was visible but not actionable, missing, blocked, or stale
- one screenshot or screen summary from the failing moment
- whether retry passed without any app-side state change

Do not ask for platform-specific implementation details here unless the baseline diagnosis already points to Android or iOS.

## Handoff Rule

Use this skill to decide **which layer is broken first**.

- If the issue is still cross-platform or the team keeps forcing timing-vs-selector triage, stay here.
- If the baseline diagnosis points to a platform-specific contract gap, hand off to `android-e2e-readiness` or `ios-e2e-readiness`.
- If readiness looks good but the feature still appears functionally broken, hand off to the broader platform-development skill for implementation/debugging depth.

This skill is a triage layer, not the final implementation layer.

## Worked Example

**Signal:** “The screen looked right, tap did nothing, retry later passed.”

**Good answer:**
“This is first a readiness contract gap, not just a timing bug. Check whether the flow entered from a deterministic start path and whether the target was visible but still blocked or mid-transition. Fix the app-side ready/blocked signal or entry/reset contract before adding more retries.”

## Common Mistakes

- Treating “visible” as equivalent to “actionable”
- Debating timing vs selector without checking entry/reset assumptions
- Using retries to hide missing readiness contracts
- Jumping into platform-specific fixes before shared readiness gaps are understood
- Accepting a forced timing-vs-selector-vs-flaky-app triage when the better diagnosis is a shared readiness contract gap
- Treating a good readiness diagnosis as if it already fixes the app; this skill tells you where to work next, not how to code the final fix

## Output Shape

Use this structure when answering:

- `status`: ready / partial / blocked
- `gaps`: critical / important / nice_to_have
- `contracts`: entryPoints / stableLocators / readySignals / busySignals / resetSignals / evidenceHooks
- `recommendedFixes`
- `verificationChecklist`

## Boundary

This skill stays platform-neutral. When you already know the problem is Android-specific or iOS-specific, hand off to the corresponding platform skill rather than inventing platform details here.
