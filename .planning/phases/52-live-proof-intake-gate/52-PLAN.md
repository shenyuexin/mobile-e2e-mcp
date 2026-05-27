# Phase 52 Plan: Live Proof Intake Gate

## Objective

Add an offline intake gate that validates a live mobile change verification output directory before anyone promotes it into tracked showcase evidence.

## Scope

- Classify live runner output as promotable or non-promotable.
- Reject fixture, controlled, and no-device outputs as physical-device proof.
- Generate a compact JSON/Markdown intake artifact.
- Add tests, validation scripts, smoke wiring, docs, and planning updates.

## Out of Scope

- Running a device locally.
- Automatically copying live proof into final tracked evidence.
- Posting to GitHub or changing CI status.
- Expanding support claims based on intake alone.

## Read-First Context

- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `scripts/showcase/mobile-change-verification.ts`
- `scripts/showcase/generate-mobile-change-live-proof-intake.ts`
- `docs/showcase/ci-evidence.md`

## Actionable Checklist

- [x] Write failing tests for promotable live output, no-device output, fixture output, and controlled output.
- [x] Implement intake classification and Markdown rendering.
- [x] Add validator tests and committed controlled-output blocker evidence.
- [x] Wire scripts into `package.json` and `test:smoke`.
- [x] Update README/showcase docs and planning state.

## Verification Approach

- Run focused intake tests.
- Run intake validator against committed evidence.
- Run typecheck and smoke validation.

## Acceptance Criteria

- Successful live-device-shaped output is classified as `promotable_live_proof_candidate`.
- `device_unavailable`, fixture, and controlled outputs are classified as `not_promotable_live_proof`.
- The committed intake artifact clearly rejects controlled output and does not claim physical-device fidelity.
- Smoke validation covers the intake gate.

## Success Criteria

Agents have a reliable gate between self-hosted live proof generation and tracked evidence promotion, reducing the risk of overclaiming controlled or no-device artifacts.
