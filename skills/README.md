# Skills Index

This directory contains the canonical repo-tracked skill sources for the first wave of mobile E2E readiness guidance.

## First-Wave Skills

- `mobile-e2e-readiness-baseline`
- `android-e2e-readiness`
- `ios-e2e-readiness`

## Which Skill To Use

### Start from the failure signature when:

- **visible but tap does nothing across platforms** → start with baseline
- **retry later passes but the root cause is unclear** → start with baseline
- **Compose/View or hybrid Android ownership is part of the failure** → use Android
- **SwiftUI/UIKit or interruption handling is part of the failure** → use iOS

### Start with baseline when:

- the problem is still cross-platform
- the team is debating timing vs selector vs flaky app
- the app lacks a shared readiness vocabulary
- you need to diagnose entry, locator, state, reset, or evidence-hook gaps without platform detail yet

### Use Android when:

- the issue is clearly Android-specific
- Compose, View-system, or hybrid ownership is part of the diagnosis
- the team is collapsing the issue into selector-vs-timing without checking Android entry/reset or blocked-state concerns

### Use iOS when:

- the issue is clearly iOS-specific
- SwiftUI, UIKit, or mixed-surface ownership is part of the diagnosis
- the team is collapsing the issue into SwiftUI timing without checking launch/reset, interruption, or identifier contracts

## Decision Rule

1. If the diagnosis is still shared across Android and iOS, use `mobile-e2e-readiness-baseline` first.
2. If the baseline says the issue is platform-specific, switch to the matching platform skill.
3. Do not skip baseline unless the platform boundary is already obvious.

## Practical Workflow

Use the first-wave skills in this order:

1. `mobile-e2e-readiness-baseline` — decide whether the failure is really a readiness/contract issue.
2. `android-e2e-readiness` or `ios-e2e-readiness` — decide which platform-specific contract is weak.
3. platform-development skill or code-level debugging — implement the fix after the contract gap is clear.

### Typical handoff

- baseline → `android-e2e-readiness` / `ios-e2e-readiness` when the failure layer is clearly platform-specific
- platform readiness skill → `android-development` / `ios-development` when the contract gap is already clear and the next task is changing app code

These readiness skills are for **triage and problem location first**. They do not replace broader implementation skills.

## Current Boundary

These skills cover:

- readiness
- debugging
- evidence interpretation
- remediation framing

They do **not** yet cover:

- Compose-only publication
- SwiftUI-only publication
- React Native-specific skill publication
- Flutter-specific skill publication
- full platform implementation guidance; use broader platform-development skills once the diagnosis is clear

## Export / Install

`skills/` is the canonical source of truth.

To export the canonical skills into another directory:

```bash
pnpm skills:export -- --out-dir "/absolute/path/to/target"
```

Optional modes:

```bash
pnpm skills:export -- --out-dir "/absolute/path/to/target" --mode symlink
pnpm skills:export -- --out-dir "/absolute/path/to/target" --dry-run
pnpm skills:check -- --out-dir "/absolute/path/to/target" --mode copy
```

To install into known local OpenCode skill roots:

```bash
pnpm skills:install -- --preset opencode-config
pnpm skills:install -- --preset opencode-home --mode symlink
pnpm skills:install:check -- --preset opencode-config --mode copy
```

Rules:

- always export from `skills/`
- always choose the destination explicitly with `--out-dir`
- use `copy` by default; use `symlink` only when your environment supports it
- do not treat exported copies as canonical source
- `skills:install` is just a preset wrapper around the same canonical export flow; it does not create a second source of truth
