## Mobile Change Failure Memory

Run ID: `mobile-change-failure-memory-2026-05-31`
Total records: `4`
Pattern count: `3`

Patterns:
- app_readiness:*: occurrences `2`, confidence `high`
  - Recommendation: `repair_readiness_contract` - Repeated app-readiness failures should be resolved by verifying deterministic readiness signals before another live proof.
  - Command: `pnpm run validate:mobile-change-readiness-contract && pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json`
  - Evidence: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json`, `output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml`, `docs/showcase/evidence/mobile-change-readiness-failure/summary.json`, `docs/showcase/evidence/mobile-change-readiness-failure/report.md`, `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.json`, `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/inspect-ui.xml`, `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/summary.json`, `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/report.md`
- network:NETWORK_POLICY_BLOCKED: occurrences `1`, confidence `high`
  - Recommendation: `inspect_network_policy` - Network failures should be checked against static release policy and observed request evidence before retry.
  - Command: `pnpm run validate:mobile-change-verification`
  - Evidence: `docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json`, `output/showcase/mobile-change-verification/failure/network-events.json`, `output/showcase/mobile-change-verification/failure/session-timeline.json`
- environment:DEVICE_UNAVAILABLE: occurrences `1`, confidence `high`
  - Recommendation: `run_device_readiness_doctor` - Environment blockers should be diagnosed before retrying UI-affecting live actions.
  - Command: `pnpm run generate:mobile-change-device-readiness && pnpm run validate:mobile-change-device-readiness`
  - Evidence: `docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json`, `docs/showcase/evidence/mobile-change-device-readiness`

Boundaries:
- Failure memory groups observed evidence; it is not a root-cause oracle.
- Recommendations are bounded next actions and must not autonomously edit app or test code.
- Low-confidence or unknown patterns route to inspect-first evidence collection.
