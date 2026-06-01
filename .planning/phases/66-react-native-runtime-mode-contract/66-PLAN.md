# Phase 66 Implementation Plan: React Native Runtime Mode Contract

**Goal:** Make RN runtime mode prerequisites explicit for Expo Go, Expo dev-client, bare debug, and bare release.

**Architecture:** Add `react-native-runtime-contract/v1` as a machine-readable runtime-mode matrix and integrate the selected mode into RN readiness so Metro/debug target, entry, artifact, and selector expectations are not hidden behind a generic "RN support" label.

**Scope**

- Create runtime mode contract generator/validator/tests.
- Add committed JSON/Markdown evidence.
- Extend RN readiness with a `runtimeMode` field and `runtime-mode` check.
- Preserve blocked fixture behavior.

**Out of Scope**

- Invoking Expo CLI, Android Studio, or native build tools.
- Starting Metro automatically.
- Claiming release-mode JS debugger availability.

**Read-First Context**

- `scripts/showcase/react-native-readiness.ts`
- `configs/profiles/react-native.yaml`
- `docs/strategy/react-native-capability-review.zh-CN.md`

**Checklist**

- [ ] Implement runtime contract matrix.
- [ ] Add tests for mode-specific prerequisites.
- [ ] Add package scripts and committed evidence.
- [ ] Wire selected runtime mode into readiness output and validation.
- [ ] Write summary and verification artifacts.

**Verification**

- `pnpm run test:react-native-runtime-contract`
- `pnpm run generate:react-native-runtime-contract`
- `pnpm run validate:react-native-runtime-contract`
- `pnpm run test:react-native-readiness`
- `pnpm run validate:react-native-readiness`

**Acceptance Criteria**

- Every runtime mode states Metro, debug target, app entry, artifact, and support caveats.
- Readiness output includes selected runtime mode and runtime-mode check.
- Release mode does not require Metro debug target as a success prerequisite.
