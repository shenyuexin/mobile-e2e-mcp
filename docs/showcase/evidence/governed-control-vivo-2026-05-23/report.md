# Governed Control Vivo Evidence

This tracked evidence summarizes a vivo physical-device run of the governed-control live proof.

## Run

- Source run ID: `2026-05-23T08-56-47-448Z`
- Captured at: `2026-05-23T08:56:47.450Z`
- Platform: Android
- Device: vivo V2405A / product `PD2405M`
- Device ID: `10AEA40Z3Y***R5` (redacted)
- Runner profile: `native_android`
- App ID: `com.android.settings`
- Policy profile: `read-only`
- Verdict: `live_governed_control_observed`

## Evidence Summary

| Check | Result |
|---|---|
| Device detected | pass |
| `inspect_ui` live hierarchy | pass |
| `get_screen_summary` live summary | pass |
| Read-only action denial | pass |
| Governance remediation guidance | pass |

`inspect_ui` captured a live Android hierarchy with 93 total nodes and 53 clickable nodes. The full hierarchy XML is not tracked because it may include device or app text; the compact metrics are preserved in `summary.json`.

The guarded action step attempted `perform_action_with_evidence` under `read-only` policy and returned `POLICY_DENIED`. The follow-up `suggest_known_remediation` call returned `OK`, proving that policy denial is treated as a governance result with agent-consumable next steps.

## Validation

Run:

```bash
pnpm run validate:governed-control-evidence
```

The validator checks that the tracked summary still records:

- `verdict = live_governed_control_observed`
- `inspectedScreen = true`
- `policyDenied = true`
- `remediationAvailable = true`
- `inspectUi.totalNodes > 0`
- `inspectUi.clickableNodes > 0`
