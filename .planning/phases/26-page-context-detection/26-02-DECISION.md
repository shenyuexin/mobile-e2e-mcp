# Phase 26 Gate 02 — Decision Record

## Gate

`26-02` — platform and app identity contract alignment

## Status

Closed

## Final Decision

- Top-level `Platform` remains the live repo contract truth: `android | ios`.
- iOS simulator versus real-device detail is represented as subordinate page-context metadata, not as a new top-level platform union.
- `appId` remains the canonical app identity field for session-bound tools in this repo.
- `targetAppId` is not approved as a Gate 02 contract field and must not be introduced casually.
- Phase 26-safe subordinate identity model for contracts:
  - `pageContext.runtimeFlavor` captures backend/lane detail such as `ios_simulator` or `ios_real_device`
  - `pageContext.appIdentity` captures app identity provenance without replacing the session-bound `appId` contract

## Must Lock Before Code Starts

- Top-level `Platform` truth for this phase
- iOS backend/lane representation rule
- `appId` ownership and any override semantics
- Whether `targetAppId` exists at all in the approved contract path

### Current Implementation Outcome

- Added subordinate metadata types to `packages/contracts/src/page-context.ts`:
  - `PageContextRuntimeFlavor`
  - `PageContextAppIdentity`
- Extended `PageContext` with optional `runtimeFlavor` and `appIdentity`
- Kept `GetPageContextInput.appId` as the canonical identity field and did not add `targetAppId`
- Re-exported the new Gate 02 contract types from `packages/contracts/src/index.ts`

## Truth Owners

- `packages/contracts/src/types.ts`
- `packages/contracts/src/index.ts`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/cli/context-resolver.ts`
- `packages/mcp-server/src/server.ts`

## Rejected Options

- Unapproved expansion to `ios-sim` / `ios-real` top-level platform values
- Casual alias drift around `targetAppId`

## Verification Notes

- Verified against live `Platform` contract in `packages/contracts/src/types.ts`.
- Verified against session-bound normalization in `packages/mcp-server/src/index.ts`, which still enforces and normalizes `platform` and `appId` from the active session.
- Verified that the contract change keeps backend/lane detail subordinate to page-context metadata instead of mutating top-level platform truth.

## Verification Notes

Pending.
