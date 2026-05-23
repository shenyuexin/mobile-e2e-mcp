# Governed Agent Mobile Control Live Proof

This proof is the live-device companion to the dry-run [Governed Agent Mobile Control Proof](./governed-agent-mobile-control.md).

It exercises the same selected wedge, **AI-safe mobile device control via MCP**, but adds real Android UI inspection before the read-only policy denial:

```text
list_devices -> describe_capabilities -> start_session(read-only) -> inspect_ui -> get_screen_summary -> perform_action_with_evidence -> suggest_known_remediation -> end_session
```

## Run

Connect an Android device or emulator that appears in `adb devices`, then run:

```bash
pnpm run proof:governed-agent-mobile-control:preflight
```

If preflight is ready, capture the live proof:

```bash
pnpm run proof:governed-agent-mobile-control:live
```

Optional environment variables:

- `M2E_DEVICE_ID` — select a specific Android device.
- `M2E_APP_ID` — annotate the session with a target app ID; defaults to `com.android.settings`.
- `M2E_RUNNER_PROFILE` — defaults to `native_android`.
- `M2E_LIVE_PROOF_ALLOW_NO_DEVICE=1` — write a `DEVICE_UNAVAILABLE` proof bundle without failing the process, useful for doc or CI smoke checks.

The command writes a timestamped proof bundle under:

```text
output/showcase/governed-agent-mobile-control-live/<run-id>/
```

Expected files:

- `live-proof.json` — machine-readable step results, selected device, verdict, and evidence flags.
- `report.md` — human-readable proof summary.
- `inspect-ui.xml` — live Android hierarchy capture when a device is available and `inspect_ui` succeeds.

The preflight command writes a separate timestamped bundle under:

```text
output/showcase/governed-agent-mobile-control-preflight/<run-id>/
```

It checks Android device selection, runner capability metadata, and the expected read-only policy boundary before any live proof action is attempted.
If any readiness check fails, the command still writes `preflight.json` and `report.md` with remediation hints, then exits non-zero.

## What This Proves

- A live Android device can be selected through the MCP tool surface instead of an ad hoc wrapper.
- The harness can capture read-only UI evidence before any interactive action.
- A read-only session blocks interactive action with structured `POLICY_DENIED`.
- `suggest_known_remediation` returns governance-specific next steps after the denial.
- Session/audit/evidence artifacts are preserved for review.

## Verified Evidence

The latest tracked physical-device evidence is summarized at:

- [governed-control-vivo-2026-05-23/report.md](./evidence/governed-control-vivo-2026-05-23/report.md)
- [governed-control-vivo-2026-05-23/summary.json](./evidence/governed-control-vivo-2026-05-23/summary.json)

Validate it offline:

```bash
pnpm run validate:governed-control-evidence
```

## Boundary

This proof does not install or launch an app by default. It inspects the current Android screen and then attempts a policy-denied action that should not execute. It proves live read-only observation plus governed action mediation, not full business-flow fidelity.
