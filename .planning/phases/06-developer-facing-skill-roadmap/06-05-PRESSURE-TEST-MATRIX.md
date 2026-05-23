# Phase 06 Plan 05 Pressure-Test Matrix

## Purpose

This matrix defines how to pressure-test the three draft readiness skills before any real skill files are created:

- `mobile-e2e-readiness-baseline`
- `android-e2e-readiness`
- `ios-e2e-readiness`

The matrix follows a TDD-for-skills structure:

- **RED**: observe failure or weak behavior without the real skill
- **GREEN**: observe improvement when the draft guidance is applied
- **REFACTOR**: capture loopholes and tighten the draft before publication

## Test Lanes

### Lane A — Baseline skill

#### RED scenarios
1. Team has a flaky mobile flow but no shared vocabulary for entry, locator quality, or state visibility.
2. Failure evidence exists, but the diagnosis collapses into vague “retry harder” advice.
3. A request asks for platform-specific fixes when the real gap is a missing shared readiness contract.

#### GREEN expectation
- The draft baseline skill introduces the shared vocabulary and separates entry, locators, ready/busy state, reset semantics, evidence hooks, and remediation path.

#### REFACTOR questions
- Does the baseline stay platform-neutral?
- Does it avoid accidental Android/iOS implementation detail?
- Is the invocation trigger clear enough to use before platform-specific skills?

### Lane B — Android skill

#### RED scenarios
1. Compose screen has visible text but no `testTag` or strong semantics.
2. View-based list uses repeated labels and ambiguous item identity.
3. Hybrid screen mixes toolbar and body ownership across Views and Compose.
4. Deep-link/reset path is missing, so the harness can reach the flow only manually.
5. Transition timing causes flaky target resolution and the team blames the harness.

#### GREEN expectation
- The Android draft correctly maps the issue to selector contract, deep-link/reset, state visibility, or transition stability and recommends app-side remediation.

#### REFACTOR questions
- Does the draft over-index on Compose?
- Does it keep View-system and hybrid apps honestly in scope?
- Are recommendations still readiness-focused rather than generic Android coding advice?

### Lane C — iOS skill

#### RED scenarios
1. SwiftUI screen has no `accessibilityIdentifier` on critical controls.
2. UIKit list uses repeated labels and ambiguous cell identity.
3. Mixed SwiftUI/UIKit screen has unclear ownership of identifiers.
4. Launch/reset path depends on manual onboarding or simulator residue.
5. Permission/modal transition causes flaky target resolution and the team blames the harness.

#### GREEN expectation
- The iOS draft correctly maps the issue to locator contract, launch/reset, interruption handling, or transition stability and recommends app-side remediation.

#### REFACTOR questions
- Does the draft over-index on SwiftUI?
- Does it keep UIKit and mixed apps honestly in scope?
- Are recommendations still readiness-focused rather than generic iOS coding advice?

## Pressure Dimensions

Apply these pressures to at least one scenario in each lane:

1. **Time pressure** — ask for a fast answer that tempts shallow advice.
2. **Authority pressure** — simulate a user insisting the harness should just retry harder.
3. **Ambiguity pressure** — give incomplete context and see whether the draft still routes the diagnosis correctly.
4. **Sunk-cost pressure** — simulate a team that already built brittle automation and wants justification, not change.
5. **Fatigue/batching pressure** — ask for multiple platform answers at once and see whether boundaries blur.

## Scoring Rubric

For each run, score:

- **Invocation fit**: did the draft skill obviously apply?
- **Problem framing**: did it identify the right readiness layer?
- **App-side remediation quality**: did it recommend a concrete fix?
- **Boundary discipline**: did it avoid turning into generic coding advice?
- **Loophole exposure**: did it reveal unclear wording or missing guardrails?

Use:

- `pass`
- `partial`
- `fail`

## Minimum Publication Threshold

No draft skill should be promoted to a real skill file until:

1. At least one meaningful RED failure is observed without the final skill guidance.
2. The draft guidance produces a GREEN improvement on the same scenario.
3. Major loopholes are captured and closed.
4. Invocation triggers remain clear under pressure.
