# Record Session Demo (Android-first)

This showcase demonstrates passive manual recording with two front-door calls.

## Demo chain

`start_record_session -> (manual app interactions) -> end_record_session -> run_flow`

## Evidence to capture

- Record session artifact: `artifacts/record-sessions/<recordSessionId>.json`
- Raw event stream: `artifacts/record-events/<recordSessionId>.jsonl`
- Mapped steps: `artifacts/recorded-steps/<recordSessionId>.json`
- Generated flow: `flows/samples/generated/<recordSessionId>-<timestamp>.yaml`
