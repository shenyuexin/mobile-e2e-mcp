# Phase 49 Plan: Real App Failure Packet Proof

## Goal

Capture at least one real or live-run-derived app failure as a committed proof artifact so the failure packet demonstrates debugging value beyond fixtures.

## Practicality Bet

Failure packets are only compelling if they help explain a real mobile failure mode, such as readiness timeout, selector mismatch, permission interruption, or network policy failure.

## Work Items

1. Choose a bounded failure scenario from the live runner output or demo app.
2. Generate a failure packet through the Phase 48 live runner path.
3. Commit a compact evidence artifact only if it is reproducible and its boundaries are clear.
4. Update validators/docs to keep real failure proof separate from fixture evidence.

## Boundary

Do not block normal CI on devices. Real failure proof may be self-hosted/manual, with offline validation over committed artifacts.

## Verification

- Failure packet validator over committed real/live-run artifact
- Existing mobile change verification tests
- `git diff --check`

## Success Criteria

- At least one real or live-run-derived failure packet exists.
- The packet identifies category, reason code, evidence, and next action.
- Docs do not overclaim beyond the observed scenario.
