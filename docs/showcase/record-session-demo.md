# Record Session Demo (Android-first)

This showcase demonstrates passive manual recording with two front-door calls.

## Demo chain

`start_record_session -> (manual app interactions) -> end_record_session -> run_flow`

## Evidence to capture

- Record session artifact: `output/evidence/record-sessions/<recordSessionId>.json`
- Raw event stream: `output/evidence/recordings/events/<recordSessionId>.jsonl`
- Mapped steps: `output/evidence/recorded-steps/<recordSessionId>.json`
- Generated flow: `flows/samples/generated/<recordSessionId>-<timestamp>.yaml`
