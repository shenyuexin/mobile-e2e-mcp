# Flow Generation Guide

This guide explains the record -> export -> replay closure for generated Maestro flows.

For passive manual recording front-door usage, see:

- `docs/guides/record-session-quickstart.md`

## 1) Preconditions

- A session exists and has persisted action records (from `perform_action_with_evidence`).
- Session ID is known.

## 2) Export flow from a session

Call `export_session_flow`:

```json
{
  "name": "export_session_flow",
  "arguments": {
    "sessionId": "demo-record-android-01"
  }
}
```

Typical output fields:

- `data.outputPath`
- `data.stepCount`
- `data.skippedCount`
- `data.warnings`

## 3) Optional task-oriented export

Call `record_task_flow`:

```json
{
  "name": "record_task_flow",
  "arguments": {
    "sessionId": "demo-record-android-01",
    "goal": "Login and reach catalog"
  }
}
```

## 4) Replay exported flow

Use `run_flow` with returned `data.outputPath` value:

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

## 5) Mapping coverage and limits

Current export mapping covers:

- `launch_app`
- `tap_element`
- `type_into_element`
- `wait_for_ui`

Known limit:

- `terminate_app` is skipped during export and reported in `warnings`.
