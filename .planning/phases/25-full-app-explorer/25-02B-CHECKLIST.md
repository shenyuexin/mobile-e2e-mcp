# Phase 25 Plan 02B — Execution Checklist

## Objective

Extract the Explorer platform seam and iOS hook implementation without changing iOS behavior.

## Checklist

### Hook Contract

- [ ] Define `explorer-platform.ts` hook interface.
- [ ] Keep hook outputs narrow and explorer-oriented.
- [ ] Ensure shared core will not need raw iOS payload fields after extraction.

### iOS Extraction

- [ ] Create `explorer-platform-ios.ts`.
- [ ] Move iOS parsing/normalization behind the iOS hook.
- [ ] Move iOS title extraction behind the iOS hook.
- [ ] Move iOS back verification semantics behind the iOS hook.
- [ ] Move iOS actionability/selector fact generation behind the iOS hook where needed.

### Shared Rewire

- [ ] Rewire `snapshot.ts` to consume hook outputs.
- [ ] Rewire `backtrack.ts` to consume hook outputs.
- [ ] Rewire `element-prioritizer.ts` only where normalized facts replace raw platform checks.
- [ ] Keep `mcp-adapter.ts` thin.

### Verification

- [ ] Re-run all `25-02A` parity tests.
- [ ] Run `pnpm --filter @mobile-e2e-mcp/explorer test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.

## Exit Criteria

- [ ] iOS behavior is unchanged through the hook shell.
- [ ] Shared explorer files are thinner and no longer own iOS-specific parsing semantics directly.
- [ ] `25-02C` can integrate Android without designing the seam from Android-first assumptions.
