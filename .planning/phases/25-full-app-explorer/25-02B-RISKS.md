# Phase 25 Plan 02B — Risks

## Primary risks

### 1. Hook contract too wide

A very wide hook output shape recreates the current shared-coupling problem under a new filename.

### 2. Hook contract too narrow

If the contract hides meaningful semantics, shared code may need to reach back into raw iOS fields again.

### 3. Silent iOS behavior drift

The most dangerous failure mode here is “tests still mostly pass, but iOS semantics subtly changed.”

### 4. Shared code remains platform-aware

If `snapshot.ts` or `backtrack.ts` still directly branches on raw platform fields after extraction, the seam is incomplete.

## Mitigations

- Keep 25-02A parity tests mandatory.
- Extract only what shared orchestration truly needs.
- Stop if a hook decision requires redefining baseline iOS behavior.
- Prefer multiple small normalized facts over one giant universal node contract.
