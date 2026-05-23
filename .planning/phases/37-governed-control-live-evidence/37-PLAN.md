# Phase 37 Plan: Governed Control Live Evidence

## Goal

Add a narrow Android live-device companion proof for the selected wedge, AI-safe mobile device control via MCP.

## Scope

- Add a runnable script for `pnpm run proof:governed-agent-mobile-control:live`.
- Select an Android device from `list_devices`, or use `M2E_DEVICE_ID` when provided.
- Start a `read-only` governed session.
- Capture live read-only UI evidence through `inspect_ui` and `get_screen_summary`.
- Attempt one interactive action that must be blocked with `POLICY_DENIED`.
- Ask `suggest_known_remediation` for governance-specific next steps.
- Write a timestamped JSON/Markdown proof bundle.
- Fail clearly with `DEVICE_UNAVAILABLE` when no Android device is available.

## Non-Goals

- Do not install, launch, or reset apps by default.
- Do not claim business-flow fidelity.
- Do not add new MCP tools or change tool contracts.
- Do not expand to iOS in this phase.

## Verification

- Run the live proof with `M2E_LIVE_PROOF_ALLOW_NO_DEVICE=1` to validate the no-device path.
- Run typecheck for the MCP server package.
- On a machine with an Android device, run the proof without `M2E_LIVE_PROOF_ALLOW_NO_DEVICE` and confirm `live_governed_control_observed`.
