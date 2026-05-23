# Phase 35 Wedge Scorecard

Date: 2026-05-23
Inputs:
- `.planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md`
- `.planning/phases/34-alternative-kill-test/34-01-SUMMARY.md`

## Scoring Scale

- 5 = strong
- 3 = plausible but unproven
- 1 = weak or easily substituted

## Scorecard

| Wedge | Concrete user | Pain intensity | Alternative weakness | Differentiation | 7-day proof feasibility | 30-day productization feasibility | Dismissal risk | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| AI-safe mobile device control via MCP | 5 | 4 | 4 | 5 | 4 | 4 | 3 | 29 |
| Explorer for mobile app coverage discovery | 4 | 3 | 3 | 4 | 4 | 3 | 3 | 24 |
| Failure intelligence layer for mobile E2E | 4 | 3 | 2 | 3 | 4 | 3 | 2 | 21 |

Note: `Dismissal risk` is scored positively when risk is lower. A score of 3 means meaningful risk remains.

## Primary Wedge Decision

Selected wedge: **AI-safe mobile device control via MCP**

Why:

- It best matches what is structurally unusual about this repo: MCP contracts, policy profiles, session leases, evidence timelines, recovery semantics, and support-boundary reporting.
- It avoids direct competition with Maestro/Appium/Detox/XCTest/Espresso as primary test runners.
- It explains why a custom adb/Appium wrapper eventually becomes inadequate: once an agent is allowed to operate a device, governance and auditability become product requirements, not niceties.
- Explorer and failure intelligence strengthen this wedge as proof/differentiation layers.

## Supporting Capabilities

### Explorer coverage discovery

Role: secondary wedge candidate and demo/proof layer.

Use it to show that the harness can do more than execute commands: it can produce state graph, coverage, failure review, rule decisions, and machine-readable artifacts.

Do not make it primary until it has a realistic-app proof beyond Settings traversal.

### Failure intelligence

Role: supporting layer.

Use it to make agent-safe control credible: after the agent acts, the harness must explain what happened and what to do next.

Do not make it primary until there is external evidence that teams need this as a standalone layer more than they need existing runner artifacts.

## Non-Wedges

- Generic mobile E2E runner replacement.
- Broad Android/iOS/RN/Flutter parity pitch.
- 66-tool catalog as the product story.
- Enterprise governance/compliance platform.
- Cloud/device-farm scale-out.

## 7-Day Proof Plan

Goal: prove that an AI agent can operate a mobile target through a governed MCP harness and leave reviewable evidence that raw adb/Appium/Maestro wrappers do not naturally produce.

Day 1:
- Define the governed-agent scenario.
- Pick one mobile target path: Android demo app or Android Settings if demo app setup is unstable.
- Define policy boundary: allowed read/action tools, denied unsafe action, evidence expectations.

Day 2:
- Write the agent task script or transcript prompt.
- Include one safe action and one policy-sensitive/ambiguous action.
- Define expected structured outputs.

Day 3:
- Run or simulate the baseline "custom wrapper" alternative.
- Capture what it gives: command logs, screenshots, errors.

Day 4:
- Run the harness path.
- Capture session ID, policy decision, action result envelope, evidence artifacts, and any remediation output.

Day 5:
- Compare baseline vs harness.
- Focus on auditability, bounded control, support-boundary clarity, and evidence quality.

Day 6:
- Package the proof as a planning/showcase artifact.
- Include exact commands, transcript, outputs, and caveats.

Day 7:
- Decide whether README positioning should change.
- If proof is strong, propose docs wording that leads with "AI-safe mobile device control" instead of broad platform language.

## 30-Day Productization Path

Week 1:
- Complete the 7-day proof and identify missing tool/report fields.

Week 2:
- Harden the golden path for governed agent execution:
  - `doctor`
  - `describe_capabilities`
  - `start_session`
  - governed action
  - evidence review
  - remediation/recovery
  - `end_session`

Week 3:
- Add a side-by-side proof against a custom wrapper or Maestro/Appium baseline.
- Keep Explorer as an optional proof extension, not a prerequisite.

Week 4:
- Update positioning docs only if proof supports it.
- Define the next implementation phase around the smallest missing product gap, not around broad tool expansion.

## Immediate Next Phase Candidate

Phase 36 candidate:

**Governed Agent Mobile Control Proof**

Goal: produce the 7-day proof artifact for the selected wedge.

Success condition:

- A reviewer can see why raw adb/Appium/Maestro access is insufficient for autonomous or semi-autonomous AI agents.
