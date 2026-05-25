# Governed Control Evidence Brief

This brief is the compact, reviewable answer to: "Does this project have a practical use case today?"

## Verdict

`mobile-e2e-mcp` is practical today for a narrow but real workflow: **AI-safe mobile device control via MCP**. Its current evidence supports governed observation and action mediation for an AI agent, especially when a read-only policy must prevent state-changing device actions.

It should not be positioned as a replacement for Appium, Maestro, Detox, XCTest, or Espresso. The proven wedge is not "better mobile tapping." The wedge is policy, session, evidence, and remediation around agent-driven mobile control.

## Evidence Cards

| Evidence | Source | What it proves |
|---|---|---|
| Live Settings governed control | `docs/showcase/evidence/governed-control-vivo-2026-05-23/summary.json` | A vivo Android device was inspected live, then an interactive action was denied with `POLICY_DENIED` under read-only policy. |
| Business app read-only workflow | `docs/showcase/evidence/governed-business-app-vivo-2026-05-24/summary.json` | A setup session launched `com.epam.mobitru`, then a read-only session inspected the authentication screen and blocked `Login`. |
| Alternative comparison | `docs/showcase/evidence/governed-business-app-vivo-2026-05-24/comparison.json` | The distinct value over adb/Maestro-style automation is governance context, not raw execution maturity. |

## Grounded Signals

- Settings proof: `verdict=live_governed_control_observed`, `inspectUi.totalNodes=93`, `inspectUi.clickableNodes=53`, `policyDeniedStep.reasonCode=POLICY_DENIED`.
- Business app proof: `verdict=business_app_governed_workflow_observed`, `screenSummary.appPhase=authentication`, `inspectUi.totalNodes=30`, `inspectUi.clickableNodes=6`, `policyDeniedStep.attemptedText=Login`.
- Comparison proof: `verdict=harness_shows_distinct_agent_safety_value` with explicit boundaries against claiming Maestro/Appium replacement.

## Use Case That Exists Now

A developer or AI coding agent wants to inspect a real mobile app screen, understand what is on it, and avoid accidental state-changing actions unless policy allows them. A thin `adb` wrapper or scripted flow can launch and tap, but it does not naturally provide policy-bound denial, session-scoped audit context, or structured remediation for an autonomous agent.

## What To Run

```bash
pnpm run quickstart:governed-control
pnpm run validate:governed-control-evidence
pnpm run validate:governed-business-app-evidence
pnpm run validate:governed-business-app-comparison
pnpm run validate:governed-evidence-brief
```

For live Android proof readiness:

```bash
pnpm run proof:governed-agent-mobile-control:preflight
pnpm run proof:governed-business-app-workflow
```

## Remaining Proof Gaps

1. Policy escalation after denial: show deny under read-only, approve through an explicit profile, retry, and preserve both outcomes.
2. PR/comment consumption surface: generate a compact review summary that an AI agent can attach to a PR.
3. iOS parity: prove the same governed-control semantics on iOS simulator or device.

## Practicality Boundary

Continue the project, but keep narrowing the public promise. The strongest current story is "a governed control plane for AI agents operating mobile devices," not "a universal E2E runner."
