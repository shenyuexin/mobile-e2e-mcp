# Showcase Index

This folder contains reproducible, real-device demo evidence used by README.

## Failure-intelligence demo

- `docs/showcase/failure-intelligence-demo.md`

## Flow record/replay demo

- `docs/showcase/flow-record-replay-demo.md`

## Explorer real-device evidence

- Android physical-device Explorer run: `artifacts/explorer/android-full/2026-04-28T03-38-20/`
- Evidence summary: Settings app on device `10AEA40Z3Y000R5`, full mode, 45 pages, max depth 4, 0 failures, 33m 50s duration.
- Key exercised paths: `inspect_ui`, `tap_element`, Android `navigate_back` via system back, external-app boundary recovery, page-context gating, screen-drift reconciliation, and report generation.

## Record-session demo

- `docs/showcase/record-session-demo.md`

## iOS recording showcase

- `docs/showcase/ios-recording-showcase.md`

## Primary demo videos

- Happy path (Android real device):
  - `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4`
- Visible interruption + recovery (Android real device):
  - `docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4`

## Current real-device entrypoints

- Android Explorer evidence: `artifacts/explorer/android-full/2026-04-28T03-38-20/`
- Android Explorer evidence gate: `pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4`
- Android probe: `pnpm run validate:android-tool-probe`
- iOS probe: `pnpm run validate:ios-tool-probe`

## Legacy demo scripts

- Happy path script: `pnpm tsx scripts/legacy/dev/demo-happy-path-android.ts`
- Interruption/recovery script: `pnpm tsx scripts/legacy/dev/demo-interruption-home-recovery-android.ts`
- Happy path recording wrapper: `bash scripts/legacy/dev/record-demo-happy-path-android.sh`
- Interruption recording wrapper: `bash scripts/legacy/dev/record-demo-interruption-home-recovery-android.sh`
- One-command publisher (record + curate + refresh assets): `bash scripts/legacy/dev/publish-showcase-assets-android.sh`

## CI platform smoke baseline flows

- iOS simulator baseline flow: `flows/samples/ci/ios-settings-smoke.yaml`
- Android emulator baseline flow: `flows/samples/ci/android-settings-smoke.yaml`

These flows are used by `.github/workflows/platform-smoke.yml` to keep simulator/emulator wiring visible in CI.
They intentionally validate baseline toolchain execution only, and do not replace real-device acceptance evidence.

## CI evidence jobs

- `CI / dry-run-smoke`: runs `pnpm test:smoke` for deterministic dry-run contracts.
- `CI / explorer-evidence`: validates the committed Android physical-device Explorer artifact contract and uploads `ci-android-explorer-evidence-<run_id>`.
- `CI / probe-dry-run`: validates Android + iOS simulator probe dry-run metadata without requiring devices.
- `Platform Smoke`: runs simulator/emulator baseline Maestro flows.
- `Real Device Acceptance`: runs self-hosted acceptance lanes and report quality gates.

See `docs/showcase/ci-evidence.md` for the current proof levels and boundaries.

## Evidence contract and proof levels

- Smoke proof (`pnpm test:smoke`, dry-run validators, Ubuntu CI): verifies deterministic contracts and dry-run behavior, not real-device fidelity.
- Explorer evidence proof (`CI / explorer-evidence`): verifies the committed Android physical-device Explorer artifact remains present and internally consistent; it does not rerun a device.
- Platform smoke proof (`.github/workflows/platform-smoke.yml`): verifies simulator/emulator baseline wiring only.
- Acceptance proof (`.github/workflows/real-device-acceptance.yml`): self-hosted real-run artifacts plus quality gate on `output/reports/phase-sample-report.json`.

Framework lane boundary (current truth):

- Native and Flutter profiles remain `validated-sample-baseline` in `configs/profiles/*.yaml` and `configs/matrices/framework-profile-matrix.md`.
- In the current shared acceptance runner/report path, Flutter framework-lane proof is Android-only (`flutter-android`).
- React Native acceptance lanes (`react-native-ios`, `react-native-android`) are workflow acceptance backbone lanes and are intentionally distinct from framework-profile matrix rows.
- The default Phase 02 framework acceptance entrypoint is `pnpm run validate:phase2-rn-android-acceptance`, which isolates the RN Android lane as a dedicated command path while reusing the shared acceptance evidence generators.

## Prerequisites for clone-and-run

- Android emulator/device online via `adb devices` (recommended Android 9 / API 28 or newer)
- `adb` and `pnpm` installed and available in your `PATH`
- A local Expo React Native sample available via `EXPO_PROJECT_ROOT`
- Expo Go (`host.exp.exponent`) installed on the selected Android device for the RN Phase 02 lane
- `com.epam.mobitru` installed only when running the Mobitru showcase/native/flutter lanes
- `ffmpeg` and `ffprobe` installed (required for the legacy `publish-showcase-assets-android.sh`)

Optional fast install path from this repo before recording:

```bash
(cd examples/demo-android-app && ./gradlew assembleDebug)
APK_PATH=examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk \
  bash scripts/legacy/dev/record-demo-happy-path-android.sh
```

Notes:

- If `DEVICE_ID` is unset, both recording wrappers and direct demo TS scripts auto-select the first online Android device.
- `APK_PATH` is supported by both legacy recording wrappers and by `publish-showcase-assets-android.sh`.
- Start Expo for the local RN sample referenced by `EXPO_PROJECT_ROOT` before running the dedicated Phase 02 acceptance command when using Expo Go.
- `pnpm run validate:phase2-rn-android-acceptance` uses the React Native Android sample flow and writes lane-local artifacts under `output/evidence/phase2-rn-android/**` before regenerating `output/reports/phase-sample-report.*` and `output/reports/acceptance-evidence.*`.
- `pnpm run validate:phase3-real-run` is retained as a legacy sample compatibility matrix. Use Explorer/probe artifacts as the primary real-device proof for the current tool surface.

## Snapshot assets used by README

- `docs/showcase/assets/happy-01-login.png`
- `docs/showcase/assets/happy-02-scrolled.png`
- `docs/showcase/assets/happy-03-add-to-cart.png`
- `docs/showcase/assets/happy-04-orders-tab.png`
- `docs/showcase/assets/happy-05-cart.png`
- `docs/showcase/assets/interruption-01-before-home.png`
- `docs/showcase/assets/interruption-02-launcher.png`
- `docs/showcase/assets/interruption-03-recovered.png`
- `docs/showcase/assets/happy-preview.gif`
- `docs/showcase/assets/interruption-preview.gif`
