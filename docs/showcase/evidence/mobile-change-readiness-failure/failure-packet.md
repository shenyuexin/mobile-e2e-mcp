## Mobile verification failure packet

Category: `app_readiness`
Confidence: `high`
Reason code: `APP_NOT_READY`

Failed step:
- check-readiness: `get_screen_summary` -> `failed`

Evidence:
- ui_tree: `output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml`
- summary: `docs/showcase/evidence/mobile-change-readiness-failure/summary.json`
- report: `docs/showcase/evidence/mobile-change-readiness-failure/report.md`
- failure_packet: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json`

Policy guidance:
- No policy escalation guidance attached.

Next action:
- `wait_or_fix_readiness_contract`: Add or verify deterministic readiness signals before treating the screen as testable.

Boundaries:
- Failure packets classify observed evidence; they do not autonomously fix app code.
- Remediation is deterministic and bounded. LLM-generated remediation is out of scope for this phase.
