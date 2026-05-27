# Phase 51 Plan: Live Proof Readiness Gate

## Objective

Add a device/app/readiness preflight for the live mobile change verification path so agents can tell whether the environment is ready before invoking UI-affecting live proof commands.

## Scope

- Add a schema-backed preflight summary for device inventory, optional app artifact availability, and deterministic readiness expectations.
- Generate committed controlled no-device evidence for CI-stable validation.
- Add tests and a validator so the preflight cannot drift silently.
- Document the preflight as a readiness gate, not as physical-device proof.

## Out of Scope

- Cloud device farm orchestration.
- New MCP tool surface.
- Replacing the live runner or claiming live-device fidelity from controlled evidence.
- Automatic AUT readiness fixes.

## Read-First Context

- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `scripts/showcase/mobile-change-verification.ts`
- `docs/showcase/ci-evidence.md`
- `README.md`

## Actionable Checklist

- [x] Write failing tests for no-device, ready, and missing-readiness-contract preflight outcomes.
- [x] Implement the preflight builder and Markdown/JSON writer.
- [x] Add validator coverage for committed evidence shape.
- [x] Generate controlled no-device evidence.
- [x] Wire scripts into `package.json` and `test:smoke`.
- [x] Update README/showcase docs and planning state.

## Verification Approach

- Run focused preflight tests.
- Run validator against committed controlled evidence.
- Run mobile-change regression tests.
- Run typecheck and smoke validation.

## Acceptance Criteria

- No-device environments produce `blocked_before_live_verification` with `DEVICE_UNAVAILABLE`.
- Ready environments produce `ready_for_live_mobile_change_verification`.
- Missing readiness expectations block before live proof.
- Committed evidence clearly states it does not claim physical-device proof.
- `test:smoke` includes the preflight checks.

## Success Criteria

The project has a CI-stable readiness gate for the next real device proof attempt, and agents get a structured next action instead of discovering missing devices only after attempting live verification.
