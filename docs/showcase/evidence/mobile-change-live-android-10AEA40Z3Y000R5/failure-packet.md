## Mobile verification failure packet

Category: `app_readiness`
Confidence: `high`
Reason code: `ADAPTER_ERROR`

Failed step:
- launch-app: `launch_app` -> `failed`

Evidence:
- ui_tree: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/inspect-ui.xml`
- summary: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/summary.json`
- report: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/report.md`
- failure_packet: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.json`

Policy guidance:
- No policy escalation guidance attached.

Next action:
- `wait_or_fix_readiness_contract`: Add or verify deterministic readiness signals before treating the screen as testable.

Boundaries:
- Failure packets classify observed evidence; they do not autonomously fix app code.
- Remediation is deterministic and bounded. LLM-generated remediation is out of scope for this phase.
