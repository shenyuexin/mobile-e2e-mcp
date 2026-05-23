# Phase 25 Plan 02C — Risks

## Primary risks

### 1. Android workaround leakage

Temporary Android timing/retry/container heuristics can easily escape into shared code if not watched closely.

### 2. False confidence from smoke success

A green Android smoke run is valuable, but it does not mean Android semantics are mature enough to define shared defaults.

### 3. iOS regression through shared rewiring

Even if Android work is isolated, integration mistakes can still break the iOS lane if shared code is touched carelessly.

### 4. Support-boundary drift

Once Android starts working better, planning/docs may overstate its maturity before evidence really supports that claim.

## Mitigations

- Keep Android marked provisional throughout 25-02C.
- Re-run all iOS parity tests on every Android integration step.
- Treat Android-only smoke heuristics as Android hook-local unless separately promoted later.
- Record remaining Android gaps explicitly instead of masking them in shared behavior.
