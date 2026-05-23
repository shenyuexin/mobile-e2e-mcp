# Policy Profiles

Policy profiles are the control-plane boundary for agent-driven mobile actions. They decide whether a tool call should run, fail closed with `POLICY_DENIED`, or ask the agent to change strategy.

The current source of truth is:

```text
configs/policies/access-profiles.yaml
```

## Profiles

| Profile | Intended use | Allows | Denies |
|---|---|---|---|
| `read-only` | Inspection, evidence gathering, debugging before approval | inspect, screenshot, logs, performance, interruption detection/classification | tap, type, install, uninstall, high-risk interruption actions |
| `interactive` | Normal guided interaction without destructive app/device mutation | inspect, screenshot, logs, performance, tap, type, swipe, bounded interruption handling | uninstall, high-risk interruption actions |
| `full-control` | Controlled local/dev automation where destructive setup/reset is expected | inspect, screenshot, logs, performance, tap, type, swipe, install, uninstall, clear-data, high-risk interruption handling | none in the current profile |
| `sample-harness-default` | Backward-compatible sample/dev default | broad sample automation scopes | none in the current profile |

Use `read-only` when an agent should observe and report before touching the app. Use `interactive` when tap/type/swipe is intended but destructive setup is not. Use `full-control` only when install/uninstall/clear-data style operations are explicitly acceptable.

## Runtime Behavior

Start a governed session with an explicit profile:

```json
{
  "sessionId": "agent-review-001",
  "platform": "android",
  "deviceId": "emulator-5554",
  "profile": "phase1",
  "policyProfile": "read-only"
}
```

If an agent invokes an action outside the profile, the tool returns a structured denial:

```json
{
  "status": "failed",
  "reasonCode": "POLICY_DENIED",
  "data": {
    "toolName": "perform_action_with_evidence",
    "policyProfile": "read-only"
  }
}
```

After a denial, call `suggest_known_remediation` with the same `sessionId`. For non-default policy profiles, it returns governance-specific next steps, such as continuing with inspect/query tools, requesting approval, or restarting with a more permissive explicit profile.

## Agent Pattern

For unknown or high-risk tasks:

1. Start with `read-only`.
2. Use `describe_capabilities`, `inspect_ui`, `query_ui`, screenshots, logs, or summaries.
3. If interaction is necessary, explain why and request approval or restart with `interactive`.
4. Escalate to `full-control` only for setup/reset flows where destructive operations are expected.

For approved interaction:

1. Start with `interactive`.
2. Use deterministic selectors first.
3. Treat `POLICY_DENIED` as a governance result, not a flaky UI failure.
4. Call `suggest_known_remediation` before retrying or changing profiles.

## Boundaries

- Profiles gate MCP tool categories; they are not a replacement for app-under-test authorization, OS sandboxing, or human review.
- The default profile exists for sample compatibility. New agent workflows should choose an explicit profile.
- A policy denial does not prove the target UI was unavailable; it proves the requested action was outside the current control boundary.
- Policy docs describe the current YAML-backed baseline. If docs and YAML disagree, prefer `configs/policies/access-profiles.yaml`.
