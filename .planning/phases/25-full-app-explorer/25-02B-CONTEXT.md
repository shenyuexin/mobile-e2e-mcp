# Phase 25 Plan 02B — Context

## Why this slice exists

Once iOS baseline behavior is locked, the next step is to create the platform seam without changing what iOS does.

This slice is the architectural extraction step:

- not Android stabilization,
- not shared behavior redesign,
- not feature expansion.

## What this slice should accomplish

- define the Explorer platform hook contract,
- implement iOS first,
- rewire shared explorer code to consume normalized hook outputs,
- keep iOS behavior equivalent to the pre-hook baseline.

## Expected seam location

The seam should begin **after MCP invocation** and **before explorer semantic interpretation**.

That means shared code should consume facts like:

- `titleCandidates`
- `isActionable`
- `selectorTokens`
- `backCapabilityEvidence`

instead of raw iOS payload fields.

## Files most likely involved

- `packages/explorer/src/explorer-platform.ts`
- `packages/explorer/src/explorer-platform-ios.ts`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `packages/explorer/src/element-prioritizer.ts`
- `packages/explorer/src/mcp-adapter.ts`

## What not to do in this slice

- Do not let Android shape the hook contract.
- Do not widen the hook API just to anticipate future Android quirks.
- Do not accept iOS behavior drift as a “normal refactor side effect.”
