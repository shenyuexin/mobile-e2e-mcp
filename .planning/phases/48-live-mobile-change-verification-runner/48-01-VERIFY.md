# Phase 48 Verify: Live Mobile Change Verification Runner

## Acceptance Evidence

- `pnpm run test:mobile-change-verification` covers live success and no-device output shaping.
- `M2E_LIVE_MOBILE_CHANGE_FORCE_NO_DEVICE=1 M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1 pnpm run proof:mobile-change-verification:live` writes a timestamped no-device proof bundle and exits successfully.

## Boundary Decision

The live runner is optional and device-dependent. Forced no-device mode proves structured failure output only; it is not live-device fidelity evidence.

## Pass Criteria

- Live command exists.
- No-device output is structured as `device_unavailable` plus `environment` failure packet.
- Existing fixture validation remains deterministic and separate from live output.
