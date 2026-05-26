# Governed Policy Escalation Dry-Run Evidence

This compact evidence records the Phase 42 policy-escalation contract without requiring a connected Android device.

## Verdict

`policy_escalation_retry_dry_run_observed`

The same `perform_action_with_evidence` intent was:

1. blocked under `read-only` policy with `POLICY_DENIED`;
2. followed by governance remediation;
3. retried in a new `interactive` policy session;
4. allowed with `reasonCode=OK` and `lowLevelReasonCode=OK`.

## Scenario

- Platform: `android`
- Runner profile: `native_android`
- App ID: `com.android.settings`
- Execution mode: `dry-run`
- Retried action: `launch_app`
- Target app: `com.android.settings`

## Signals

| Signal | Value |
|---|---|
| `checks.deviceDetected` | `false` |
| `checks.dryRunDeviceSelected` | `true` |
| `checks.readOnlyDenied` | `true` |
| `checks.remediationAvailable` | `true` |
| `remediationPolicyGuidance.usedForEscalation` | `true` |
| `remediationPolicyGuidance.toolSequence` | `end_session -> start_session` |
| `checks.interactiveSessionStarted` | `true` |
| `checks.interactiveRetryAllowed` | `true` |
| `checks.interactiveRetryExecuted` | `true` |
| `readOnlyDeniedStep.reasonCode` | `POLICY_DENIED` |
| `interactiveRetryStep.reasonCode` | `OK` |
| `interactiveRetryStep.lowLevelReasonCode` | `OK` |

## Boundary

This is not live-device evidence. It proves the governed-control policy mechanics and result contract: refusal under `read-only`, explicit remediation-guided session/profile escalation, and successful retry under `interactive`.

The live Android proof command is the same entrypoint without `M2E_POLICY_ESCALATION_DRY_RUN=1`:

```bash
pnpm run proof:governed-policy-escalation
```
