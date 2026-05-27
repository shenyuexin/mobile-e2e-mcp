## Mobile change live proof intake

Verdict: `promotable_live_proof_candidate`
Proof level: `physical_or_emulator_candidate`
Run ID: `android-10AEA40Z3Y000R5-2026-05-27-escalated`
Source dir: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5`

Surface:
- Platform: `android`
- App: `com.example.mobilechange`
- Policy profile: `interactive`

Readiness:
- Expected screen: `not-specified`
- Expected app phase: `authentication`
- Matched: `false`

Failure:
- Category: `app_readiness`
- Reason code: `ADAPTER_ERROR`
- Next action: `wait_or_fix_readiness_contract`

Blockers:
- none

Artifacts:
- ui_tree: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/inspect-ui.xml`
- summary: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/summary.json`
- report: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/report.md`
- failure_packet: `docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.json`

Next action:
- `promote_live_evidence`: The live output looks promotable; copy the source proof directory into tracked showcase evidence and review it before committing.
- Command: `mkdir -p docs/showcase/evidence/mobile-change-live && cp -R <live-output-dir> docs/showcase/evidence/mobile-change-live/`

Boundaries:
- This intake validates a live runner output directory before promotion; it does not execute a device by itself.
- Only live_device summaries without no-device blockers can be treated as promotable live proof candidates.
- Promotion still requires human review of artifacts before expanding public support claims.
