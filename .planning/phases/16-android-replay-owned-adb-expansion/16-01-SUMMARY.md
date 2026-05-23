# Phase 16 Plan 01 Summary

## Objective

Expand Android owned-adb replay backend to cover 9 previously-unsupported Maestro commands, eliminating the need for `dev.mobile.maestro` + `dev.mobile.maestro.test` helper apps in virtually all replay scenarios.

## What Changed

### Modified Files (5)

| File | Changes |
|---|---|
| `replay-step-planner.ts` | +152 lines: 9 new command parsers (tapOn.point, swipe, back, home, hideKeyboard, stopApp, clearState, assertNotVisible, runFlow). `tapOn.point` converted from unsupported to supported. |
| `flow-runtime.ts` | +4/-4 lines: Updated error messages and `nextSuggestions` to reflect expanded coverage. |
| `capability-model.ts` | +1/-1 lines: Updated `run_flow` capability note to list all supported commands. |
| `replay-step-planner.test.ts` | +67/-32 lines: Updated existing tests from "unsupported" to "supported", added hideKeyboard test. |
| `run-phase1-android.sh` | +232 lines: Added `run_owned_adb_replay()` function (embedded Python YAML parser + adb execution) + backend auto-selection logic via `ANDROID_REPLAY_BACKEND` env var. |

## Verification

### Automated
- TypeScript: `pnpm typecheck` — all packages pass
- Tests: 18/18 replay-step-planner tests pass
- Bash syntax: `bash -n scripts/dev/run-phase1-android.sh` — valid

### Manual (requires Android device)
- [ ] Run a flow with only supported commands (launchApp, tapOn, inputText, assertVisible) → owned-adb path
- [ ] Run a flow with tapOn (coordinate point) → owned-adb path (no helper app)
- [ ] Run a flow with swipe, back, home → owned-adb path
- [ ] Run a flow with stopApp, clearState → owned-adb path
- [ ] Run a flow with assertNotVisible → owned-adb path
- [ ] Run a flow with unsupported command (extendedWaitUntil) → maestro fallback (requires helper app)
- [ ] Set `ANDROID_REPLAY_BACKEND=owned-adb` → forces owned-adb path
- [ ] Set `ANDROID_REPLAY_BACKEND=maestro` → forces maestro path8 path

## Known Limitations

1. **Unicode text input** — `adb shell input text` only supports ASCII; spaces encoded as `%s`, special chars escaped. Non-ASCII characters may be dropped.
2. **Coordinate tap is resolution-dependent** — if recording device resolution ≠ replay device resolution, coordinates may be wrong. Warning in replay step metadata.
3. **runFlow sub-flow inlining** — loads and inlines sub-flow YAML at plan time. Circular references detected and error out.
4. **assertNotVisible XML parsing** — uses `parseAndroidUiHierarchyNodes()` which handles most OEM variations but may have edge cases on heavily customized Android skins.

## Migration Path for Users

Existing users with `dev.mobile.maestro` helper apps installed continue to work (auto-detected → maestro path).

Users WITHOUT helper apps now get owned-adb path automatically for common commands — no installation needed.

Set `ANDROID_REPLAY_BACKEND=owned-adb` to force owned-adb, or `ANDROID_REPLAY_BACKEND=maestro` to force maestro.
