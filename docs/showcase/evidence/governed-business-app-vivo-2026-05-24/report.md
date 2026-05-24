# Governed Business App Vivo Evidence

This tracked evidence summarizes a vivo physical-device run of the governed business app workflow proof.

## Run

- Source run ID: `2026-05-24T01-09-04-299Z`
- Captured at: `2026-05-24T01:09:04.302Z`
- Platform: Android
- Device: vivo V2405A / product `PD2405M`
- Device ID: `10AEA40Z3Y***R5` (redacted)
- Runner profile: `native_android`
- App ID: `com.epam.mobitru`
- Setup policy profile: `sample-harness-default`
- Agent policy profile: `read-only`
- Verdict: `business_app_governed_workflow_observed`

## Evidence Summary

| Check | Result |
|---|---|
| Device detected | pass |
| Demo app available | pass |
| Setup session started | pass |
| Demo app launched | pass |
| Read-only session started | pass |
| Business UI hierarchy inspected | pass |
| Read-only business action denial | pass |
| Governance remediation guidance | pass |

`inspect_ui` captured a live hierarchy from the demo business app with 30 total nodes and 6 clickable nodes. The screen summary classified the app phase as `authentication`, which is a more product-like surface than Android Settings.

The guarded business action attempted `perform_action_with_evidence` with text `Login` under the `read-only` policy profile and returned `POLICY_DENIED`. The follow-up `suggest_known_remediation` call returned `OK`, proving that an AI agent can observe a business app and then receive governance guidance instead of taking a side-effecting action silently.

## Validation

Run:

```bash
pnpm run validate:governed-business-app-evidence
```

The validator checks that the tracked summary still records:

- `verdict = business_app_governed_workflow_observed`
- setup and read-only policy profiles are separated
- business app launch succeeded
- live UI inspection succeeded with positive node counts
- `perform_action_with_evidence` returned `POLICY_DENIED`
- `suggest_known_remediation` returned `OK`
