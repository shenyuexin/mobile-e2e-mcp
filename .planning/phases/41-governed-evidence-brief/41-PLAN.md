# Phase 41 Plan: Governed Evidence Brief

## Goal

Turn the current governed-control evidence into a compact, validated consumption surface for developers, AI agents, and PR reviewers.

## Practicality Bet

The project's strongest current value is not a broad claim that it replaces mobile E2E frameworks. The practical wedge is that an AI agent can inspect a mobile screen, receive structured governance boundaries, and avoid state-changing actions under read-only policy.

## Work Items

1. Add a machine-readable evidence brief grounded in tracked vivo governed-control evidence.
2. Add a human-readable brief that answers the current use-case question directly.
3. Add an offline validator that checks the brief against the source evidence and comparison.
4. Wire the validator into `test:smoke`.
5. Update README/showcase/CI evidence entrypoints so the brief is discoverable.

## Out of Scope

- New MCP tool surface.
- New device execution path.
- Claims that Appium, Maestro, Detox, XCTest, or Espresso are replaced.
- iOS parity proof implementation.

## Verification

- `pnpm run validate:governed-evidence-brief`
- `pnpm run test:smoke`
- `pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck`
- `git diff --check`
