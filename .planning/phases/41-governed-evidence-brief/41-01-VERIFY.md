# Phase 41 Verification

## Commands

```bash
pnpm run validate:governed-evidence-brief
pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck
git diff --check
pnpm run test:smoke
```

## Expected Result

All commands pass. `test:smoke` includes the evidence brief validator, so drift in the brief, source evidence, or comparison boundary fails the smoke gate.
