# Flow Record -> Replay Demo

This showcase page demonstrates the closure path:

1. Execute real actions to accumulate session action records.
2. Export a replayable flow with `export_session_flow`.
3. Replay with `run_flow`.

## Minimal Demo Steps

### Step 1: Generate action records

Use your normal execution path (for example `perform_action_with_evidence`) under one session.

### Step 2: Export flow

```json
{
  "name": "export_session_flow",
  "arguments": {
    "sessionId": "demo-record-android-01"
  }
}
```

Expected key output:

- `data.outputPath`
- `data.stepCount`
- `data.warnings`

### Step 3: Replay exported flow

```json
{
  "name": "run_flow",
  "arguments": {
    "sessionId": "demo-record-android-01",
    "platform": "android",
    "flowPath": "flows/samples/generated/demo-record-android-01-<timestamp>.yaml",
    "dryRun": true
  }
}
```

## Evidence Expectations

- Export call returns `status: success` and a valid `data.outputPath`.
- Generated YAML exists under `flows/samples/generated/`.
- Replay call returns structured `status/reasonCode/data`.
