# Phase 48 Plan: Live Mobile Change Verification Runner

## Goal

Upgrade the fixture-backed mobile change verification contract into a live-capable runner that can use the existing governed MCP tool surface to select a device, install or launch an app, inspect readiness, capture evidence, and produce the same `mobile-change-verification/v1` bundle.

## Practicality Bet

The strongest remaining credibility gap is live execution. A developer-facing workflow becomes meaningfully more reliable when the same evidence contract can be produced from real device/emulator conditions and can degrade into a structured `device_unavailable` or failure packet instead of a thrown script error.

## Work Items

1. Add a live runner path behind a separate command so fixture validation remains deterministic in CI.
2. Reuse `list_devices`, `start_session`, `install_app`, `launch_app`, `inspect_ui`, `get_screen_summary`, and `end_session` through `createServer()`.
3. Map live success into `mobile-change-verification/v1` and live failure into `mobile-verification-failure-packet/v1`.
4. Add unit tests with a fake tool invoker for success, device-unavailable, and readiness-failure paths.
5. Document the command and boundary: live proof is optional and depends on an available device/app artifact.

## Boundary

This phase does not add a new MCP tool and does not claim platform parity. It is a repo-owned live proof runner that exercises existing MCP capabilities.

## Verification

- `pnpm run test:mobile-change-verification`
- `pnpm run validate:mobile-change-verification`
- Live command with no device allowed: `M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1 pnpm run proof:mobile-change-verification:live`
- Existing `pnpm run test:smoke`
- `pnpm typecheck`
- `git diff --check`

## Success Criteria

- The live command exists and writes a timestamped output bundle.
- No-device conditions produce structured proof output instead of crashing.
- Unit tests cover live success and failure shaping without requiring devices.
