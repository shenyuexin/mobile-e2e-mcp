# Phase 36 Plan: Governed Agent Mobile Control Proof

## Goal

Turn the selected Phase 35 wedge, AI-safe mobile device control via MCP, into a concrete proof artifact that can be run locally and reviewed without requiring a live device.

## Scope

- Add a runnable proof script that compares a minimal custom adb wrapper against the existing MCP harness control plane.
- Exercise the governed path: `describe_capabilities`, `start_session`, `perform_action_with_evidence`, optional remediation lookup, and `end_session`.
- Prove the most important wedge claim: an interactive action under a read-only policy returns structured `POLICY_DENIED` inside an auditable session.
- Generate a timestamped proof bundle with machine-readable JSON and a human-readable report.
- Document the proof entrypoint and boundaries under `docs/showcase`.

## Non-Goals

- Do not reposition the README or marketing copy yet.
- Do not claim live-device execution fidelity from a dry-run proof.
- Do not treat generic failure-remediation as proven for policy-denial guidance unless the tool result supports it.

## Verification

- Run `pnpm run proof:governed-agent-mobile-control`.
- Confirm the generated `harness-run.json` records `policyDenied: true`.
- Confirm `comparison.json` captures residual gaps when present instead of overstating the remediation path.
- Run JSON/script syntax and whitespace checks before commit.
