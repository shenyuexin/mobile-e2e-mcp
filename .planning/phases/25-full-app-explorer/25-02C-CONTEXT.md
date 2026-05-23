# Phase 25 Plan 02C — Context

## Why this slice exists

Android still needs continued smoke/debug iteration, but it should now happen through the new platform seam instead of by editing shared explorer semantics.

This slice is deliberately **provisional**:

- Android should become hook-local,
- not yet authoritative,
- not yet equivalent to the iOS baseline lane.

## What this slice should accomplish

- add `explorer-platform-android.ts`,
- route Android XML parsing through that hook,
- route Android actionable container logic through that hook,
- keep Android-specific workarounds local,
- preserve all iOS parity gates from previous slices.

## Files most likely involved

- `packages/explorer/src/explorer-platform-android.ts`
- `packages/explorer/src/explorer-platform.ts`
- `packages/explorer/src/ui-tree-parser.ts`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `scripts/explorer/test-explorer-android.ts`

## What not to do in this slice

- Do not present Android as stable/equivalent yet.
- Do not push Android heuristics into shared defaults.
- Do not weaken iOS parity gates to make Android iteration easier.
