# Phase 06 Plan 04 iOS Skill Draft

## Skill Name

`ios-e2e-readiness`

## Baseline Inheritance

This draft **inherits the shared baseline vocabulary** from `mobile-e2e-readiness-baseline` and should be read as the iOS implementation layer for that contract.

It must not redefine:

- deterministic entry
- stable locators
- ready / busy / blocked state
- reset semantics
- transition stability
- evidence hooks
- remediation path

Instead, it answers what those ideas mean on iOS.

## Purpose

Help iOS teams make screens and flows deterministic, automatable, diagnosable, and recoverable for AI-driven mobile E2E by translating the shared readiness contract into iOS-specific app-side guidance.

## When to Use

Use when iOS automation is flaky, ambiguous, or expensive to debug and the likely causes involve accessibility identifier gaps, launch/reset ambiguity, hidden blocked states, interruption handling, SwiftUI/UIKit surface differences, or transition timing issues.

## Non-goals

- Generic iOS feature implementation guidance
- UI design or visual polish advice
- General performance tuning unrelated to readiness
- Replacing harness runtime, XCUITest, or iOS automation APIs

## iOS-Specific Extension Map

### Deterministic entry on iOS
- launch arguments and launch environment
- URL schemes / deterministic app entry paths
- repeatable auth/onboarding entry paths
- resettable simulator or app session assumptions

### Stable locators on iOS
- `accessibilityIdentifier`
- interaction / visibility accessibility semantics
- clear ownership in mixed SwiftUI/UIKit surfaces
- avoidance of brittle text-only selectors where stronger hooks should exist

### Ready / busy / blocked state on iOS
- explicit loading and error containers
- state-driven ready indicators
- modal / alert / sheet blockers
- interrupted or protected states that leave the screen visible but not actionable

### Transition stability on iOS
- navigation / sheet / modal transitions
- SwiftUI animation containers and async task timing
- UIKit present / dismiss timing
- unsafe taps during transient animation or stale screen states

### Evidence hooks on iOS
- hierarchy visibility for automation review
- accessibility debug visibility
- meaningful failure hints that distinguish locator ambiguity, interruption, and readiness ambiguity

### Remediation path on iOS
- recommend app-side fixes first
- clarify whether the real gap is locator contract, launch/reset behavior, interruption handling, or transition stability

## Shared Output Contract With iOS Extensions

```yaml
status: ready | partial | blocked
platform: ios
surface: swiftui | uikit | mixed
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
iosExtensions:
  accessibilityIdentifierNotes: []
  launchResetNotes: []
  interruptionNotes: []
  mixedSurfaceOwnership: []
knownFlakyAreas: []
recommendedFixes: []
verificationChecklist: []
handoffNotes: []
```

## Review Structure

### 1. Entry and reset review
Ask:
- can the screen be entered deterministically?
- can the flow be reset without unknown simulator or app state?
- is onboarding or auth blocking reproducibility?

### 2. Locator contract review
Ask:
- are key actions addressable by durable hooks?
- is the locator contract split between SwiftUI and UIKit?
- are visible labels being used where stronger identifiers should exist?

### 3. State visibility review
Ask:
- can the harness distinguish loading, ready, error, empty, blocked, and interrupted?
- are alerts, sheets, or consent blockers exposed clearly?

### 4. Transition stability review
Ask:
- does the app expose a stable post-transition target?
- would animation timing or stale screen state make automation guess?

### 5. Evidence and remediation review
Ask:
- if the action fails, can the developer tell why?
- does the recommendation point to an app-side fix, not only a retry?

## Overlay Sections

### SwiftUI overlay
- `accessibilityIdentifier` presence and placement
- state-driven visibility and async task timing
- SwiftUI-specific hidden/responds-to-user-interaction concerns
- navigation / sheet / alert / transition stability

### UIKit overlay
- stable accessibility identifiers on controls, cells, and navigation elements
- present / dismiss timing and stale VC state
- modal/loading overlay visibility

### Mixed overlay
- ownership boundaries between SwiftUI and UIKit
- target resolution ambiguity across mixed surfaces
- launch/reset and interruption gaps that appear only in mixed apps

## Tool Integration Targets

- `get_screen_summary`
- `inspect_ui`
- `query_ui`
- `resolve_ui_target`
- `explain_last_failure`
- `detect_interruption`
- `suggest_known_remediation`
- `perform_action_with_evidence`

## Pressure Scenarios For Future Skill Testing

1. SwiftUI screen renders correctly but exposes no `accessibilityIdentifier` on critical controls.
2. UIKit settings list uses repeated cell labels and ambiguous item identity.
3. Mixed app has UIKit navigation around SwiftUI content with unclear ownership of identifiers.
4. App enters only through manual onboarding with no stable launch/reset path.
5. Permission sheet or modal transition causes flaky target resolution and the team blames the harness instead of the missing post-transition contract.

## Exit Criteria For This iOS Draft

This refinement is good enough when:

1. it clearly extends the baseline without redefining shared terms,
2. SwiftUI, UIKit, and mixed surfaces all have explicit readiness overlays,
3. future pressure testing can focus on real iOS failure scenarios rather than missing structure.
