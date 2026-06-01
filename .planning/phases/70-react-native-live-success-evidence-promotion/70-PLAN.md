# Phase 70 Implementation Plan: React Native Live Success Evidence Promotion

**Goal:** Add a promotion gate for RN live success evidence so real RN success can be tracked when available, while the current no-device environment produces an explicit blocked candidate.

**Architecture:** Create `react-native-live-success-candidate/v1` as a small evidence artifact that reads `react-native-one-command/v2`, checks the live bridge result, proof level, verification/intake evidence paths, blockers, and boundaries, then emits a promotable or blocked candidate. This keeps promotion separate from execution and prevents blocked or fixture output from being mislabeled as RN success.

**Scope**

- Add candidate builder, renderer, validator, tests, package scripts, and committed evidence.
- Default candidate consumes `docs/showcase/evidence/react-native-one-command/result.json`.
- Integrate the candidate validator into `test:smoke`.
- Document the promotion boundary in showcase and RN strategy docs.

**Out of Scope**

- Starting Metro or installing/building RN apps.
- Producing live success without a connected device/emulator.
- Copying arbitrary output into promoted evidence automatically.

**Verification**

- `pnpm run test:react-native-live-success-candidate`
- `pnpm run generate:react-native-live-success-candidate`
- `pnpm run validate:react-native-live-success-candidate`
- `git diff --check`

**Acceptance Criteria**

- Blocked RN one-command output produces `blocked_before_rn_live_success`.
- Physical/emulator live bridge output with verification and intake evidence can produce `rn_live_success_promoted`.
- Candidate boundaries state that blocked output is not app success.
