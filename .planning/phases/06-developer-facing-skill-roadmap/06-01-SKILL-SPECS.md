# Phase 06 Plan 01 Skill Drafts

## Purpose

This document turns the Phase 06 roadmap into concrete draft skill specifications for the first two platform-level developer-facing skills:

- `android-e2e-readiness`
- `ios-e2e-readiness`

These are planning-stage skill specs, not final published skills. They exist so future sessions can refine wording, add pressure-scenario tests, and decide whether any framework-specific overlays should be promoted to standalone skills.

## Naming Decision

### Decision

Use **platform-level skill names** as the primary developer-facing anchors:

- `android-e2e-readiness`
- `ios-e2e-readiness`

Treat framework-specific guidance as subordinate overlays or sections:

- Android overlays: Compose, View system, hybrid Compose+View
- iOS overlays: SwiftUI, UIKit, mixed SwiftUI+UIKit

### Why

1. The harness's public boundary is platform adapters first and framework profiles second.
2. External references consistently separate runtime/device automation concerns from framework-code semantics.
3. Platform-level names keep non-Compose and non-SwiftUI users in scope.
4. Framework-level names are still available later if the final readiness checklists materially diverge.

## Shared Readiness Contract

Every readiness skill should help a developer answer the same core questions:

1. **Deterministic entry** — can the app or screen be opened in a repeatable way?
2. **Stable locators** — are there durable identifiers, semantics, or accessibility hooks?
3. **Ready/busy state** — can automation tell whether the UI is loading, ready, blocked, or failed?
4. **Reset semantics** — can the test flow restore a known-good state without hidden local setup?
5. **Animation/transition stability** — can automation avoid interacting during unstable transitions?
6. **Evidence hooks** — if a step fails, can the harness produce enough evidence to explain why?
7. **Remediation path** — does the skill tell the developer what to change in the app, not just what broke in automation?

## External Reference Anchors

### Android

- Android Compose testing APIs
- Android Compose synchronization guidance
- Android Compose accessibility guidance
- Android Compose test debugging guidance
- Android deep-link / App Links guidance
- `callstackincubator/agent-device`
- `Meet-Miyani/compose-skill`
- `Drjacky/claude-android-ninja`
- `devtrongle/android-agent-skills`

### iOS

- Apple WWDC25 UI automation guidance
- Apple accessibility identifier and SwiftUI accessibility modifier docs
- `dadederk/iOS-Accessibility-Agent-Skill`
- `PasqualeVittoriosi/swift-accessibility-skill`
- `haowu77/ios-idb-skill`
- `twostraws/SwiftUI-Agent-Skill`

## Draft Skill: `android-e2e-readiness`

### Role

Help Android app teams make screens and flows more deterministic, automatable, diagnosable, and recoverable for AI-driven mobile E2E.

### When to Use

Use when Android UI automation is flaky, ambiguous, or expensive to debug, especially when failures involve missing tags, unstable semantics, loading-state ambiguity, deep-link gaps, hybrid View/Compose trees, or animation timing problems.

### Non-goals

- General Android feature implementation
- Generic UI design advice
- Broad architecture review unrelated to E2E readiness
- Replacing Espresso / Compose test APIs or harness runtime behavior

### Primary Inputs

- Screen or flow description
- Relevant app code snippets or file paths
- Harness failure evidence (`reasonCode`, `artifacts`, screen summary, logs)
- Framework context:
  - Compose-only
  - View system only
  - hybrid Compose + View

### Primary Outputs

- **Readiness assessment**: pass / partial / blocked
- **Gap list** grouped by severity
- **Recommended app-side fixes** with rationale
- **Deterministic locator suggestions**
- **Entry/reset suggestions**
- **Busy/ready-state suggestions**
- **Animation and transition stability guidance**
- **Follow-up verification checklist**

### Output Shape

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
knownFlakyAreas: []
recommendedFixes: []
verificationChecklist: []
```

### Capability Areas

#### 1. Deterministic entry
- Verify deep links / App Links / intent entry paths
- Check whether the app can be moved to the target screen without hidden preconditions
- Require clear reset semantics for test data, auth, and app state

#### 2. Stable locators
- Compose: `testTag`, semantics, meaningful roles/labels/state
- View system: stable resource IDs, content descriptions, accessibility metadata
- Hybrid: document which tree owns which interaction contract

#### 3. Ready/busy state
- Require explicit ready/loading/error/empty/blocked signals
- Prefer durable state signals over text-only heuristics
- Flag flows where automation would need to guess during async transitions

#### 4. Animation and transition stability
- Flag animated containers without a stable post-transition target contract
- Recommend waiting on state change, not elapsed time
- Encourage reduced-motion-friendly or explicit idle-state hooks where necessary

#### 5. Accessibility as automation substrate
- Check whether semantics help both users and automation
- Flag hidden or ambiguous nodes that break deterministic targeting
- Avoid encouraging automation contracts that fight accessibility

#### 6. Debuggability and remediation
- Recommend semantics-tree inspection paths
- Explain whether failures come from selector quality, screen-state ambiguity, navigation gaps, or unstable transitions
- Produce app-side remediation, not only harness-level retry suggestions

### Overlay Sections

#### Compose overlay
- `testTag` quality and naming consistency
- semantics tree clarity
- Compose idle / synchronization caveats
- animation containers (`AnimatedVisibility`, list transitions, pager/sheet motion)

#### View-system overlay
- stable `resource-id` and content-desc quality
- Recycler/list item identity
- loading overlays and modal blockers

#### Hybrid overlay
- where Compose and View trees meet
- selector ownership ambiguity
- mixed synchronization and navigation concerns

### Tool Integration Targets

- `get_screen_summary`
- `inspect_ui`
- `query_ui`
- `explain_last_failure`
- `rank_failure_candidates`
- `suggest_known_remediation`
- `perform_action_with_evidence`

### Pressure Scenarios For Future Skill Testing

1. Compose login screen has visible text but no `testTag` on inputs.
2. Hybrid screen uses a View toolbar and Compose body with inconsistent accessibility metadata.
3. Flow only works after a manual onboarding path; no deep link or reset path exists.
4. Animated sheet causes taps during transition and flaky target resolution.
5. Failure evidence suggests selector ambiguity but the developer assumes the harness should just retry harder.

## Draft Skill: `ios-e2e-readiness`

### Role

Help iOS app teams make screens and flows more deterministic, automatable, diagnosable, and recoverable for AI-driven mobile E2E across SwiftUI, UIKit, and mixed app surfaces.

### When to Use

Use when iOS UI automation is flaky, ambiguous, or expensive to debug, especially when failures involve missing accessibility identifiers, unstable launch/reset behavior, hidden loading/blocked states, SwiftUI/UIKit transition timing, or interruption-heavy flows.

### Non-goals

- General iOS feature implementation
- Generic UI design advice
- Broad architecture review unrelated to E2E readiness
- Replacing XCUITest or harness runtime behavior

### Primary Inputs

- Screen or flow description
- Relevant app code snippets or file paths
- Harness failure evidence (`reasonCode`, `artifacts`, screen summary, logs)
- Framework context:
  - SwiftUI
  - UIKit
  - mixed SwiftUI + UIKit

### Primary Outputs

- **Readiness assessment**: pass / partial / blocked
- **Gap list** grouped by severity
- **Recommended app-side fixes** with rationale
- **Identifier / accessibility contract suggestions**
- **Launch/reset suggestions**
- **Loading/interruption guidance**
- **Transition-stability guidance**
- **Follow-up verification checklist**

### Output Shape

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
interruptions: []
knownFlakyAreas: []
recommendedFixes: []
verificationChecklist: []
```

