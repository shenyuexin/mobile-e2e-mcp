# Showcase Index

This folder contains reproducible, real-device demo evidence used by README.

## Failure-intelligence demo

- `docs/showcase/failure-intelligence-demo.md`

## Governed agent mobile control proof

- `docs/showcase/governed-quickstart.md`
- `docs/showcase/governed-agent-mobile-control.md`
- `docs/showcase/governed-agent-mobile-control-live.md`
- `docs/showcase/governed-business-app-workflow.md`
- `docs/showcase/governed-policy-escalation.md`
- Live preflight: `pnpm run proof:governed-agent-mobile-control:preflight`
- Quickstart readiness: `pnpm run quickstart:governed-control`
- Business app workflow: `pnpm run proof:governed-business-app-workflow`
- Policy escalation proof: `pnpm run proof:governed-policy-escalation`
- Tracked vivo evidence: `docs/showcase/evidence/governed-control-vivo-2026-05-23/`
- Tracked business app vivo evidence: `docs/showcase/evidence/governed-business-app-vivo-2026-05-24/`
- Business app alternative comparison: `docs/showcase/evidence/governed-business-app-vivo-2026-05-24/comparison.md`
- Policy escalation dry-run evidence: `docs/showcase/evidence/governed-policy-escalation-dry-run-2026-05-25/`
- Governed evidence brief: `docs/showcase/evidence/governed-control-brief/brief.md`
- Governed PR evidence summary: `docs/showcase/evidence/governed-control-brief/pr-comment.md`
- Mobile change verification fixture: `docs/showcase/evidence/mobile-change-verification-fixture/report.md`
- One-command mobile change verification: `pnpm run verify:mobile-change`
- Actionable failure packet fixture: `docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.md`
- Realistic scenario index fixture: `docs/showcase/evidence/mobile-change-verification-fixture/scenario-index.md`
- Mobile change verification command: `pnpm run proof:mobile-change-verification`
- Mobile change device readiness preflight: `docs/showcase/evidence/mobile-change-device-readiness/report.md`
- Mobile change device readiness command: `pnpm run generate:mobile-change-device-readiness`
- Optional live mobile change verification command: `pnpm run proof:mobile-change-verification:live`
- Android Settings live success lane: `docs/showcase/evidence/mobile-change-live-settings-lane/lane.md`
- Android Settings live success lane command: `pnpm run proof:mobile-change-verification:live-settings`
- Android live mobile change evidence: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/report.md`
- Android live mobile change evidence check: `pnpm run validate:mobile-change-live-android-evidence`
- Mobile change live proof intake: `docs/showcase/evidence/mobile-change-live-proof-intake/intake.md`
- Mobile change live proof intake command: `pnpm run intake:mobile-change-live-proof`
- Controlled readiness failure proof: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.md`
- Controlled readiness failure command: `pnpm run proof:mobile-change-verification:readiness-failure`
- Mobile change handoff summary: `docs/showcase/evidence/mobile-change-readiness-failure/handoff.md`
- Mobile change handoff command: `pnpm run generate:mobile-change-handoff`
- Mobile change verification contract check: `pnpm run validate:mobile-change-verification`

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

- `CI / dry-run-smoke`: runs `pnpm test:smoke` for deterministic dry-run contracts, committed governed-control vivo evidence contracts, and the governed evidence brief.
- `CI / explorer-evidence`: validates the committed Android physical-device Explorer artifact contract and uploads `ci-android-explorer-evidence-<run_id>`.
- `CI / probe-dry-run`: validates Android + iOS simulator probe dry-run metadata without requiring devices.
- `Platform Smoke`: runs simulator/emulator baseline Maestro flows.
- `Real Device Acceptance`: runs self-hosted acceptance lanes and report quality gates.

See `docs/showcase/ci-evidence.md` for the current proof levels and boundaries.

## Evidence contract and proof levels

