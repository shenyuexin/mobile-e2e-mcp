# Phase 67 Implementation Plan: React Native Live Verification Bridge

**Goal:** Upgrade `verify:react-native-change` from readiness/evidence orchestration into a live-capable RN bridge that can call the mobile-change live verification and intake path when prerequisites pass.

**Architecture:** Move RN one-command to `react-native-one-command/v2` with an optional `liveBridge` section. The default fixture remains blocked-safe; live bridge execution is gated by readiness, runtime mode, and an explicit env/CLI switch.

**Scope**

- Extend RN one-command result with bridge mode, bridge stage, live output paths, and proof-level preservation.
- Wire optional mobile-change one-command live execution through dependency injection.
- Add tests for skipped bridge, blocked bridge, and completed bridge candidates.
- Regenerate committed fixture evidence.

**Out of Scope**

- Guaranteeing a live device is available in CI.
- Promoting live success without intake.
- Replacing the underlying mobile-change verification runner.

**Read-First Context**

- `scripts/showcase/react-native-one-command.ts`
- `scripts/showcase/mobile-change-one-command.ts`
- `scripts/showcase/react-native-evidence-pack.ts`

**Checklist**

- [ ] Define `react-native-one-command/v2`.
- [ ] Add bridge stage and live bridge dependency.
- [ ] Add live bridge parse/env gating.
- [ ] Update tests and committed evidence.
- [ ] Write summary and verification artifacts.

**Verification**

- `pnpm run test:react-native-one-command`
- `pnpm run generate:react-native-one-command`
- `pnpm run validate:react-native-one-command`

**Acceptance Criteria**

- Default blocked fixture remains blocked before live.
- Live bridge only starts after RN readiness passes.
- Bridge output preserves mobile-change proof levels and intake verdicts.
