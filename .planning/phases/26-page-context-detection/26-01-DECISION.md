# Phase 26 Gate 01 — Decision Record

## Gate

`26-01` — `ToolResult<T>` envelope alignment

## Status

Closed

## Final Decision

- Top-level envelope remains the existing `ToolResult<T>` with `status` limited to `success | failed | partial`.
- `reasonCode` remains a required non-empty string. Successful examples should use `OK`; blocked or denied examples should use the appropriate existing reason code such as `POLICY_DENIED`.
- Page-context-specific semantics live under `data`, not in any parallel top-level envelope.
- Default nested payload structure for this gate:
  - `data.pageContext` — normalized page-context snapshot
  - `data.pageContextDecision` — page-context-specific decision/result details for pre-flight or tool-local interpretation
  - `data.interruptionMapping` — optional mapped interruption semantics when the page-context flow explicitly bridges into interruption handling
- Default contract placement/export order for new page-context contracts:
  1. define them in a focused contracts module (`packages/contracts/src/page-context.ts`)
  2. re-export from `packages/contracts/src/index.ts`
  3. update downstream consumers only after exports exist
  4. run targeted build/typecheck verification immediately after consumer updates

### Current Implementation Outcome

- Added focused contracts module: `packages/contracts/src/page-context.ts`
- Re-exported page-context contracts from: `packages/contracts/src/index.ts`
- Corrected invalid planning examples in `26-01-PLAN.md` so they now match the live `ToolResult<T>` status/reasonCode contract

### Scenario Mapping Table

| Scenario | ToolResult.status | reasonCode | Required `data` fields |
|---|---|---|---|
| Normal page-context success | `success` | `OK` | `pageContext` |
| Pre-flight blocked by policy/profile | `failed` | existing policy/interruption reason code (for example `POLICY_DENIED`) | `pageContext`, `pageContextDecision` |
| Context detected but partially ambiguous | `partial` | existing ambiguity/unsupported/timeout-style code as appropriate | `pageContext`, `pageContextDecision` |
| Context bridged into interruption reuse | `success` or `partial` depending on certainty | `OK` or existing ambiguity code | `pageContext`, optional `interruptionMapping` |

### Canonical Payload Rule

- Examples in `26-01-PLAN.md` are planning references only, but they must still remain schema-compatible with the live `ToolResult<T>` envelope.
- Phase 26 must not use example payloads with invalid top-level status values such as `passed`, or nullable `reasonCode` fields.

## Must Lock Before Code Starts

- Final envelope-compatible representation for success / blocked / interrupted / partial outcomes
- Canonical payload example(s)
- Whether `data.pageContextDecision` (or equivalent) is required
- Type placement/export order for page-context contracts

## Truth Owners

- `packages/contracts/src/types.ts`
- `packages/contracts/tool-result.schema.json`
- `packages/contracts/src/index.ts`
- `packages/mcp-server/src/tools/`
- `packages/mcp-server/src/server.ts`

## Rejected Options

- Custom top-level statuses outside `ToolResult<T>`
- Using reason-code expansion as a substitute for envelope design
- Using invalid planning examples that drift from the live `ToolResult<T>` schema

## Verification Notes

- Verified against live `ToolStatus` contract in `packages/contracts/src/types.ts`.
- Verified against live `tool-result.schema.json` requirements: `status` enum is `success | failed | partial`; `reasonCode` is required and non-empty.
- Verified that current contract export surface is centralized in `packages/contracts/src/index.ts`, supporting the focused-module-then-export approach.
- Verified with `pnpm --filter "@mobile-e2e-mcp/contracts" typecheck`.
- Verified with `pnpm --filter "@mobile-e2e-mcp/contracts" build`.
