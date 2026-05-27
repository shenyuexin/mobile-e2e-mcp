# Phase 48 Summary: Live Mobile Change Verification Runner

## What Changed

- Added `runLiveMobileChangeVerificationWorkflow()` to reuse the existing mobile verification bundle and failure packet contracts for optional live execution.
- Added `pnpm run proof:mobile-change-verification:live`, which writes timestamped output under `output/showcase/mobile-change-verification-live/`.
- Added structured no-device output for local/CI-safe verification via `M2E_LIVE_MOBILE_CHANGE_FORCE_NO_DEVICE=1 M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1`.
- Updated README and showcase/CI evidence docs with the live command and boundaries.

## What Completed

- Live runner can invoke existing MCP tool surface: `list_devices`, `describe_capabilities`, `start_session`, `install_app` when configured, `launch_app`, `inspect_ui`, `get_screen_summary`, and `end_session`.
- No-device conditions produce a `device_unavailable` bundle and an `environment` failure packet instead of crashing.
- Unit tests cover live success shaping and no-device shaping through a fake invoker.

## Evidence Produced

- `scripts/showcase/mobile-change-verification.ts`
- `scripts/showcase/mobile-change-verification.test.ts`
- `package.json`
- `README.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`

## Deviations

- No committed live-device success artifact was added. The live command is available, but Phase 49 remains responsible for real/live-run-derived app failure proof.

## Repo Truth Owners Updated

- `package.json`
- `README.md`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
