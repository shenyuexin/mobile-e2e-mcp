# Phase 25 Plan 02A — Risks

## Primary risks

### 1. Baseline captured too loosely

If tests only assert broad success, they will not actually protect iOS behavior during later refactors.

### 2. Baseline captured too narrowly

If tests overfit implementation details, harmless internal cleanup will become unnecessarily expensive.

### 3. Missing wrapped-payload coverage

If only one iOS payload shape is locked, later refactors can still break the other shape silently.

### 4. Android concerns leaking into iOS baseline work

Trying to “prepare for Android” inside 25-02A weakens the purpose of this slice.

## Mitigations

- Prefer behavior-level assertions: title, actionable targets, back verification outcome.
- Cover both direct-tree and wrapped payload shapes explicitly.
- Keep Android-specific fixture thinking out of this slice.
- If a test feels Android-motivated, move it to 25-02C instead.
