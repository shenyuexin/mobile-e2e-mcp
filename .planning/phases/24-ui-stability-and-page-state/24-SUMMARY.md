# Phase 24 Summary: UI Stability and Page State Management

**Date:** 2026-04-11
**Status:** ✅ Completed
**Branch:** `update-ios-tool-probe-from-simulator`

## Executive Summary

Phase 24 addressed two systemic timing problems discovered through 16+ iterations of iOS simulator probe debugging:

1. **Animation timing** — hard-coded `stabilize(ms)` guesses replaced by evidence-based `wait_for_ui_stable` tool
2. **Page state awareness** — StateSummary enhanced with `pageIdentity` signals for navigation-aware automation

The phase delivered 3 core capabilities and migrated probe scripts, verified on both Android (vivo) and iOS Simulator.

## Deliverables

### P24-A: `wait_for_ui_stable` MCP Tool
- New tool that polls UI hierarchy until consecutive snapshots produce identical structural hash
- Replaces hard-coded `stabilize(ms)` with evidence-based waiting
- Returns structured result: `stableFingerprint`, `polls`, `stableAfterMs`, `confidence`

### P24-B: StateSummary `pageIdentity` Enhancement
- Added `PageIdentity` interface to StateSummary (all fields optional)
- Derives `treeHash`, `primaryHeading`, `hasBackAffordance`, `isTopLevel` from UI hierarchy
- Backward compatible: existing comparison logic (stateChanged, drift, replay) unaffected

### P24-C: `navigate_back` Post-Back Verification
- After executing back action, waits for UI stabilization
- Returns `postBackVerified`, `postBackStableAfterMs`, `postBackPageIdentity`, `noMaterialChange`
- Works for both Android (KEYEVENT_BACK) and iOS (selector tap)

## Verification Results

| Platform | Device | Success | Partial | Failed | All Failures Expected? |
|----------|--------|---------|---------|--------|----------------------|
| **Android** | vivo 10AEA40Z3Y000R5 | 19/23 | 0 | 4 | ✅ Yes |
| **iOS Simulator** | ADA078B9 | 18/23 | 1 | 4 | ✅ Yes |

### Android Expected Failures
- `replay_last_stable_path` — OCR_POST_VERIFY_FAILED (known timing issue)
- `perform_action_with_evidence(failure)` — intentional failure probe
- `capture_js_console_logs` / `capture_js_network_events` — no Metro

### iOS Simulator Expected Failures
- `start_session` — DEVICE_UNAVAILABLE (first run)
- `run_flow` — UNSUPPORTED_OPERATION (smoke-only flow)
- `capture_js_console_logs` / `capture_js_network_events` — no Metro
- `perform_action_with_evidence(failure)` — intentional failure probe

## Commits

| Commit | Description | Files Changed |
|--------|-------------|--------------|
| `77140d7` | P24-A: `wait_for_ui_stable` MCP tool | 10 files, +289 |
| `5106062` | P24-B: StateSummary `pageIdentity` | 3 files, +71 |
| `4c8c217` | P24-C: `navigate_back` post-back verification | 2 files, +123 |
| `971092c` | Probe migration + dual-platform verification | 2 files, +17 |
| **Total** | | **17 files, +500 lines** |

## Architecture Impact

### New Files
- `packages/adapter-maestro/src/ui-stability.ts` — hashUiTree + waitForUiStableWithMaestro
- `packages/mcp-server/src/tools/wait-for-ui-stable.ts` — MCP tool wrapper

### Modified Files
- `packages/contracts/src/types.ts` — WaitForUiStableInput/Data, PageIdentity, NavigateBackInput/Data
- `packages/contracts/src/reason-codes.ts` — stabilityTimeout
- `packages/contracts/src/constants/tool-names.ts` — waitForUiStable
- `packages/adapter-maestro/src/session-state.ts` — derivePageIdentity
- `packages/adapter-maestro/src/ui-action-tools.ts` — post-back verification
- `packages/adapter-maestro/src/index.ts` — exports
- `packages/mcp-server/src/server.ts` — ToolContract
- `packages/mcp-server/src/index.ts` — tool registration
- `scripts/dev/ios-simulator-tool-probe.ts` — stabilize → wait_for_ui_stable
- `scripts/dev/ios-tool-probe.ts` — minor sync

## Risk Mitigation

| Risk | Mitigation | Status |
|------|-----------|--------|
| PageIdentity breaks stateChanged comparison | All fields optional; comparison unchanged | ✅ Verified |
| PageIdentity breaks replay/drift logic | Optional fields, not compared | ✅ Verified |
| Circular imports (ui-stability ↔ session-state) | Dynamic imports in ui-action-tools.ts | ✅ Resolved |
| wait_for_ui_stable too slow on dynamic pages | Returns partial with STABLE_TIMEOUT | ✅ Working as designed |
| Hash collision false positives | Rolling hash on text+type+bounds; low collision probability | ✅ Acceptable |

## Next Steps

Phase 24 is complete. Potential future work:
- P24-D: `ensure_page_identity` (navigation recovery primitive) — deferred
- P24-E: Orchestration-layer auto-stabilize — deferred
- Probe migration for `android-tool-probe.ts` — stabilize(ms) → wait_for_ui_stable (remaining calls)
