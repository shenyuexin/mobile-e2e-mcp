---
title: "Phase 10 Plan 01 — MVP Command Support Matrix"
phase: 10-android-real-device-replay-dependency-reduction
plan: 01
artifact_type: task-0-exit
created: "2026-04-06"
status: frozen
---

# MVP Command Support Matrix (Authoritative for Phase 10 Plan 01)

This file is the single source of truth for planner/orchestrator implementation.
No further matrix changes allowed after Task 0 completes without re-scoping this plan.

## 1. Command Support Matrix

| Command category | Command | MVP status | Owned lane (`owned-adb`) behavior | Maestro fallback behavior |
|---|---|---|---|---|
| app lifecycle | `launchApp` | ✅ supported | Supported via existing `launch_app` action intent through owned Android runtime | Optional fallback |
| app lifecycle | `stopApp` | ❌ unsupported | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| app lifecycle | `clearState` | ❌ unsupported | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| interaction | `tapOn` (selector) | ✅ supported | Selector mapping via planner (`resourceId`, `identifier`, `text`) → owned Android runtime | Optional fallback |
| interaction | `tapOn` (point) | ❌ unsupported in MVP | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| interaction | `inputText` | ⚠️ conditional | Only when deterministic focus/target evidence exists (see Text/Focus Safety Rules) | Fallback **before first mutating step** if policy allows |
| interaction | `scroll` | ❌ unsupported in MVP | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| interaction | `swipe` | ❌ unsupported in MVP | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| interaction | `back` / `home` / `killApp` | ❌ unsupported in MVP | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| assertion | `assertVisible` | ✅ supported (bounded) | Supported as bounded replay check via `wait_for_ui` action intent | Optional fallback |
| assertion | `assertNotVisible` | ❌ unsupported in MVP | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |
| flow control | nested `runFlow` | ❌ unsupported in MVP | Deterministic terminal fail (`UNSUPPORTED_OPERATION` + `stopReason: "unsupported_step_for_owned_backend"`) | Optional fallback **only before first mutating step** |

## 2. Mutation Classification

### Mutating Commands (side-effect on app/device state)
- `launchApp` — transitions app to foreground
- `tapOn` — may trigger state-changing UI interaction
- `inputText` — mutates input field content

### Non-Mutating Commands (read-only or verification)
- `assertVisible` — checks UI state without mutation

### Unsupported Commands (all terminal-fail in owned lane)
- `stopApp`, `clearState`, `scroll`, `swipe`, `back`, `home`, `killApp`, `assertNotVisible`, `runFlow`, `tapOn.point`

## 3. Fallback Eligibility Rules

### Pre-Execution (Planner Pre-Scan)
1. **All steps supported** → `owned-adb` primary backend, no fallback evaluation needed.
2. **Has unsupported step BEFORE first mutating step** → `maestro` primary backend (if policy allows helper-app fallback).
3. **Has unsupported step AFTER first mutating step** → Terminal fail; mid-flow backend swap is disallowed.

### Runtime (During Execution)
1. **Low-confidence text targeting detected** (before first mutating step):
   - Fallback allowed if policy permits AND helper apps are available.
   - If helper apps missing → terminal fail with `stopReason: "owned_backend_low_confidence_text_target"`.
2. **Low-confidence text targeting detected** (after first mutating step):
   - Terminal fail; do not mid-flow swap backends.
3. **Unsupported step encountered at runtime** (planner missed it):
   - If no mutating step has completed → fallback allowed (policy-gated).
   - If mutating step has completed → terminal fail with `stopReason: "unsupported_step_for_owned_backend"`.

### Fallback Blocked Conditions
- If fallback is selected but `dev.mobile.maestro` or `dev.mobile.maestro.test` is missing:
  - Terminal fail with `reasonCode: DEVICE_UNAVAILABLE` and `stopReason: "fallback_blocked_missing_helper_apps"`.
  - Do NOT silently continue in mixed mode.

## 4. Backend Selection Persistence

- Backend is determined during `replay-step-planner.ts` full-flow pre-scan.
- Emitted as `resolvedBackend: "owned-adb" | "maestro"` in planner output envelope.
- `replay-step-orchestrator.ts` reads `resolvedBackend` from planner output and does NOT re-evaluate per step.
- If fallback is triggered at runtime, orchestrator updates `resolvedBackend` to `"maestro"` in replay timeline metadata and sets `fallbackTriggeredAtStep: <stepNumber>`.
- Session context (`sessionId`-scoped artifact) stores final backend selection in replay summary for post-mortem triage.

## 5. Terminal Fail Label Mapping

| stopReason Label | Terminal reasonCode | Trigger condition |
|---|---|---|
| `unsupported_step_for_owned_backend` | `UNSUPPORTED_OPERATION` | Unsupported command in owned lane |
| `owned_backend_runtime_failure` | Underlying step/tool reasonCode | Step execution failure in owned lane |
| `owned_backend_low_confidence_text_target` | Underlying step/tool reasonCode or `ACTION_TYPE_FAILED` | Text target confidence below threshold |
| `fallback_blocked_missing_helper_apps` | `DEVICE_UNAVAILABLE` | Fallback selected but helper apps missing |
| `coordinate_tap_not_supported` | `UNSUPPORTED_OPERATION` | `tapOn.point` in owned lane |
| `blocked_by_unsupported_flow_command` | `UNSUPPORTED_OPERATION` | Flow contains unsupported command (existing dry-run path) |

## 6. Text / Focus Safety Rules (Non-Negotiable)

Owned backend must only execute `inputText` when ALL of the following are true:
1. Resolved target is **unique** (no ambiguity) and derived from stable selector evidence (`resourceId` / `identifier` preferred; text-only only when unique).
2. Immediately preceding focus-producing action in owned lane targeted the **same resolved node**.
3. Most recent UI snapshot before text entry shows **no conflicting focused editable element**.

If ANY condition fails:
- **Before first mutating step**: Fallback may be used when policy allows and helper apps are available.
- **After first mutating step**: Terminate replay deterministically; do NOT mid-flow swap backends.
- **Never** report `success` for text-entry step when target confidence is below deterministic threshold.

## 7. Execution Mode Mapping

| Backend | executionMode field | Notes |
|---|---|---|
| `owned-adb` | `step_orchestrated` | Owned Android replay lane |
| `maestro` | `runner_compat` | Maestro helper-app fallback lane |

## 8. Scope Boundaries

### In-Scope for This Phase
- Android **physical-device** `run_flow` live replay default backend selection and fallback semantics.
- Planner/orchestrator mapping for bounded MVP command set defined in this matrix.
- Android **simulator** replay path remains unchanged.
- **iOS** replay path remains unchanged.
- **Dry-run preview** replay path remains unchanged.

### Out-of-Scope for This Phase
- iOS runtime behavior changes.
- Simulator replay semantics changes.
- Flow grammar expansion beyond this matrix.
- Broad contract redesign beyond fields/reason codes explicitly listed in 10-01-PLAN.md.
- New public feature-flag / rollback switch.
