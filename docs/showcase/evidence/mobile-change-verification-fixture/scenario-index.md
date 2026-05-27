## Realistic mobile evidence breadth

Verdict: `realistic_workflow_evidence_available`
Scenario count: `2`
Failure packet count: `1`

Scenarios:
- rn-login-readiness: `react_native_android`, pain point `launch_readiness_regression`, verdict `mobile_change_verified`, evidence `docs/showcase/evidence/mobile-change-verification-fixture/summary.json`
- network-policy-failure-packet: `native_android`, pain point `network_policy_failure`, verdict `failure_packet_actionable`, evidence `docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json`; failure packet: `docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json`

Boundaries:
- This index proves app-oriented evidence breadth only for the listed scenarios.
- Dry-run or fixture evidence must not be described as live-device coverage.
- Cloud farms, broad platform parity, and framework-wide maturity remain future work unless backed by separate evidence.
