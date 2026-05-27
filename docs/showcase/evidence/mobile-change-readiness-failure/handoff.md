## Mobile change handoff

Verdict: `mobile_change_verification_failed`
Run ID: `mobile-change-readiness-failure-2026-05-27`

Surface:
- Platform: `android`
- App: `com.example.mobilechange`
- Policy profile: `interactive`

Readiness:
- Expected screen: `login`
- Expected app phase: `authentication`
- Matched: `false`

Failure excerpt:
- Category: `app_readiness`
- Reason code: `APP_NOT_READY`
- Failed step: `check-readiness`
- Next action: `wait_or_fix_readiness_contract` - Add or verify deterministic readiness signals before treating the screen as testable.

Artifacts:
- ui_tree: `output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml`
- summary: `docs/showcase/evidence/mobile-change-readiness-failure/summary.json`
- report: `docs/showcase/evidence/mobile-change-readiness-failure/report.md`
- failure_packet: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json`

Next command:
- `pnpm run validate:mobile-change-readiness-failure`

Boundaries:
- This bundle was produced through the live runner contract, but its proof level depends on the invoker and available device context.
- Forced or controlled live-runner modes prove failure shaping and evidence structure, not physical-device fidelity.
- Device-specific support must still be backed by live proof bundles before public claims expand.
- Failure packets classify observed evidence; they do not autonomously fix app code.
- Remediation is deterministic and bounded. LLM-generated remediation is out of scope for this phase.
- This handoff is an offline summary artifact. It does not post to GitHub or change CI status by itself.

Source verification: `docs/showcase/evidence/mobile-change-readiness-failure/summary.json`
Source failure packet: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json`