### Capability Areas

#### 1. Deterministic entry
- Verify launch arguments, launch environment, URL schemes, and reusable navigation entry paths
- Check whether the app can be restored to a known state without hidden simulator or account setup
- Require testable reset semantics for auth, onboarding, and permissions when possible

#### 2. Stable locators
- SwiftUI: `accessibilityIdentifier`, interaction/visibility modifiers, meaningful grouping
- UIKit: stable accessibility identifiers and interaction properties
- Mixed: explicit ownership of identifiers across view-controller and SwiftUI boundaries

#### 3. Ready/busy/interrupted state
- Require explicit loading/error/empty/ready/blocked states
- Make interruptions first-class: permissions, modal consent, protected steps, stale session gates
- Prefer stable state markers over localized text strings

#### 4. Transition stability
- Flag taps or assertions that depend on transient navigation/animation states
- Prefer state-based waiting over timing heuristics
- Encourage test-plan and transition-safe postconditions

#### 5. Accessibility as automation substrate
- Use accessibility identifiers as automation hooks rather than VoiceOver text
- Review hidden/responds-to-user-interaction modifiers for automation visibility issues
- Keep accessibility and automation aligned instead of competing

#### 6. Debuggability and remediation
- Explain whether failures come from locator quality, launch/reset ambiguity, transition instability, or interruption handling gaps
- Produce app-side remediation suggestions with minimal harness blame-shifting

### Overlay Sections

#### SwiftUI overlay
- identifier placement on compositional views
- `NavigationStack`, sheet, alert, and async task visibility
- hidden/responds-to-user-interaction modifiers that affect automation

#### UIKit overlay
- VC lifecycle visibility
- accessibility identifier discipline on controls and cells
- modal/present/dismiss timing risks

#### Mixed overlay
- SwiftUI hosted inside UIKit or UIKit embedded around SwiftUI content
- ownership of identifiers and launch/reset contracts

### Tool Integration Targets

- `get_screen_summary`
- `inspect_ui`
- `query_ui`
- `explain_last_failure`
- `detect_interruption`
- `suggest_known_remediation`
- `perform_action_with_evidence`

### Pressure Scenarios For Future Skill Testing

1. SwiftUI screen uses labels only, with no `accessibilityIdentifier` on key controls.
2. UIKit settings screen uses repeated cells with ambiguous identifiers.
3. Launch path depends on leftover simulator state instead of launch args or deep links.
4. Permission modal or consent interruption appears mid-flow with no recovery hint.
5. Navigation transition or sheet animation causes target resolution to race the UI.

## Follow-on Skill Candidates

These should remain follow-ons until the platform-level skills prove too broad:

- `failure-to-remediation-advisor`
- `mobile-e2e-readiness-baseline`
- `react-native-e2e-readiness`
- `flutter-e2e-readiness`
- `compose-e2e-readiness` (only if Compose-specific checklist divergence becomes large)
- `swiftui-e2e-readiness` (only if SwiftUI-specific checklist divergence becomes large)

## Criteria For Promoting A Framework Overlay To A Standalone Skill

Promote only if most of the following become true:

1. The readiness checklist materially diverges from the platform baseline.
2. Failures and remediation steps are framework-specific, not just examples.
3. The draft skill would otherwise spend most of its content inside one framework overlay.
4. Discoverability evidence shows developers search for the framework-specific term more naturally than the platform term.

## Next Refinement Questions

1. Should the first implementation target be `mobile-e2e-readiness-baseline` or `android-e2e-readiness`?
2. Should failure-to-remediation remain a separate skill or be embedded inside each platform skill?
3. For Android, is hybrid View+Compose guidance important enough for a distinct section in the first release?
4. For iOS, should UIKit and SwiftUI be equally weighted in v1, or should SwiftUI lead with explicit UIKit coverage notes?
