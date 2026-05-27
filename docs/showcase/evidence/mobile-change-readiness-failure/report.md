## Mobile change verification

Verdict: `mobile_change_verification_failed`
Source: `live_device`

Validation surface:
- Platform: `android`
- App: `com.example.mobilechange`
- Policy profile: `interactive`

Workflow:
- discover-device: `list_devices` -> `success` (OK)
- describe-capabilities: `describe_capabilities` -> `success` (OK)
- start-session: `start_session` -> `success` (OK)
- launch-app: `launch_app` -> `success` (OK)
- inspect-readiness: `inspect_ui` -> `success` (OK)
- check-readiness: `get_screen_summary` -> `failed` (APP_NOT_READY)
- close-session: `end_session` -> `success` (OK)

Readiness:
- Expected screen: `login`
- Expected app phase: `authentication`
- Matched: `false`

Artifacts:
- ui_tree: `output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml`
- summary: `docs/showcase/evidence/mobile-change-readiness-failure/summary.json`
- report: `docs/showcase/evidence/mobile-change-readiness-failure/report.md`
- failure_packet: `docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json`

Next action:
- `inspect_failure_packet`: Inspect the generated failure packet before retrying or changing the app.
- Command: `pnpm run validate:mobile-change-verification`

Boundaries:
- This bundle was produced through the live runner contract, but its proof level depends on the invoker and available device context.
- Forced or controlled live-runner modes prove failure shaping and evidence structure, not physical-device fidelity.
- Device-specific support must still be backed by live proof bundles before public claims expand.
