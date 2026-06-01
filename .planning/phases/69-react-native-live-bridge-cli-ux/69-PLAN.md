# Phase 69 Implementation Plan: React Native Live Bridge CLI UX

**Goal:** Make the RN live bridge usable from the developer-facing command line without relying on hidden environment variables.

**Architecture:** Extend `scripts/showcase/react-native-one-command.ts` with explicit CLI parsing for run id, output directory, live bridge enablement, bridge output directory, bridge run id, and mobile-change readiness contract path. Keep default generate/validate scripts writing committed fixture evidence, while ad-hoc live runs can write to `output/**`.

**Scope**

- Add `--live-bridge` / `--live` flags to `verify:react-native-change`.
- Add `--run-id=`, `--output-dir=`, `--bridge-run-id=`, `--bridge-output-dir=`, and `--contract=` support.
- Preserve blocked-safe default fixture behavior.
- Add tests for argument parsing and custom output path behavior.
- Document the command in showcase docs and planning artifacts.

**Out of Scope**

- Producing live success without a connected device.
- Starting Metro or installing apps.
- Replacing the mobile-change live verification runner.

**Verification**

- `pnpm run test:react-native-one-command`
- `pnpm run generate:react-native-one-command`
- `pnpm run validate:react-native-one-command`
- `git diff --check`

**Acceptance Criteria**

- `verify:react-native-change -- --live-bridge` enables the explicit bridge path.
- Custom output paths do not disturb committed fixture evidence.
- Default package generate/validate behavior stays stable.
