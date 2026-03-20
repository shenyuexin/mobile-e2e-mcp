# iOS Recording Showcase (Simulator)

This showcase demonstrates a reproducible iOS simulator record/replay loop:

1. `start_record_session(platform=ios)`
2. Manual interaction (tap/type/swipe)
3. `end_record_session(autoExport=true)`
4. `run_flow` with exported YAML

## Preconditions

- `xcrun simctl` available
- `idb` and `idb_companion` available
- iOS simulator is booted
- Target app installed on simulator

## Example sequence

Start recording:

```json
{
  "name": "start_record_session",
  "arguments": {
    "sessionId": "ios-record-demo-001",
    "platform": "ios",
    "deviceId": "<simulator-udid>",
    "appId": "com.example.ios"
  }
}
```

End + export:

```json
{
  "name": "end_record_session",
  "arguments": {
    "recordSessionId": "<recordSessionId-from-start>",
    "autoExport": true,
    "runReplayDryRun": true
  }
}
```

Replay:

```json
{
  "name": "run_flow",
  "arguments": {
    "sessionId": "ios-record-demo-001",
    "platform": "ios",
    "deviceId": "<simulator-udid>",
    "flowPath": "flows/samples/native/ios-recording-minimal.yaml",
    "dryRun": true
  }
}
```

## Artifacts to inspect

- `artifacts/record-events/<recordSessionId>.jsonl`
- `artifacts/recorded-steps/<recordSessionId>.json`
- `flows/samples/generated/<recordSessionId>-<timestamp>.yaml`

## Known limits

- Current iOS capture is simulator-first and optimized for tap/type semantic mapping.
- Snapshot capture depends on idb hierarchy availability.
- Low-confidence selector mapping may degrade to coordinate-based flow steps with warnings.
