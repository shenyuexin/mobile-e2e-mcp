# Phase 06 Plan 06 Publication Spec

## Candidate Set For First Publication Wave

Only these validated drafts are in scope for the first real-skill wave:

1. `mobile-e2e-readiness-baseline`
2. `android-e2e-readiness`
3. `ios-e2e-readiness`

Deferred from the first wave:

- Compose-only skill
- SwiftUI-only skill
- React Native readiness skill
- Flutter readiness skill

## Canonical Source Strategy

Real skill publication should start from **repo-tracked canonical sources**, not directly from local skill directories.

### Rule

1. Draft source of truth lives under `.planning` until publication-prep is complete.
2. Future real skill source of truth should live in a repo-tracked location.
3. Local installation/export should be treated as a downstream replication step, not the canonical authoring surface.

## Future Target File Inventory

Each published skill should later have:

- one canonical source directory
- one `SKILL.md`
- optional supporting references only if needed
- publication metadata / rollout note if local installation/export is required

## Source-to-Publication Mapping

| Draft source | Future real skill | Status |
|---|---|---|
| `06-02-BASELINE-SKILL-SPEC.md` | `mobile-e2e-readiness-baseline` | publication-prep only |
| `06-03-ANDROID-SKILL-SPEC.md` | `android-e2e-readiness` | publication-prep only |
| `06-04-IOS-SKILL-SPEC.md` | `ios-e2e-readiness` | publication-prep only |

## Publication Preconditions

Before creating any real skill file:

1. The draft has a meaningful RED/GREEN pair.
2. The publication-grade scenario is frozen.
3. The invocation boundary is explicit.
4. The publication gate passes.
5. Repo-tracked canonical location is chosen.

## Non-goal Reminder

This document does not authorize real skill creation yet. It only defines the publication-ready contract for a later slice.
