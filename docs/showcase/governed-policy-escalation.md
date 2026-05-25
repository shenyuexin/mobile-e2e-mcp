# Governed Policy Escalation Proof

This proof closes the next practical gap after read-only denial: an AI agent should be able to stop at a policy boundary, receive remediation, then retry only after an explicit policy-profile change.

## Workflow

```text
start_session(read-only)
  -> perform_action_with_evidence(launch_app)
  -> POLICY_DENIED
  -> suggest_known_remediation
  -> end_session
  -> start_session(interactive)
  -> perform_action_with_evidence(launch_app)
  -> OK
  -> end_session
```

The action is intentionally `launch_app`. It is side-effecting enough to exercise policy, but safer and more deterministic than tapping a business button whose text or validation state may vary.

## Run

For live Android evidence, connect a device or emulator and run:

```bash
pnpm run proof:governed-policy-escalation
```

For CI-safe policy-contract evidence without a connected device:

```bash
M2E_POLICY_ESCALATION_DRY_RUN=1 pnpm run proof:governed-policy-escalation
```

Optional environment variables:

- `M2E_DEVICE_ID` — select a specific Android device for live mode.
- `M2E_POLICY_ESCALATION_APP_ID` — override the target app id. Defaults to `com.android.settings`.
- `M2E_POLICY_ESCALATION_DRY_RUN=1` — run the policy mechanics without requiring a real device.
- `M2E_POLICY_ESCALATION_ALLOW_NO_DEVICE=1` — write a `device_unavailable` bundle without failing live mode.

The command writes a timestamped proof bundle under:

```text
output/showcase/governed-policy-escalation/<run-id>/
```

Expected files:

- `policy-escalation-proof.json` — machine-readable denial, remediation, escalation, and retry results.
- `report.md` — human-readable proof summary.

## What This Proves

- `read-only` denies the side-effecting action before execution.
- `suggest_known_remediation` remains available after the denial.
- The retry does not bypass policy; it starts a new `interactive` session.
- The same action is allowed under the explicit interactive profile.

## Boundary

The tracked evidence for this phase is dry-run evidence. It proves policy-profile mechanics and structured result semantics, not physical-device launch fidelity. Live-device escalation remains the next evidence upgrade once `adb devices -l` shows an available Android device.

## Verified Evidence

- [governed-policy-escalation-dry-run-2026-05-25/report.md](./evidence/governed-policy-escalation-dry-run-2026-05-25/report.md)
- [governed-policy-escalation-dry-run-2026-05-25/summary.json](./evidence/governed-policy-escalation-dry-run-2026-05-25/summary.json)

Validate it offline:

```bash
pnpm run validate:governed-policy-escalation-evidence
```
