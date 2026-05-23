# Phase 25 Plan 02C — Execution Checklist

## Objective

Integrate Android through the new Explorer platform seam while keeping Android explicitly provisional.

## Checklist

### Android Hook Integration

- [ ] Create `explorer-platform-android.ts`.
- [ ] Route Android XML parsing through the Android hook.
- [ ] Route Android title extraction through the Android hook.
- [ ] Route Android actionable-container semantics through the Android hook.
- [ ] Route Android back evidence/verification through the Android hook.

### Provisional Boundary

- [ ] Keep Android-specific waits/workarounds local to the Android hook path.
- [ ] Do not promote Android heuristics into shared defaults.
- [ ] Keep support language/progress explicitly provisional in this slice.

### Verification

- [ ] Keep all iOS parity tests green.
- [ ] Run `pnpm --filter @mobile-e2e-mcp/explorer test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `EXPLORER_TIMEOUT_MS=180000 EXPLORER_MAX_DEPTH=2 pnpm exec tsx scripts/explorer/test-explorer-android.ts smoke`.

### Follow-on Capture

- [ ] Record Android-only remaining gaps instead of hiding them in shared code.
- [ ] Record any Android heuristics that still require future stabilization or design review.

## Exit Criteria

- [ ] Android uses the hook path instead of forcing shared parser/semantic edits.
- [ ] iOS remains the authoritative baseline for shared behavior.
- [ ] Android iteration can continue locally without cross-platform regression pressure leaking into shared core.
