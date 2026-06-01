# Phase 69 Verification

## Commands

```bash
pnpm run test:react-native-one-command
pnpm run generate:react-native-one-command
pnpm run validate:react-native-one-command
M2E_RN_READINESS_FORCE_NO_DEVICE=1 M2E_RN_READINESS_FORCE_METRO_UNAVAILABLE=1 M2E_RN_READINESS_ALLOW_BLOCKED=1 M2E_RN_ONE_COMMAND_ALLOW_BLOCKED=1 pnpm run verify:react-native-change -- --run-id=rn-cli-check --output-dir=output/showcase/react-native-one-command-cli/rn-cli-check --live-bridge --bridge-output-dir=output/showcase/react-native-one-command-cli/rn-cli-check/bridge --contract=configs/readiness/demo-android-app.android.json
git diff --check
```

## Outcome

All commands passed.

## Acceptance Check

- `--live-bridge` enables the explicit bridge request.
- `--output-dir` writes RN result evidence outside committed fixture paths.
- Default generate/validate output remains stable.
- `test:smoke` now includes the RN selector audit, runtime contract, and failure taxonomy checks.
- No live success is claimed without a visible device and intake evidence.
