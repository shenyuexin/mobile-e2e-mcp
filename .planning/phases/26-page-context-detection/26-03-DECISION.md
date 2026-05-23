# Phase 26 Gate 03 — Decision Record

## Gate

`26-03` — WDA `/source` pre-flight boundary

## Status

Closed

## Final Decision

- WDA `/source` remains the hierarchy-capture path for explicit UI-tree reads.
- WDA real-device pre-flight must use a lightweight probe on `/status`, not `/source`.
- The explicit reusable boundary for this gate is now `WdaRealDeviceBackend.probePreflightReadiness()`.
- `doctor-runtime` should use that lightweight probe path instead of maintaining an ad hoc WDA readiness fetch.

### Current Implementation Outcome

- Added `probePreflightReadiness()` to `packages/adapter-maestro/src/ios-backend-wda.ts`.
- Kept `buildHierarchyCaptureCommand()` untouched so runtime hierarchy capture still uses `/source`.
- Updated `packages/adapter-maestro/src/doctor-runtime.ts` to call the lightweight WDA pre-flight probe instead of issuing its own direct readiness fetch.
- Added/updated WDA backend test coverage proving the pre-flight probe uses `/status` rather than `/source`.

## Must Lock Before Code Starts

- Allowed lightweight pre-flight signals
- Forbidden `/source` usage in default pre-flight
- Explicitly allowed `/source` runtime/diagnostic/fallback paths

## Truth Owners

- `packages/adapter-maestro/src/ios-backend-wda.ts`
- `packages/adapter-maestro/src/ui-runtime.ts`
- `packages/adapter-maestro/src/doctor-runtime.ts`
- `docs/guides/wda-setup.md`

## Rejected Options

- Treating `/source` as a cheap pre-flight signal
- Reintroducing heavy hierarchy capture through shallow client parsing arguments

## Verification Notes

- Verified by failing test first in `packages/adapter-maestro/test/ios-backend-wda.test.ts`, then implementing `probePreflightReadiness()`.
- Verified targeted WDA backend tests with `pnpm --filter "@mobile-e2e-mcp/adapter-maestro" test -- ios-backend-wda.test.ts`.
- Verified adapter-maestro typecheck with `pnpm --filter "@mobile-e2e-mcp/adapter-maestro" typecheck`.
