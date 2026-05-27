# Phase 47 Verify: Realistic Mobile Evidence Breadth

## Acceptance Evidence

- `pnpm run validate:mobile-change-verification` validates the scenario index.
- `pnpm run test:mobile-change-verification` verifies the scenario index requires at least two scenarios and at least one failure packet for the positive verdict.

## Boundary Decision

This phase proves app-oriented evidence breadth at fixture-contract level. It does not claim cloud farm support, iOS parity, or full React Native/Flutter maturity.

## Pass Criteria

- Scenario index schema is `realistic-mobile-evidence-breadth/v1`.
- Scenario count is at least two.
- Failure packet count is at least one.
- Markdown and JSON both disclose fixture/dry-run boundaries.
