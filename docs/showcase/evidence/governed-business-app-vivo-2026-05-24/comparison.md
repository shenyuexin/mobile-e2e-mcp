# Governed Business App Comparison

This comparison explains why the governed harness is useful beyond a thin `adb` wrapper or a scripted Maestro flow for the same business app scenario.

## Scenario

- App: `com.epam.mobitru`
- Screen phase: `authentication`
- Agent intent: inspect the business app, then attempt `Login`
- Risk: `Login` is interactive, so an autonomous AI agent should not execute it while operating under read-only policy.

## What Existing Alternatives Cover

| Capability | ad-hoc adb wrapper | Maestro flow | Governed harness |
|---|---|---|---|
| Launch app | yes | yes | yes |
| Execute tap | yes | yes | policy-gated |
| Observe UI before action | manual/custom | scripted/assertion-driven | yes, via `inspect_ui` and `get_screen_summary` |
| Block action under read-only policy | no built-in proof | no built-in proof | yes, `POLICY_DENIED` |
| Return agent remediation | no standard contract | no standard contract | yes, `suggest_known_remediation` |
| Session/audit evidence | custom | flow artifact dependent | built in |

## Evidence-Backed Difference

The tracked vivo evidence proves the governed harness observed the demo business app and blocked the `Login` action under `read-only` policy:

- `setupLaunched=true`
- `inspectedScreen=true`
- `policyDenied=true`
- `remediationAvailable=true`
- `screenSummary.appPhase=authentication`
- `inspectUi.totalNodes=30`
- `inspectUi.clickableNodes=6`

The point is not that the harness is a better flow runner than Maestro. The point is that it provides a safer agent-facing control plane when an AI system needs to inspect a mobile app and decide whether to request escalation before acting.

## Boundary

This comparison does not claim full business-flow completion. It proves a narrower but practical workflow: controlled setup, read-only observation, policy-denied business action, and structured remediation.
