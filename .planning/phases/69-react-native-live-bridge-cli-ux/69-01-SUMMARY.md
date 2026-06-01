# Phase 69 Summary: React Native Live Bridge CLI UX

## What Changed

- Added command-line options to `verify:react-native-change`:
  - `--live-bridge` / `--live`
  - `--run-id=<id>`
  - `--output-dir=<dir>`
  - `--bridge-run-id=<id>`
  - `--bridge-output-dir=<dir>`
  - `--contract=<path>` / `--bridge-contract=<path>`
- Preserved default committed fixture output under `docs/showcase/evidence/react-native-one-command/`.
- Added tests for CLI parsing and custom result evidence paths.
- Added the RN selector audit, runtime contract, and failure taxonomy checks to `test:smoke`.
- Documented the live bridge CLI command shape in showcase and RN strategy docs.

## Evidence Produced

- Refreshed `docs/showcase/evidence/react-native-one-command/result.json`
- Refreshed `docs/showcase/evidence/react-native-one-command/result.md`
- Local ad-hoc CLI proof command wrote to `output/showcase/react-native-one-command-cli/rn-cli-check/`

## Result

Developers can now run an output-directed RN live bridge attempt without editing environment variables:

```bash
pnpm run verify:react-native-change -- --live-bridge --contract=configs/readiness/demo-android-app.android.json --output-dir=output/showcase/react-native-one-command-cli/<run-id>
```

The current environment still reports blocked before live because no Android device is visible.

## Verification

- `pnpm run test:react-native-one-command` — passed
- `pnpm run generate:react-native-one-command` — passed
- `pnpm run validate:react-native-one-command` — passed
- `M2E_RN_READINESS_FORCE_NO_DEVICE=1 M2E_RN_READINESS_FORCE_METRO_UNAVAILABLE=1 M2E_RN_READINESS_ALLOW_BLOCKED=1 M2E_RN_ONE_COMMAND_ALLOW_BLOCKED=1 pnpm run verify:react-native-change -- --run-id=rn-cli-check --output-dir=output/showcase/react-native-one-command-cli/rn-cli-check --live-bridge --bridge-output-dir=output/showcase/react-native-one-command-cli/rn-cli-check/bridge --contract=configs/readiness/demo-android-app.android.json` — passed with blocked-safe output
- `git diff --check` — passed
