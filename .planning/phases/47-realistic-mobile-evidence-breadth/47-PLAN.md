# Phase 47 Plan: Realistic Mobile Evidence Breadth

## Goal

Prove the workflow on more realistic mobile developer scenarios so the project is credible as a practical tool, not only a governance demo.

## Practicality Bet

The current evidence is strongest for governed control and policy escalation. To convince mobile developers, the next proof must touch app-like failure modes: login/readiness, network policy, permission or interruption, and at least one framework-shaped surface such as React Native or Flutter.

## Work Items

1. Select two or three bounded scenarios that represent common developer pain: launch/readiness regression, login or form failure, network policy failure, permission/interruption, or WebView/hybrid blind spot.
2. Run the Phase 45 workflow against the chosen scenarios and capture success and failure bundles.
3. Run the Phase 46 failure packet path for at least one intentional failure.
4. Document what is proven, what remains unsupported, and how the result compares with a simple Maestro/Appium-only path.
5. Update README/showcase evidence links only after the evidence is generated and validated.

## Boundary

This is evidence breadth, not broad platform parity. Do not claim cloud farms, full iOS parity, or all framework overlays unless the phase actually produces those runs.

## Verification

- Evidence validation commands for each generated bundle
- At least one real-device or simulator run when available, with dry-run fallback clearly labeled
- Existing governed evidence validators where applicable
- `git diff --check`

## Success Criteria

- The project has at least two realistic app-oriented evidence bundles beyond system settings governance.
- At least one failure bundle demonstrates actionable debugging value over raw automation logs.
- Public positioning can safely say the project supports AI-agent mobile verification workflows within explicit boundaries.
