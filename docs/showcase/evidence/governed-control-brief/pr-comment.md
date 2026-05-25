## Governed mobile control evidence

Verdict: `practical_for_agent_governed_observation_and_action_mediation`

Positioning: AI-safe mobile device control via MCP

Evidence:
- `live_governed_control_observed`
- `business_app_governed_workflow_observed`
- `harness_shows_distinct_agent_safety_value`
- `policy_escalation_retry_dry_run_observed`

Validation commands:
- `pnpm run quickstart:governed-control`
- `pnpm run validate:governed-control-evidence`
- `pnpm run validate:governed-business-app-evidence`
- `pnpm run validate:governed-business-app-comparison`
- `pnpm run validate:governed-policy-escalation-evidence`
- `pnpm run validate:governed-evidence-brief`
- `pnpm run validate:governed-pr-evidence-summary`

Boundaries:
- does not replace Appium, Maestro, Detox, XCTest, or Espresso as mature flow runners
- does not prove full business-flow completion from login through transaction
- does not prove equal Android and iOS real-device parity for every tool

Next proof gaps:
- live policy escalation after denial
- automated PR comment publishing
- iOS parity for governed-control proof

Source: `docs/showcase/evidence/governed-control-brief/brief.json`
