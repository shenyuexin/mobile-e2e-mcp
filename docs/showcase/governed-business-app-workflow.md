# Governed Business App Workflow Proof

This proof moves the governed-control wedge from a system app surface to a real demo business app.

It exercises the workflow a mobile developer actually cares about:

```text
list_devices
  -> start_session(sample-harness-default)
  -> install_app
  -> launch_app
  -> end_session
  -> start_session(read-only)
  -> inspect_ui
  -> get_screen_summary
  -> perform_action_with_evidence
  -> suggest_known_remediation
  -> end_session
```

The setup session is allowed to install and launch the app. The agent-facing session is then switched to `read-only`, so the agent can inspect the app but cannot perform an interactive business action without explicit policy escalation.

## Run

Build or provide the demo APK, connect an Android device or emulator, then run:

```bash
pnpm run proof:governed-business-app-workflow
```

By default the proof uses:

- App ID: `com.epam.mobitru`
- APK: `examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk`
- Runner profile: `native_android`
- Attempted business action text: `Login`

Optional environment variables:

- `M2E_DEVICE_ID` — select a specific Android device.
- `M2E_BUSINESS_APP_ID` — override the business app id.
- `M2E_BUSINESS_APK_PATH` — override the APK path.
- `M2E_BUSINESS_ACTION_TEXT` — override the read-only action target text.
- `M2E_BUSINESS_SKIP_INSTALL=1` — skip APK installation when the app is already installed on the selected device.
- `M2E_BUSINESS_WORKFLOW_ALLOW_NO_DEVICE=1` — write a `device_unavailable` bundle without failing.
- `M2E_BUSINESS_WORKFLOW_ALLOW_MISSING_APK=1` — write an `app_artifact_unavailable` bundle without failing.

The command writes a timestamped proof bundle under:

```text
output/showcase/governed-business-app-workflow/<run-id>/
```

Expected files:

- `business-workflow-proof.json` — machine-readable setup/read-only session results, verdict, and evidence flags.
- `report.md` — human-readable workflow summary.
- `business-app-inspect-ui.xml` — live Android hierarchy capture when a device and app are available.

## What This Proves

- The harness can prepare a real demo app through governed install/launch tools.
- The agent-facing phase can be narrowed to `read-only` after app readiness.
- A live business app screen can be inspected before any agent action.
- A business UI action is blocked with structured `POLICY_DENIED` under read-only policy.
- `suggest_known_remediation` returns governance-specific next steps after the denial.

## Boundary

This proof validates a practical safety workflow, not full business-flow completion. It deliberately stops at read-only policy denial to show how an AI agent can observe a real app and then request explicit escalation before taking side-effecting action.

## Verified Evidence

The latest tracked physical-device evidence is summarized at:

- [governed-business-app-vivo-2026-05-24/report.md](./evidence/governed-business-app-vivo-2026-05-24/report.md)
- [governed-business-app-vivo-2026-05-24/summary.json](./evidence/governed-business-app-vivo-2026-05-24/summary.json)

Validate it offline:

```bash
pnpm run validate:governed-business-app-evidence
```
