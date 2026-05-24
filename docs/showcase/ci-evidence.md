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
4. `dry-run-smoke` also validates committed vivo governed-control evidence contracts through `pnpm run validate:governed-control-evidence`, `pnpm run validate:governed-business-app-evidence`, and `pnpm run validate:governed-business-app-comparison`
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
