# Phase 06 Plan 02 Baseline Skill Draft

## Skill Name

`mobile-e2e-readiness-baseline`

## Purpose

Define the minimum shared contract an app team should satisfy before an AI-first mobile E2E harness can interact with the app deterministically, explain failures with evidence, and recommend app-side remediation.

This baseline is intentionally cross-platform. It should be inherited by Android, iOS, React Native, and Flutter follow-on skills rather than replaced by them.

## When to Use

Use when a team needs a platform-neutral readiness review before diving into Android-, iOS-, React Native-, or Flutter-specific E2E guidance, especially when automation failures suggest missing contracts around entry, locators, state visibility, reset behavior, or evidence hooks.

## Non-goals

- Platform implementation guidance such as `testTag`, `resource-id`, `accessibilityIdentifier`, or deep link syntax details.
- Generic mobile development advice unrelated to E2E readiness.
- A standalone remediation skill; the baseline defines remediation framing but does not replace platform-specific remediation guidance.

## Shared Readiness Vocabulary

### 1. Deterministic entry
The app can reach the relevant screen or flow through a repeatable path with no hidden local operator setup.

### 2. Stable locators
The target UI surface exposes durable automation hooks that survive localization, content variation, and layout changes better than raw visible text alone.

### 3. Ready/busy/blocked state
The app exposes enough state for automation to distinguish:

- loading
- ready
- empty
- error
- blocked / interrupted

### 4. Reset semantics
The app can return to a known-good state for repeated test execution without relying on unknown leftover session state.

### 5. Transition stability
The app defines or implies safe post-transition conditions so automation does not have to guess during animations or screen changes.

### 6. Evidence hooks
The harness can observe enough signals to explain why a step failed instead of only reporting that it failed.

### 7. Remediation path
The readiness review can point to app-side fixes rather than only suggesting harness retries or human intervention.

## Shared Output Contract

```yaml
status: ready | partial | blocked
summary:
surfaceScope: app | flow | screen | component
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
knownFlakyAreas: []
recommendedFixes: []
verificationChecklist: []
handoffNotes: []
```

## Minimum Review Questions

1. Can the flow be entered repeatably?
2. Can critical controls be located without depending on brittle text-only selectors?
3. Can the harness distinguish loading from ready from blocked?
4. Can the flow be reset without mystery state?
5. Is there a stable post-transition contract after navigation or animation?
6. If the flow fails, does the app expose enough evidence to explain why?
7. Can the review recommend a concrete app-side fix?

## What Belongs In Platform Skills Instead

### Android / Compose / Views
- `testTag`
- semantics tree specifics
- `resource-id`
- `contentDescription`
- App Links / intent mechanics
- Compose synchronization and hybrid tree issues

### iOS / SwiftUI / UIKit
- `accessibilityIdentifier`
- launch args/env specifics
- URL scheme details
- SwiftUI accessibility modifiers
- UIKit modal / transition timing specifics

## Inheritance Rule

All downstream platform skills should:

1. keep the baseline vocabulary intact,
2. extend the output contract instead of replacing it,
3. add platform-specific checks only where the shared baseline becomes too abstract.

## Suggested Follow-on Sequence

1. `mobile-e2e-readiness-baseline`
2. `android-e2e-readiness`
3. `ios-e2e-readiness`
4. `react-native-e2e-readiness`
5. `flutter-e2e-readiness`

## Pressure Scenarios For Future Skill Testing

1. A team has a flaky mobile flow but no one knows whether the root problem is entry, locator quality, or state visibility.
2. An automation failure report contains screenshots and logs, but the team has no shared language for deciding whether the app is blocked or simply loading.
3. A team wants platform-specific help immediately, but the real issue is missing cross-platform readiness concepts.
4. A developer asks for selector fixes, but the app lacks any reset semantics and therefore remains non-reproducible.

## Exit Criteria For This Baseline

This baseline is good enough when:

1. Android and iOS follow-on skills can reuse its vocabulary without redefining terms.
2. Review output can be grouped by the shared contract headings above.
3. The baseline stays small and does not absorb platform detail.
