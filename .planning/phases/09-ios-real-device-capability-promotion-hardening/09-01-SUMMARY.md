---
phase: 09-ios-real-device-capability-promotion-hardening
plan: 01
summary_type: internal-planning
task_type: hardening
completed: 2026-04-04
requirements_completed: []
key_files:
  created:
    - .planning/phases/09-ios-real-device-capability-promotion-hardening/09-01-SUMMARY.md
    - .planning/phases/09-ios-real-device-capability-promotion-hardening/09-01-VERIFY.md
  modified:
    - packages/adapter-maestro/src/ui-runtime-ios.ts
    - packages/adapter-maestro/src/ui-action-tools.ts
    - packages/adapter-maestro/src/device-runtime-ios.ts
    - packages/adapter-maestro/src/capability-model.ts
    - packages/adapter-maestro/test/ui-action-tools.test.ts
    - packages/adapter-maestro/test/device-runtime.test.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/test/server.test.ts
    - docs/guides/flow-generation.md
    - docs/showcase/ios-recording-showcase.md
    - .planning/phases/09-ios-real-device-capability-promotion-hardening/09-01-PLAN.md
repo_truth_synced:
  - packages/adapter-maestro/src/ui-runtime-ios.ts
  - packages/adapter-maestro/src/ui-action-tools.ts
  - packages/adapter-maestro/src/capability-model.ts
  - packages/mcp-server/src/index.ts
  - docs/guides/flow-generation.md
  - docs/showcase/ios-recording-showcase.md
verify_file: 09-01-VERIFY.md
---

# Phase 09 Plan 01 Summary

## Goal

Harden iOS physical-device promotion gates for direct actions (`tap`/`type_text`) so runtime behavior, capability descriptors, MCP tool metadata, and docs no longer drift around simulator-only assumptions.

## Implemented

1. Added an explicit iOS physical-device direct-action execution branch:
   - `tap`/`type_text` now generate bounded Maestro action flow files under `artifacts/ios-physical-actions/<sessionId>/`.
   - Physical-device direct execution routes through `maestro test --platform ios --udid <deviceId> <generated-flow>` instead of relying on simulator-only idb action paths.
2. Preserved deterministic/structured semantics:
   - Simulator path remains idb-based.
   - Physical path returns structured `status`/`reasonCode` and keeps explicit signing/runtime guidance on failure.
3. Added proof-oriented tests:
   - `ui-action-tools.test.ts` now asserts dry-run command preview for iOS physical-device `tap` and `type_text` routes through Maestro (non-simulator path assertion).
   - Existing `device-runtime.test.ts` physical install/reset assertions remain green.
4. Synced boundary language:
   - Updated iOS capability notes (`capability-model.ts`) for generated Maestro action-flow physical path.
   - Updated MCP tool descriptions for `tap`/`type_text` to include simulator idb + physical generated-flow path.
   - Updated iOS flow/showcase docs to reflect the same boundary.

## Verification

- `pnpm --filter @mobile-e2e-mcp/adapter-maestro test` ✅
- `pnpm --filter @shenyuexin/mobile-e2e-mcp test` ✅
- `pnpm typecheck` ✅
- `pnpm build` ✅
- `pnpm run validate:phase3-samples` ✅

## Key Decisions

- Physical-device direct actions are hardened as an explicit generated-flow runtime path (not implicit simulator error translation).
- Support level remains `partial`/proof-gated for iOS action tools because physical-device execution still depends on signing/runtime prerequisites.
- Docs and descriptors were aligned to avoid both overclaim and stale simulator-only underclaim.

## Next Step

- Run self-hosted iOS physical-device acceptance lane and collect real-device evidence (`reports/phase-sample-report.json`, `reports/acceptance-evidence.json`) to assess promotion readiness beyond proof-gated partial support.
