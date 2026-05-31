---
phase: 58-repo-owned-app-success-evidence
plan: 01
title: Repo-owned app success evidence
status: planned
summary_file: 58-01-SUMMARY.md
verify_file: 58-01-VERIFY.md
requirements:
  - DEV-EFF-04
  - LIVE-PROOF-02
formal_truth_owners:
  - examples
  - docs/showcase/evidence
  - scripts/showcase
  - package.json
---

# Phase 58 Plan 01

## Goal

### Problem
The project has tracked real-device failure evidence and a Settings success lane, but still lacks a repo-owned app success proof that demonstrates end-to-end developer value.

### Expected Outcome
- [ ] A repo-owned Android app path can be built or selected for live verification.
- [ ] The app has a readiness contract and deterministic success criteria.
- [ ] Successful live output passes intake and is promoted as tracked evidence.

### Non-goals
- iOS parity in this phase.
- Full React Native or Flutter matrix proof.
- Success claims for arbitrary third-party apps.

## Plan

### Strategy
Use the Phase 55 command and Phase 57 readiness contract to produce one credible Android-first successful app verification proof, then promote it through the existing intake gate.

### Read First
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `examples/demo-android-app/README.md`
- `examples/demo-android-app/docs/AUTOMATION.md`
- `scripts/showcase/mobile-change-verification.ts`
- `scripts/showcase/generate-mobile-change-live-proof-intake.ts`

### Task Breakdown
1. Select the repo-owned app target and determine whether build/install is feasible locally.
2. Add or validate readiness contract signals.
3. Run live verification on a connected Android device or clearly labeled emulator.
4. Pass intake and promote the successful evidence bundle.
5. Keep failure evidence available as a separate proof type.

### Risks / Unknowns
- Local Android build tooling may not be ready.
- The available physical device may disappear or require reauthorization.
- The existing demo app may need small automation hooks before it is a reliable AUT.

### Done Criteria
- [ ] Successful live verification evidence exists and passes intake.
- [ ] Evidence paths and proof-level labels are committed.
- [ ] The result is distinguishable from Settings-only success.

## Implement

### Planned Changes
- `examples/**` — only if the selected app needs stable automation hooks.
- `scripts/showcase/**` — live proof path and validator updates.
- `docs/showcase/evidence/**` — tracked successful evidence.
- `package.json` — focused validate/test scripts.

### Key Decisions To Preserve
- Do not label Settings success as AUT success.
- Do not promote failed or blocked live runs as successful proof.

## Verify

### Test Cases
- [ ] App builds or selected artifact exists.
- [ ] App installs and launches.
- [ ] Readiness contract matches.
- [ ] Verification verdict is successful.
- [ ] Intake accepts the bundle.

### Verification Commands
```bash
pnpm run verify:mobile-change
pnpm run intake:mobile-change-live-proof -- <live-output-dir>
pnpm typecheck
pnpm run test:smoke
```

### Acceptance Criteria
- The committed evidence proves successful verification of a repo-owned app path.

### Success Criteria
- The project can show a real mobile app success path, not only governance demos, fixture output, or failure handling.
