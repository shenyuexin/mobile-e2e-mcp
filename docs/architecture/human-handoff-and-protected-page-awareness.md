# Human Handoff and Protected-Page Awareness

## Goal

Define a first-class harness capability for:

1. recognizing protected or low-observability screens, and
2. recording explicit human-operator handoff checkpoints inside the session/audit chain.

This capability is intended for OTP, captcha, consent, secure input, and commercial-app protected surfaces where "keep trying automatically" is the wrong abstraction.

## Why This Exists

A mobile E2E harness is not credible if it only works on test-friendly pages and then silently degrades on protected authentication surfaces.

The correct harness behavior is:

- detect that the current screen is an automation boundary,
- surface structured signals to the agent,
- request bounded human intervention when required,
- resume from the same session with auditability preserved.

## Capability Surface

### 1. State-summary enrichment

`StateSummary` now carries:

- `protectedPage`
- `manualHandoff`

These fields are derived from visible UI-tree semantics such as:

- OTP / verification text
- captcha / human-verification text
- consent / policy acknowledgement text
- secure-input hints

The goal is not to "defeat" protected pages. The goal is to tell the agent that it is at a protected boundary and should switch execution mode.

### 2. Explicit MCP tool

New tool:

- `request_manual_handoff`

This tool records a structured handoff event into the active session timeline and audit path.

Typical reasons:

- `otp_required`
- `captcha_required`
- `consent_required`
- `protected_page`
- `secure_input_required`

## Runtime Model

Recommended path:

1. `get_screen_summary`
2. inspect `screenSummary.manualHandoff`
3. if `required=true`, call `request_manual_handoff`
4. if the boundary is discovered while using `perform_action_with_evidence`, expect:
   - `reasonCode=MANUAL_HANDOFF_REQUIRED`
   - `retryRecommendationTier=handoff_required`
   - `autoRemediation.stopReason=manual_handoff_required` when auto-remediation is enabled
5. operator completes the manual step on-device
6. agent re-checks with `get_screen_summary` or `get_session_state`
7. bounded automation resumes

This keeps the session continuous instead of fragmenting the workflow into "automation failed" vs "human took over somewhere".

## Session and Audit Behavior

`request_manual_handoff` writes:

- a typed timeline event: `manual_handoff_requested`
- optional artifact references
- optional `stateSummary` snapshot into `latestStateSummary`

This makes human intervention an auditable state transition rather than an out-of-band comment.

`perform_action_with_evidence` also treats a required handoff as a first-class stop condition rather than a generic blocked retry path. That prevents `recover_to_known_state` or `replay_last_stable_path` from being suggested when the correct next move is operator intervention.

## Support Boundary

This capability does not claim:

- automatic OTP extraction
- bypass of captcha / human-verification challenges
- bypass of secure-input or commercial-app protected pages

Instead, it claims:

- structured recognition of protected boundaries
- explicit handoff recording
- safe resumption guidance after manual completion

## Code Map

- contracts: `packages/contracts/src/types.ts`
- state heuristics: `packages/adapter-maestro/src/session-state.ts`
- tool wiring: `packages/mcp-server/src/tools/request-manual-handoff.ts`
- registry and policy/session composition: `packages/mcp-server/src/index.ts`

## Validation

Minimum verification for this capability:

- `packages/adapter-maestro/test/session-state.test.ts`
- `packages/mcp-server/test/server.test.ts`
