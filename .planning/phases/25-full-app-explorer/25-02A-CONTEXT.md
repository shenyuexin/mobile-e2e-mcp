# Phase 25 Plan 02A — Context

## Why this slice exists

This slice exists to convert commit `7804ac5d` from “known-good by memory/history” into a repo-tracked, test-enforced iOS Explorer baseline.

Without this slice:

- later hook extraction work has no hard regression boundary,
- Android-driven shared changes can silently redefine iOS behavior,
- “preserve iOS” remains a chat instruction instead of an executable guardrail.

## Current repo situation

- iOS Explorer behavior has already been implemented and verified in commit `7804ac5d`.
- Current uncommitted work is focused on Android smoke/debug iteration.
- Recent Android fixes required shared changes in parser/actionability code, which exposed cross-platform regression risk.

## What must be treated as iOS baseline truth

At minimum, this slice should lock behavior around:

1. `inspect_ui` payload handling for iOS direct-tree shape.
2. `inspect_ui` payload handling for wrapped-result shape.
3. Title extraction behavior used by snapshot/page identity.
4. Actionable-element classification and prioritization.
5. Backtrack verification semantics on iOS.

## Files most likely involved

- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `packages/explorer/src/element-prioritizer.ts`
- `packages/explorer/tests/**/*.test.ts`

## What not to do in this slice

- Do not start introducing hook files yet.
- Do not try to stabilize Android behavior here.
- Do not refactor traversal/state-graph logic as part of baseline locking.
