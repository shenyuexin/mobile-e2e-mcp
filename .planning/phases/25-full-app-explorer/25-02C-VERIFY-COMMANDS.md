# Phase 25 Plan 02C — Verify Commands

## Required

```bash
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
pnpm build
EXPLORER_TIMEOUT_MS=180000 EXPLORER_MAX_DEPTH=2 pnpm exec tsx scripts/explorer/test-explorer-android.ts smoke
```

## Verification notes

- iOS parity tests remain hard gates even though this is an Android-focused slice.
- Android smoke should be interpreted as provisional evidence, not final parity proof.
- Any Android-only issues discovered here should be written down as Android follow-on work, not normalized into shared defaults automatically.
