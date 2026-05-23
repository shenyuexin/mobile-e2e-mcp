# Phase 26 Gate 04 — Decision Record

## Gate

`26-04` — `PageContextType -> InterruptionType` bridge

## Status

Closed

## Final Decision

- `PageContextType` remains a surface-semantics model only.
- `InterruptionType` remains the governance/action taxonomy used by classifier, resolver, policy routing, and interruption telemetry.
- The first approved bridge seam is `classifyInterruptionFromPageContext()` in `packages/adapter-maestro/src/interruption-classifier.ts`.
- The bridge is one-way: page-context input is translated into existing interruption signals/classification semantics before downstream logic consumes it.
- Resolver and policy code must continue to operate on `InterruptionClassification.type`, not on raw `PageContextType`.

### Current Implementation Outcome

- Added `classifyInterruptionFromPageContext()` to `packages/adapter-maestro/src/interruption-classifier.ts`.
- The mapper converts page-context fields into interruption-like signals and reuses `classifyInterruptionFromSignals()` instead of creating a parallel classifier path.
- No resolver or detector policy-routing logic was modified.

## Must Lock Before Code Starts

- Separation between surface semantics and governance semantics
- One-way mapper rule
- Allowed extra signals the mapper may consult
- Reuse expectations for existing interruption tools/policy path

## Truth Owners

- `packages/contracts/src/types.ts`
- `packages/adapter-maestro/src/interruption-detector.ts`
- `packages/adapter-maestro/src/interruption-classifier.ts`
- `packages/adapter-maestro/src/interruption-resolver.ts`
- `packages/mcp-server/src/tools/detect-interruption.ts`
- `packages/mcp-server/src/tools/classify-interruption.ts`

## Rejected Options

- Branching policy directly on raw `PageContextType`
- Creating a parallel page-context-specific interruption taxonomy

## Verification Notes

- Verified by failing test first in `packages/adapter-maestro/test/interruption-classifier.test.ts`, then implementing the mapper.
- Verified targeted classifier tests with `pnpm --filter "@mobile-e2e-mcp/adapter-maestro" test -- interruption-classifier.test.ts`.
- Verified adapter-maestro typecheck with `pnpm --filter "@mobile-e2e-mcp/adapter-maestro" typecheck`.
- Verified adapter-maestro build with `pnpm --filter "@mobile-e2e-mcp/adapter-maestro" build`.
