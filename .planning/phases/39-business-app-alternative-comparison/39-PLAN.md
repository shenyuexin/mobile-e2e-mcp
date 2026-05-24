# Phase 39 Plan: Business App Alternative Comparison

## Goal

Make the business-app proof easier to evaluate by comparing the governed harness against an ad-hoc adb wrapper and a scripted Maestro-style flow.

## Scope

- Add a compact comparison artifact grounded in Phase 38 vivo evidence.
- Keep the claim narrow: AI-facing policy/session/evidence/remediation value, not replacement of established flow runners.
- Add an offline validator so the comparison remains tied to tracked evidence.
- Wire the validator into smoke.

## Out of Scope

- Running Appium or Maestro.
- Claiming the governed harness is a better general-purpose flow runner.
- Adding new MCP tools or changing runtime contracts.

## Success Criteria

- `comparison.json` and `comparison.md` exist beside the Phase 38 evidence.
- `pnpm run validate:governed-business-app-comparison` passes.
- `pnpm run test:smoke` includes the comparison validator.
