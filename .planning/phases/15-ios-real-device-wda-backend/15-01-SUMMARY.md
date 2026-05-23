# Phase 15 Plan 01 Summary

## Objective

Replace Maestro YAML generation/execution for iOS real-device UI actions with direct WDA (WebDriverAgent) HTTP API calls.

## What Changed

### New Source Files (2)

| File | Purpose |
|---|---|
| `ios-backend-wda.ts` | `WdaRealDeviceBackend` — HTTP API to WDA on physical device (tap, typeText, swipe, hierarchy via /source, screenshot) |
| `test/ios-backend-wda.test.ts` | 14 unit tests for WDA backend |

### Modified Files (6)

| File | Changes |
|---|---|
| `ios-backend-types.ts` | Add `"wda"` to `backendId` union; add `wda` to `BackendProbeSummary` |
| `ios-backend-router.ts` | Import WdaRealDeviceBackend, add `wdaBackend` instance, wire `resolveBackendById` case "wda", `probeAllBackends` includes WDA |
| `doctor-guidance.ts` | Add WDA and iproxy guidance entries |
| `doctor-runtime.ts` | Add iproxy version check + WDA `/status` HTTP endpoint check |
| `capability-model.ts` | Update 9 iOS physical-device tool descriptions to reference WDA instead of Maestro |
| `test/ios-backend-router.test.ts` | Add `selectBackend uses wda when IOS_EXECUTION_BACKEND=wda` test |

## Verification

### Automated
- TypeScript: `pnpm typecheck` — all packages pass
- Tests: 26 pass (14 WDA + 12 router), 0 fail
- Bash: N/A (no shell changes)

### Manual (requires real iOS device + WDA build)
- [ ] Build WDA to device with code signing
- [ ] Run `iproxy 8100 8100 --udid <udid> &`
- [ ] `curl http://localhost:8100/status` returns JSON
- [ ] `curl http://localhost:8100/source` returns accessibility tree
- [ ] `curl -X POST http://localhost:8100/wda/tap -d '{"x":100,"y":200}'` performs tap
- [ ] `mobile-e2e-mcp doctor` shows WDA and iproxy status
- [ ] `IOS_EXECUTION_BACKEND=wda` routes to WDA backend

## Known Limitations

1. **WDA requires code signing** — free Apple ID works (7-day expiry); $99/year developer cert for production
2. **iproxy dependency** — `brew install libusbmuxd` required for port forwarding
3. **WDA build process** — requires Xcode, not `brew install`-able
4. **Unicode input** — WDA `/wda/keys` may have limitations with non-ASCII text

## Migration Path for Users

Existing users with `IOS_EXECUTION_BACKEND=maestro` continue to work.

New users can set `IOS_EXECUTION_BACKEND=wda` for physical devices after completing WDA setup.

The default auto-detect for physical devices remains devicectl (lifecycle only). To use WDA for UI actions, explicitly set `IOS_EXECUTION_BACKEND=wda`.
