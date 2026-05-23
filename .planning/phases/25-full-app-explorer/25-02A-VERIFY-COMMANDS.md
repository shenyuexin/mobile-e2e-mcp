# Phase 25 Plan 02A — Verify Commands

## Required

```bash
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
```

## Recommended focused reruns

```bash
pnpm --filter @mobile-e2e-mcp/explorer test -- --testNamePattern="snapshot|backtrack|element-prioritizer"
```

## Verification notes

- All new iOS parity tests must pass.
- No new Android-specific failures should be introduced by baseline-lock work.
- If a test fails because payload shape is ambiguous, resolve that ambiguity before moving to 25-02B.
