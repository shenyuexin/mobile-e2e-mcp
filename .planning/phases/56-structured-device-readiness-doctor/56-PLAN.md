---
phase: 56-structured-device-readiness-doctor
plan: 01
title: Structured device readiness doctor
status: planned
summary_file: 56-01-SUMMARY.md
verify_file: 56-01-VERIFY.md
requirements:
  - DEV-EFF-02
  - ENV-READINESS-01
formal_truth_owners:
  - packages/adapter-maestro/src/doctor-runtime.ts
  - scripts/showcase/mobile-change-device-readiness.ts
  - package.json
---

# Phase 56 Plan 01

## Goal

### Problem
When a device is unavailable, unauthorized, offline, or missing app readiness prerequisites, developers still spend time manually interpreting ADB/Xcode/environment symptoms.

### Expected Outcome
- [ ] Device readiness output classifies blocker type and likely cause.
- [ ] Android and iOS readiness checks produce machine-readable next actions.
- [ ] The one-command verification flow surfaces these diagnostics directly.

### Non-goals
- Installing platform tooling automatically.
- Running destructive ADB resets.
- Guaranteeing recovery on every local machine.

## Plan

### Strategy
Extend the readiness preflight into a structured doctor that distinguishes common environment blockers while remaining read-only by default.

### Read First
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/guides/ui-stabilization-timing.md`
- `packages/adapter-maestro/src/doctor-runtime.ts`
- `scripts/showcase/mobile-change-device-readiness.ts`

### Task Breakdown
1. Define blocker categories such as no_device, unauthorized, offline, wrong_device, missing_app, missing_readiness_contract, and platform_tool_unavailable.
2. Add fixture-backed tests for each blocker category.
3. Add read-only probes for Android and available iOS checks.
4. Thread doctor summaries into the Phase 55 command output.

### Risks / Unknowns
- Host tool output varies by platform and version.
- Some iOS diagnostics may be conditional on installed Xcode tooling.

### Done Criteria
- [ ] No-device and unauthorized-device outcomes are distinguishable.
- [ ] Output includes exact next actions and evidence snippets.
- [ ] Doctor checks are safe to run in normal CI without a device.

## Implement

### Planned Changes
- `scripts/showcase/mobile-change-device-readiness.ts` — structured blocker classification.
- `packages/adapter-maestro/src/doctor-runtime.ts` — reuse or expose existing platform readiness signals where appropriate.
- `package.json` — add focused test/validation scripts if needed.

### Key Decisions To Preserve
- Readiness doctor output is diagnostic, not proof of app correctness.
- Mutating recovery actions require explicit future opt-in.

## Verify

### Test Cases
- [ ] No device.
- [ ] Unauthorized Android device fixture.
- [ ] Offline Android device fixture.
- [ ] Missing app artifact.
- [ ] Missing readiness contract.

### Verification Commands
```bash
pnpm run test:mobile-change-device-readiness
pnpm run validate:mobile-change-device-readiness
pnpm typecheck
pnpm run test:smoke
```

### Acceptance Criteria
- Developer-facing output explains why live verification cannot start and what to do next.

### Success Criteria
- A blocked live run becomes a short fix list rather than a manual environment investigation.
