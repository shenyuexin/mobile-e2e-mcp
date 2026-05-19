# Probe Evidence Contract

`android-tool-probe.ts` and `ios-simulator-tool-probe.ts` write first-class probe evidence after a real run. The report contract is shared by both scripts so CI can validate the schema without requiring a device.

## Schema

Probe reports use `schemaVersion: "tool-probe-report/v1"` and include:

- identity: `runId`, `probe`, `sessionId`, `deviceId`, `platform`, `runnerProfile`, `appId`, `flowPath`
- provenance: `generatedAt`, `checklistSource`, optional `backend`
- evidence summary: `summary.total`, `success`, `partial`, `failed`, `observed`, `possible`, `notObserved`, `unknown`
- per-tool records: `tool`, `status`, optional `reasonCode`, `note`, `next`, `actionId`, `observedEffect`, `observedEvidence`
- artifact pointers: per-run JSON/Markdown paths and latest JSON/Markdown paths

`observedEffect` is intentionally separate from tool `status`. A tool can return `partial` while still proving that runtime/UI interaction happened, or return a failed verification where the action dispatch is only `possible`.

## Artifact Layout

Per-run artifacts:

```text
output/evidence/probes/<probe>/<runId>/report.json
output/evidence/probes/<probe>/<runId>/summary.md
```

Latest-run summaries:

```text
output/reports/<probe>.json
output/reports/<probe>.md
```

## Validation

Use fixture-backed tests for contract drift:

```bash
pnpm run test:probe-report-contract
```

Use dry-run validation for script metadata and tool coverage without requiring a device:

```bash
pnpm run validate:probe-dry-run
```

Real-device or simulator probe runs remain manual acceptance evidence:

```bash
pnpm run validate:android-tool-probe
pnpm exec tsx scripts/dev/ios-simulator-tool-probe.ts
```
