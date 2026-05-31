## Repo-owned app success candidate

Verdict: `blocked_before_live_success`
Success evidence promoted: `false`
Run ID: `repo-owned-demo-android-app-2026-05-31`

Repo app:
- App ID: `com.epam.mobitru`
- Artifact: `examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk`
- Artifact exists: `true`

Readiness contract:
- Path: `configs/readiness/demo-android-app.android.json`
- Strong proof ready: `true`
- Deterministic signal: `resource_id:com.epam.mobitru:id/login_signin`

Verification:
- Verdict: `blocked`
- Proof level: `blocked_before_live`

Evidence:
- readiness: `docs/showcase/evidence/mobile-change-device-readiness`

Blockers:
- DEVICE_UNAVAILABLE: No connected Android device or explicitly labeled emulator was visible when this repo-owned app success candidate was generated.

Next action:
- `connect_device_and_run_repo_app_live_proof`: Connect an authorized Android device or explicitly labeled emulator, then rerun the repo-owned app live proof.
- Command: `pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json --run-id=repo-owned-demo-android-app-2026-05-31`

Boundaries:
- This candidate is tied to the repo-owned demo Android app and must not be generalized to arbitrary apps.
- Blocked no-device output proves the gate and diagnostics, not app-under-test success.
- Repo-owned app success can be promoted only after live verification completes and intake accepts physical/emulator evidence.
