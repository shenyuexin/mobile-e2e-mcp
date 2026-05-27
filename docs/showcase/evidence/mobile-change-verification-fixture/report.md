## Mobile change verification

Verdict: `mobile_change_verified`
Source: `fixture`

Validation surface:
- Platform: `android`
- App: `com.example.mobilechange`
- Policy profile: `interactive`
- Artifact: `examples/rn-login-demo/android/app/build/outputs/apk/debug/app-debug.apk`

Workflow:
- discover-device: `list_devices` -> `success` (OK)
- start-session: `start_session` -> `success` (OK)
- install-or-launch: `launch_app` -> `success` (OK)
- inspect-readiness: `inspect_ui` -> `success` (OK)
- governed-smoke: `wait_for_ui` -> `success` (OK)
- close-session: `end_session` -> `success` (OK)

Readiness:
- Expected screen: `login`
- Expected app phase: `authentication`
- Matched: `true`

Artifacts:
- summary: `docs/showcase/evidence/mobile-change-verification-fixture/summary.json`
- report: `docs/showcase/evidence/mobile-change-verification-fixture/report.md`
- ui_tree: `output/showcase/mobile-change-verification/fixture/ui-tree.json`
- screenshot: `output/showcase/mobile-change-verification/fixture/screenshot.png`
- timeline: `output/showcase/mobile-change-verification/fixture/session-timeline.json`

Next action:
- `attach_to_pr`: Attach the Markdown report or JSON summary to the PR as mobile verification evidence.
- Command: `pnpm run validate:mobile-change-verification`

Boundaries:
- This fixture validates the workflow contract without claiming a live-device run.
- The workflow proves launch/readiness evidence packaging, not broad Android/iOS/RN/Flutter parity.
- Device-specific support must still be backed by live proof bundles before public claims expand.
