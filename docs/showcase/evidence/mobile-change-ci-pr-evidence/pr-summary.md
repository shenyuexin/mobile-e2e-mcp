## Mobile Change CI Evidence

Review status: `blocked`
CI conclusion: `neutral`
Proof level: `blocked_before_live`
Run ID: `mobile-change-ci-pr-evidence-2026-05-31`

Sources:
- repo_app_success_candidate: verdict `blocked_before_live_success`, proof `blocked_before_live`, source `docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json`

Blockers:
- DEVICE_UNAVAILABLE: No connected Android device or explicitly labeled emulator was visible when this repo-owned app success candidate was generated.

Next action:
- `connect_device_and_run_repo_app_live_proof`: Connect an authorized Android device or explicitly labeled emulator, then rerun the repo-owned app live proof.
- Command: `pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json --run-id=repo-owned-demo-android-app-2026-05-31`

Boundaries:
- This artifact is designed for CI upload and PR review; it does not execute a device by itself.
- Blocked and no-device outputs use neutral CI conclusions and must not be treated as successful app verification.
- A success CI conclusion requires an intake-backed physical/emulator proof candidate with no blockers.
