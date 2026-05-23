# Phase 06 Plan 03 Android Skill Draft

## Skill Name

`android-e2e-readiness`

## Baseline Inheritance

This draft **inherits the shared baseline vocabulary** from `mobile-e2e-readiness-baseline` and should be read as the Android implementation layer for that contract.

It must not redefine:

- deterministic entry
- stable locators
- ready / busy / blocked state
- reset semantics
- transition stability
- evidence hooks
- remediation path

Instead, it answers what those ideas mean on Android.

## Purpose

Help Android teams make screens and flows deterministic, automatable, diagnosable, and recoverable for AI-driven mobile E2E by translating the shared readiness contract into Android-specific app-side guidance.

## When to Use

Use when Android automation is flaky, ambiguous, or expensive to debug and the likely causes involve selector quality, semantics gaps, deep-link entry problems, loading-state ambiguity, Compose/View interop, or animation timing issues.

## Non-goals

- Generic Android feature implementation guidance
- UI design or visual polish advice
- General performance tuning unrelated to readiness
- Replacing harness runtime, Espresso, or Compose test APIs

## Android-Specific Extension Map

### Deterministic entry on Android
- App Links / deep links
- intent-based navigation paths
- repeatable auth/onboarding entry paths
- resettable test data and session assumptions

### Stable locators on Android
- Compose `testTag`
- semantics labels / roles / state exposure
- stable `resource-id`
- `contentDescription` where appropriate
- clear ownership in hybrid trees

### Ready / busy / blocked state on Android
- explicit loading and error containers
- state-driven ready indicators
- modal / dialog / sheet blockers
- asynchronous work that can leave the screen visible but not yet actionable

### Transition stability on Android
- Compose animation containers
- list / recycler movement and content replacement
- sheet / pager / navigation transitions
- unsafe taps during transient layout changes

### Evidence hooks on Android
- semantics-tree debuggability
- hierarchy visibility for both Compose and Views
- meaningful failure hints that distinguish selector ambiguity from readiness ambiguity

### Remediation path on Android
- recommend app-side fixes first
- clarify whether the real gap is selector contract, screen-state visibility, entry/reset, or transition stability

## Shared Output Contract With Android Extensions

```yaml
status: ready | partial | blocked
platform: android
surface: compose | views | hybrid
summary:
gaps:
  critical: []
  important: []
  nice_to_have: []
contracts:
  entryPoints: []
  stableLocators: []
  readySignals: []
  busySignals: []
  resetSignals: []
  evidenceHooks: []
androidExtensions:
  composeTags: []
  semanticsNotes: []
  resourceIdNotes: []
  hybridOwnership: []
knownFlakyAreas: []
recommendedFixes: []
verificationChecklist: []
handoffNotes: []
```

## Review Structure

### 1. Entry and reset review
Ask:
- can the screen be entered deterministically?
- can the flow be reset without unknown local state?
- is onboarding or auth blocking reproducibility?

### 2. Locator contract review
Ask:
- are key actions addressable by durable hooks?
- is the selector contract split between Compose and Views?
- are visible labels being used where stronger hooks should exist?

### 3. State visibility review
Ask:
- can the harness distinguish loading, ready, error, empty, and blocked?
- are dialogs, sheets, or inline blockers exposed clearly?

### 4. Transition stability review
Ask:
- does the app expose a stable post-transition target?
- would animation timing make automation guess?

### 5. Evidence and remediation review
Ask:
- if the action fails, can the developer tell why?
- does the recommendation point to an app-side fix, not only a retry?

## Overlay Sections

### Compose overlay
- `testTag` presence and naming quality
- semantics clarity and role/state exposure
- Compose synchronization and idle expectations
- animation containers such as `AnimatedVisibility`, bottom sheets, pagers, and list transitions

### View-system overlay
- stable `resource-id`
- `contentDescription` usefulness vs misuse
- list/recycler identity and repeated-item ambiguity
- modal/loading overlay visibility

### Hybrid overlay
- ownership boundaries between Compose and Views
- target resolution ambiguity across mixed trees
- navigation and synchronization gaps that appear only in mixed surfaces

## Tool Integration Targets

- `get_screen_summary`
- `inspect_ui`
- `query_ui`
- `resolve_ui_target`
- `explain_last_failure`
- `rank_failure_candidates`
- `suggest_known_remediation`
- `perform_action_with_evidence`

## Pressure Scenarios For Future Skill Testing

1. Compose login form renders correctly but exposes no `testTag` on critical inputs.
2. View-based settings list uses repeated labels and ambiguous item identity.
3. Hybrid screen has a View toolbar and Compose body with mismatched accessibility quality.
4. App opens only through manual onboarding with no stable deep-link or reset path.
5. Bottom sheet animation produces flaky target resolution and the team blames the harness instead of the missing post-transition contract.

## Exit Criteria For This Android Draft

This refinement is good enough when:

1. it clearly extends the baseline without redefining shared terms,
2. Compose, Views, and hybrid surfaces all have explicit readiness overlays,
3. future pressure testing can focus on real Android failure scenarios rather than missing structure.
