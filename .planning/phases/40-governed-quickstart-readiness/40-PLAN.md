# Phase 40 Plan: Governed Quickstart Readiness

## Goal

Reduce first-run friction for developers and AI agents evaluating the governed-control wedge.

## Scope

- Add a single quickstart readiness command.
- Check script availability, tracked offline evidence, demo APK presence, and adb device visibility.
- Produce JSON and Markdown readiness artifacts.
- Link the quickstart from README and showcase docs.

## Out of Scope

- Running live app actions automatically.
- Installing dependencies or building APKs.
- Changing MCP tools or runtime contracts.

## Success Criteria

- `pnpm run quickstart:governed-control` writes a timestamped readiness bundle.
- The command distinguishes `live_ready`, `offline_ready`, and `blocked`.
- README and showcase docs expose the command as the shortest governed-control entrypoint.
