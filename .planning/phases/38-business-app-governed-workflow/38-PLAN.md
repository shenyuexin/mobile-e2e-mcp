# Phase 38 Plan: Business App Governed Workflow

## Goal

Prove that the selected wedge is useful on a real demo business app, not only on Android Settings.

## Scope

- Add a showcase proof that prepares `examples/demo-android-app` through governed setup tools.
- Switch the agent-facing session to `read-only`.
- Capture live UI evidence before any agent action.
- Verify that an interactive business action is blocked with structured `POLICY_DENIED`.
- Preserve a timestamped proof bundle for review.

## Out of Scope

- Completing a full purchase/login flow.
- Adding new MCP tools or changing tool contracts.
- Committing full UI hierarchy captures.

## Success Criteria

- `pnpm run proof:governed-business-app-workflow` exists.
- The proof writes JSON and Markdown artifacts under `output/showcase/governed-business-app-workflow/<run-id>/`.
- With a device and APK available, the proof observes setup launch, UI inspection, policy denial, and governance remediation.
- Without a device or APK, the proof records an explicit unavailable verdict instead of faking success.
