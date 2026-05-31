# CI Evidence and Boundary Guide

This page is the fixed entry for CI execution evidence referenced by `README.md` and `README.zh-CN.md`.

## Where to view the latest CI runs

- CI workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml
- Platform smoke workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml
- Real-device acceptance workflow page: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml

## What evidence CI provides

For each run of `CI` (`.github/workflows/ci.yml`):

1. Job logs for `unit-and-typecheck` and `dry-run-smoke`
2. Dedicated `explorer-evidence` job that validates the committed Android physical-device Explorer artifact contract
3. Probe dry-run contract validation for Android + iOS simulator probe scripts
4. `dry-run-smoke` also validates committed governed-control evidence contracts, the compact governed evidence brief, the PR-ready evidence summary, the one-command mobile change UX, the AUT readiness contract scaffold, the repo-owned app success candidate, the fixture-backed mobile change verification bundle, the controlled readiness failure packet, the PR/agent handoff, the live-proof readiness preflight, the Android Settings success-lane recipe, the tracked Android live evidence, and the live-proof intake gate through `pnpm run validate:governed-control-evidence`, `pnpm run validate:governed-business-app-evidence`, `pnpm run validate:governed-business-app-comparison`, `pnpm run validate:governed-policy-escalation-evidence`, `pnpm run validate:governed-evidence-brief`, `pnpm run validate:governed-pr-evidence-summary`, `pnpm run test:mobile-change-one-command`, `pnpm run validate:mobile-change-readiness-contract`, `pnpm run validate:mobile-change-repo-app-success-candidate`, `pnpm run validate:mobile-change-verification`, `pnpm run validate:mobile-change-readiness-failure`, `pnpm run validate:mobile-change-handoff`, `pnpm run validate:mobile-change-device-readiness`, `pnpm run validate:mobile-change-live-settings-lane`, `pnpm run validate:mobile-change-live-android-evidence`, and `pnpm run validate:mobile-change-live-proof-intake`
5. Uploaded metadata artifacts:
   - `ci-unit-typecheck-metadata`
   - `ci-dry-run-smoke-metadata`
   - `ci-explorer-evidence-metadata`
   - `ci-probe-dry-run-metadata`
6. Uploaded Explorer evidence report artifact:
   - `ci-android-explorer-evidence-<run_id>`
7. Job-level step summary with:
   - job status
   - run URL
   - artifact names
   - boundary reminder

For each run of `Platform Smoke` (`.github/workflows/platform-smoke.yml`):

1. iOS simulator Maestro baseline lane (`flows/samples/ci/ios-settings-smoke.yaml`)
2. Android emulator Maestro baseline lane (`flows/samples/ci/android-settings-smoke.yaml`)
3. Uploaded debug artifacts for each lane under `output/evidence/platform-smoke/**`
4. Job summaries that explicitly describe baseline scope vs real-device acceptance scope

For each run of `Real Device Acceptance` (`.github/workflows/real-device-acceptance.yml`):

1. Dry-run baseline (`validate:phase3-samples`) on Ubuntu
2. Self-hosted macOS compatibility matrix + acceptance evidence artifacts
3. Quality gate: workflow fails when any expected lane is missing/`NO_DATA`, or any lane status is `NO_GO` in `output/reports/phase-sample-report.json`
4. Lane semantics:
    - Phase 1 lanes (`react-native-ios`, `react-native-android`) are acceptance backbone lanes in this workflow.
    - Phase 2 now defines a dedicated React Native Android acceptance entrypoint: `pnpm run validate:phase2-rn-android-acceptance`.
    - Phase 3 framework-profile lanes are legacy sample-profile compatibility lanes (`flutter-android`, `native-android`, `native-ios` when enabled).
    - The first framework-profile acceptance proof in the shared runner/report path is Flutter Android; Flutter iOS is not in that shared acceptance lane today.

## CI boundary (important)

