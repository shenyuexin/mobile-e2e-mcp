# Phase 25 Plan 02B — Verify Commands

## Required

```bash
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
pnpm build
```

## Verification notes

- All 25-02A parity tests are hard gates.
- If any iOS parity test changes due to extraction, stop and revise the hook contract before continuing.
- Build/typecheck are required here because cross-file API movement is part of the slice.
