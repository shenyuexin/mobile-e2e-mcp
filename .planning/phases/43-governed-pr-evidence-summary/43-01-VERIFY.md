# Phase 43 Verification

## Commands

```bash
pnpm run validate:governed-pr-evidence-summary
pnpm run validate:governed-evidence-brief
pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck
git diff --check
pnpm run test:smoke
```

## Expected Result

All commands pass. `validate:governed-pr-evidence-summary` first checks that `pr-comment.md` and `pr-comment.json` are generated from the evidence brief, then validates the summary semantics.
