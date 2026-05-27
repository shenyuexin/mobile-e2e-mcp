## Mobile verification failure packet

Category: `network`
Confidence: `high`
Reason code: `NETWORK_POLICY_BLOCKED`

Failed step:
- wait-login-network-ready: `diagnose_network_failure` -> `failed`

Evidence:
- failure_packet: `docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json`
- logs: `output/showcase/mobile-change-verification/failure/network-events.json`
- timeline: `output/showcase/mobile-change-verification/failure/session-timeline.json`

Policy guidance:
- No policy escalation guidance attached.

Next action:
- `inspect_network_policy`: Check Android cleartext or iOS ATS policy before retrying network-dependent UI actions.

Boundaries:
- Failure packets classify observed evidence; they do not autonomously fix app code.
- Remediation is deterministic and bounded. LLM-generated remediation is out of scope for this phase.
