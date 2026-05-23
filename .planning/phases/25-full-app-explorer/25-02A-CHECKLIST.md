# Phase 25 Plan 02A — Execution Checklist

## Objective

Lock `7804ac5d` as the iOS Explorer baseline before any hook extraction.

## Checklist

### Baseline Inventory

- [ ] Identify which iOS explorer behaviors from `7804ac5d` are baseline-defining.
- [ ] Record which current tests already cover those behaviors.
- [ ] Record which behaviors still need explicit fixtures.

### Fixture Coverage

- [ ] Add direct-tree iOS inspect payload fixture(s).
- [ ] Add wrapped-result iOS inspect payload fixture(s).
- [ ] Verify both fixture shapes resolve to the same explorer semantics.

### Behavior Gates

- [ ] Add title extraction parity assertions.
- [ ] Add actionable-element classification parity assertions.
- [ ] Add backtrack verification parity assertions.
- [ ] Add at least one guard that fails if shared parser changes alter iOS semantics.

### Verification

- [ ] Run `pnpm --filter @mobile-e2e-mcp/explorer test`.
- [ ] Run `pnpm typecheck`.
- [ ] Confirm no Android-specific assumptions were added while writing iOS parity tests.

## Exit Criteria

- [ ] iOS baseline behavior is now explicit and testable.
- [ ] `25-02B` can proceed without guessing what “preserve iOS behavior” means.
