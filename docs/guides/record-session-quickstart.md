# Record Session Quickstart

Android-first passive recording now supports a two-call front door:

1. `start_record_session`
2. `end_record_session`

Between these calls, manually operate your app on device/emulator.

## Step 1: Start recording

```json
{
  "name": "start_record_session",
  "arguments": {
    "sessionId": "record-login-001",
    "platform": "android",
    "deviceId": "emulator-5554",
    "appId": "com.example.app"
  }
}
```

## Step 2: Perform manual interactions

Operate login and navigation manually on your device.

## Step 3: End recording and export flow

```json
{
  "name": "end_record_session",
  "arguments": {
    "recordSessionId": "<recordSessionId-from-step-1>",
    "autoExport": true,
    "runReplayDryRun": true
  }
}
```

Expected output contains `data.report.flowPath`.

## Step 4: Replay

```json
{
  "name": "run_flow",
  "arguments": {
    "sessionId": "record-login-001",
    "platform": "android",
    "flowPath": "flows/samples/generated/<generated>.yaml",
    "dryRun": true
  }
}
```
