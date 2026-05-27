# Phase 46 Verify: Actionable Failure Packet

## Acceptance Evidence

- `pnpm run test:mobile-change-verification` validates category selection and failure packet rendering.
- `pnpm run validate:mobile-change-verification` validates the committed failure packet fixture.

## Boundary Decision

The failure packet classifies observed evidence and recommends bounded next actions. It does not autonomously modify app code or call an LLM for remediation.

## Pass Criteria

- Failure packet schema is `mobile-verification-failure-packet/v1`.
- Network policy failure maps to `category = network` and `nextAction.kind = inspect_network_policy`.
- Markdown contains category, confidence, failed step, evidence, policy guidance, next action, and boundaries.