- Ubuntu CI validates **buildability, type-safety, and smoke-level tool behavior**.
- `explorer-evidence` is an offline contract check over the committed Android physical-device Explorer artifact. It validates artifact presence, app/platform/mode, pages/depth/failure metrics, entry probe evidence, and app-switch recovery logs. It does not rerun a phone.
- `validate:governed-control-evidence` is an offline contract check over the committed compact vivo governed-control evidence. It validates that live inspection, read-only policy denial, and structured remediation were observed together. It does not rerun a phone.
- `validate:governed-business-app-evidence` is an offline contract check over the committed compact vivo business-app evidence. It validates that setup launch, read-only app inspection, policy denial, and structured remediation were observed together. It does not rerun a phone.
- `validate:governed-business-app-comparison` is an offline grounding check for the adb/Maestro/harness comparison. It keeps the comparison tied to tracked evidence and prevents broad replacement claims.
- `validate:governed-policy-escalation-evidence` is an offline contract check over the committed dry-run escalation evidence. It validates read-only denial, governance remediation, and interactive retry semantics, but it does not prove physical-device launch fidelity.
- `validate:governed-evidence-brief` is an offline grounding check for the compact developer/AI-facing brief. It keeps the current practical-use verdict tied to tracked Settings evidence, business-app evidence, and the comparison boundary.
- `test:governed-pr-evidence-summary` verifies the generator can be imported without write/log side effects and keeps the compact PR comment sections stable. `validate:governed-pr-evidence-summary` is the offline drift check for the PR-ready Markdown/JSON evidence summary generated from the governed evidence brief.
- `test:mobile-change-verification` verifies the mobile verification bundle, failure packet, and realistic scenario index builders. `validate:mobile-change-verification` is an offline drift check over the committed fixture evidence; it proves the workflow contract and debugging artifact shape, not live-device fidelity.
- `test:mobile-change-one-command` verifies the one-command developer UX across fixture, live-blocked, intake-rejected, and live-success-shaped outcomes. It preserves lower-level proof labels rather than turning all paths into success.
- `validate:mobile-change-readiness-contract` is an offline drift check for the scaffolded AUT readiness contract. It verifies deterministic entry, reset semantics, and ready-state signals before live proof relies on app-specific assumptions.
- `validate:mobile-change-repo-app-success-candidate` is an offline drift check for the repo-owned demo Android app success candidate. It verifies the APK artifact and deterministic contract are present, while keeping no-device output blocked until a real or explicitly labeled emulator run passes intake.
- `validate:mobile-change-device-readiness` is an offline drift check for the controlled live-proof preflight. It verifies structured device blocker diagnostics, optional app artifact, and readiness-contract checks are reported before UI-affecting live actions; the committed no-device blocker does not prove physical-device fidelity.
- `proof:mobile-change-verification:live` is an optional local/self-hosted proof path over existing governed MCP tools. It writes timestamped live output when a device is available and can write structured no-device output with `M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1`; normal Ubuntu CI does not require this command.
- `validate:mobile-change-live-settings-lane` is an offline drift check for the Android Settings no-APK success-lane recipe. It keeps the runnable command stable, but it is not live success evidence until executed on a connected device and accepted by the intake gate.
- `validate:mobile-change-live-android-evidence` is an offline drift check for the tracked Android device `10AEA40Z3Y000R5` live app-readiness failure evidence. It proves device discovery, governed session start, UI evidence collection, and actionable failure classification, not a successful app verification.
- `validate:mobile-change-live-proof-intake` is an offline drift check for the live-output promotion gate. It now points at the tracked Android live evidence, while tests still reject controlled, fixture, and no-device artifacts from being promoted as physical-device proof.
- `validate:mobile-change-readiness-failure` is an offline drift check for a controlled live-runner-derived app readiness failure packet. It does not prove physical-device fidelity, but it keeps the failure packet shape grounded in the live runner path.
- `validate:mobile-change-handoff` is an offline drift check for the PR/agent-ready handoff summary generated from the readiness failure bundle and packet. It does not post to GitHub or alter CI status.
- Probe dry-run validates Android + iOS simulator probe structure without device dependencies.
- Platform smoke validates simulator/emulator toolchain baseline only.
- Ubuntu CI and platform smoke do **not** fully prove real-device execution fidelity.
- `validate:phase2-rn-android` is the clean-clone prerequisite gate for the default RN Android acceptance lane and must pass before self-hosted acceptance is meaningful.
- `validate:phase3-samples` preserves profile/matrix contract truth for Native + Flutter `validated-sample-baseline` and dry-run CLI semantics, but it is still smoke-level (not acceptance proof).
- `validate:phase2-rn-android-acceptance` is the smallest dedicated command path for the default Phase 02 framework lane; it reuses the shared report generators but isolates the RN Android lane as an explicit entrypoint.
- `validate:phase3-real-run` remains a compatibility wrapper for historical sample lanes. It is useful for report continuity, but Explorer/probe artifacts are the current primary real-device tool-surface proof.
- Real-device confidence should be validated through Explorer/probe artifacts first, then historical showcase assets when reviewing demos:
  - `artifacts/explorer/android-full/2026-04-28T03-38-20/` for Android physical-device Explorer evidence
  - `docs/showcase/evidence/governed-control-vivo-2026-05-23/` plus `pnpm run validate:governed-control-evidence` for governed-control vivo evidence
  - `docs/showcase/evidence/governed-business-app-vivo-2026-05-24/` plus `pnpm run validate:governed-business-app-evidence` and `pnpm run validate:governed-business-app-comparison` for governed business-app vivo evidence
  - `docs/showcase/evidence/governed-policy-escalation-dry-run-2026-05-25/` plus `pnpm run validate:governed-policy-escalation-evidence` for policy escalation dry-run evidence
  - `docs/showcase/evidence/governed-control-brief/brief.md` plus `pnpm run validate:governed-evidence-brief` for the current practical-use evidence brief
  - `docs/showcase/evidence/governed-control-brief/pr-comment.md` plus `pnpm run validate:governed-pr-evidence-summary` for the PR-ready evidence summary
  - `docs/showcase/evidence/mobile-change-verification-fixture/` plus `pnpm run validate:mobile-change-verification` for the fixture-backed mobile change verification workflow, failure packet, and scenario index
  - `docs/showcase/evidence/mobile-change-device-readiness/` plus `pnpm run validate:mobile-change-device-readiness` for the live-proof preflight readiness blocker
  - `docs/showcase/evidence/mobile-change-live-settings-lane/` plus `pnpm run validate:mobile-change-live-settings-lane` for the Android Settings no-APK success-lane recipe
  - `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/` plus `pnpm run validate:mobile-change-live-android-evidence` for tracked Android live app-readiness failure evidence
  - `docs/showcase/evidence/mobile-change-live-proof-intake/` plus `pnpm run validate:mobile-change-live-proof-intake` for the live proof promotion gate
  - `docs/showcase/evidence/mobile-change-repo-app-success-candidate/` plus `pnpm run validate:mobile-change-repo-app-success-candidate` for the repo-owned Android app success candidate and its no-device blocker boundary
  - `docs/showcase/evidence/mobile-change-readiness-failure/` plus `pnpm run validate:mobile-change-readiness-failure` for the controlled app-readiness failure packet
  - `docs/showcase/evidence/mobile-change-readiness-failure/handoff.md` plus `pnpm run validate:mobile-change-handoff` for the PR/agent handoff summary
  - `pnpm run validate:android-tool-probe` and `pnpm run validate:ios-tool-probe`
  - `real-device-acceptance` workflow artifacts and summaries
  - `docs/showcase/README.md`
  - `docs/showcase/demo-playbook.zh-CN.md`

## Quick review checklist for maintainers

- CI run is green on `main` and target PR branch.
- Platform smoke run is green and both lane summaries are present.
- If real-device acceptance ran, no platform should show `NO_GO` in `phase-sample-report.json`.
- If real-device acceptance ran, verify docs/summaries keep lane boundaries explicit: smoke vs acceptance, framework-profile sample lanes vs React Native acceptance backbone lanes.
- Boundary statements remain visible in this document and workflow summaries.
