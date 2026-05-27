## Mobile change live proof intake

Verdict: `not_promotable_live_proof`
Proof level: `no_device_or_controlled_output`
Run ID: `mobile-change-readiness-failure-2026-05-27`
Source dir: `docs/showcase/evidence/mobile-change-readiness-failure`

Surface:
- Platform: `android`
- App: `com.example.mobilechange`
- Policy profile: `interactive`

Readiness:
- Expected screen: `login`
- Expected app phase: `authentication`
- Matched: `false`

Failure:
- Category: `app_readiness`
- Reason code: `APP_NOT_READY`
- Next action: `wait_or_fix_readiness_contract`

Blockers:
- CONTROLLED_OUTPUT: The summary boundary identifies this output as forced or controlled rather than physical-device proof.

Artifacts:
- ui_tree: `output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml`
- summary: `docs/showcase/evidence/mobile-change-readiness-failure/summary.json`
- report: `docs/showcase/evidence/mobile-change-readiness-failure/report.md`
- failure_packet: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json`

Next action:
- `inspect_live_proof_output`: The proof output is incomplete or not a live-device source; inspect the runner output before promotion.
- Command: `pnpm run intake:mobile-change-live-proof -- <live-output-dir>`

Boundaries:
- This intake validates a live runner output directory before promotion; it does not execute a device by itself.
- Only live_device summaries without no-device blockers can be treated as promotable live proof candidates.
- Promotion still requires human review of artifacts before expanding public support claims.
