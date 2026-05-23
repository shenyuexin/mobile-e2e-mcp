# Governed Agent Mobile Control Proof

This proof targets the selected practicality wedge: **AI-safe mobile device control via MCP**.

It compares a minimal custom adb wrapper against the harness path:

```text
describe_capabilities -> start_session(read-only) -> perform_action_with_evidence(dry-run tap) -> suggest_known_remediation -> end_session
```

The expected harness result is a structured `POLICY_DENIED` response for the interactive action. That is the point: an agent gets a machine-readable governance boundary instead of a raw command log.

The remediation step is intentionally kept in the proof chain as a boundary check. If policy denial is not converted into a normal failure record, the report records that as a residual gap instead of treating remediation as proven.

## Run

```bash
pnpm run proof:governed-agent-mobile-control
```

The command writes a timestamped proof bundle under:

```text
output/showcase/governed-agent-mobile-control/<run-id>/
```

Expected files:

- `baseline-wrapper.json` — what a small custom adb wrapper can represent.
- `harness-run.json` — the harness tool results and session artifacts.
- `comparison.json` — the proof verdict and differentiators.
- `report.md` — human-readable proof summary.

## What This Proves

- A raw wrapper can log a command, but governance remains convention-based.
- The harness can return policy denial as a structured tool result.
- The run is tied to a session with persisted evidence references.
- Capability boundaries are queried before action.
- The current generic failure-remediation path is not the same as governance-denial guidance, so the proof surfaces that product gap explicitly.

## Boundary

This is a dry-run proof. It does not prove live-device execution fidelity. It proves the selected wedge's control-plane value: policy-bounded, session-oriented, evidence-rich mobile action mediation for agents.