- Smoke proof (`pnpm test:smoke`, dry-run validators, Ubuntu CI): verifies deterministic contracts and dry-run behavior, not real-device fidelity.
- Explorer evidence proof (`CI / explorer-evidence`): verifies the committed Android physical-device Explorer artifact remains present and internally consistent; it does not rerun a device.
- Governed-control evidence proof (`pnpm run validate:governed-control-evidence`): verifies the committed compact vivo evidence still proves live inspection, read-only policy denial, and structured remediation together; it does not rerun a device.
- Business-app governed workflow proof (`pnpm run validate:governed-business-app-evidence`): verifies the committed compact vivo evidence still proves setup launch, read-only business app inspection, policy denial, and governance remediation together; it does not rerun a device.
- Business-app comparison proof (`pnpm run validate:governed-business-app-comparison`): verifies the committed comparison stays grounded in the business-app evidence and keeps the Appium/Maestro/adb boundary narrow.
- Policy escalation proof (`pnpm run validate:governed-policy-escalation-evidence`): verifies the dry-run escalation evidence still shows read-only denial, governance remediation, and interactive retry without claiming live-device fidelity.
- Governed evidence brief proof (`pnpm run validate:governed-evidence-brief`): verifies the compact brief stays grounded in the tracked Settings evidence, business-app evidence, and alternative comparison.
- Governed PR evidence summary proof (`pnpm run test:governed-pr-evidence-summary` + `pnpm run validate:governed-pr-evidence-summary`): verifies the generator is import-safe and the PR-ready Markdown/JSON summary stays generated from the governed evidence brief.
- One-command mobile change proof (`pnpm run test:mobile-change-one-command`): verifies the primary developer-facing entrypoint can produce a compact verdict across fixture, live-blocked, intake-rejected, and live-success-shaped outcomes. It orchestrates lower-level proof steps and preserves their proof-level boundaries.
- Mobile change verification proof (`pnpm run test:mobile-change-verification` + `pnpm run validate:mobile-change-verification`): verifies the fixture-backed workflow bundle, failure packet, and realistic scenario index stay schema-backed and PR-ready. It does not rerun a device.
- Mobile change device readiness proof (`pnpm run test:mobile-change-device-readiness` + `pnpm run validate:mobile-change-device-readiness`): verifies the live-proof preflight reports structured diagnostics for device availability, authorization/offline/requested-device blockers, app artifact availability, and deterministic readiness-contract presence before UI-affecting live actions. The committed proof is a controlled no-device blocker, not physical-device fidelity.
- Live mobile change verification proof (`pnpm run proof:mobile-change-verification:live`): uses existing governed MCP tools to select a device, start a session, launch the app, inspect readiness, and write a timestamped bundle under `output/showcase/mobile-change-verification-live/`. It is optional and device-dependent; no-device runs can be captured as structured environment failure with `M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1`.
- Android Settings live success lane (`pnpm run test:mobile-change-live-settings-lane` + `pnpm run validate:mobile-change-live-settings-lane`): verifies a no-APK success-lane recipe targeting the built-in `com.android.settings` app. It is a runnable recipe, not success evidence until the command executes on a connected device and the resulting bundle passes intake.
- Android live mobile change evidence (`pnpm run test:mobile-change-live-android-evidence` + `pnpm run validate:mobile-change-live-android-evidence`): verifies the tracked Android device `10AEA40Z3Y000R5` run discovered the device, started a governed session, collected UI evidence, and produced an app-readiness failure packet. The app itself did not verify successfully because launch/readiness failed.
- Mobile change live proof intake (`pnpm run test:mobile-change-live-proof-intake` + `pnpm run validate:mobile-change-live-proof-intake`): verifies a live runner output directory is promotable before it becomes tracked evidence. The committed intake now points at the tracked Android live evidence; tests still reject controlled, fixture, and no-device artifacts from being mislabeled as physical-device proof.
- Controlled readiness failure proof (`pnpm run validate:mobile-change-readiness-failure`): verifies an app-readiness failure packet produced through the live runner contract with a controlled invoker. It proves failure packet usefulness for readiness mismatch, not physical-device fidelity.
- Mobile change handoff proof (`pnpm run test:mobile-change-handoff` + `pnpm run validate:mobile-change-handoff`): verifies the PR/agent-ready handoff summary stays generated from the readiness failure bundle and failure packet. It does not post comments or change CI status by itself.
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
