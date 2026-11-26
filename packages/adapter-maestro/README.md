# Maestro Adapter

This package now provides the TypeScript execution adapter used by `packages/mcp-server`.

Current scope:

- `resolveRepoPath()`
- `buildArtifactsDir()`
- harness/profile resolution in `src/harness-config.ts`
- UI hierarchy parsing and selector semantics in `src/ui-model.ts`
- JS inspector and Metro debug helpers in `src/js-debug.ts`
- `src/capability-model.ts`: capability reporting
- `src/ios-simulator-env.ts`: iOS Simulator `launchEnv` / `launchArgs` / `terminateRunning` helpers
- `src/axe-serve-pool.ts`: per-UDID read-only `axe serve` transport pool and sync cleanup
- `src/screen-recording-manager.ts`: fixed and non-blocking `start`/`stop` screen recording lifecycle and sync cleanup
- `src/ui-audit-model.ts`, `src/ui-audit-baseline.ts`, `src/ui-audit-tool.ts`: `audit_ui_surface` and baseline ratchet comparison
- `src/ui-gesture-model.ts`, `src/ui-action-gesture.ts`: `perform_gesture` modeling and execution
- `src/index.ts`: thin facade for tool-facing execution functions

The adapter still preserves the existing shell runners under `scripts/dev/` where that is the pragmatic backend, but it now also contains live session, UI, diagnostics, app lifecycle, JS debug, and policy-adjacent execution wiring.

For ongoing file-placement guidance as the package grows, see [`docs/architecture/adapter-code-placement.md`](../../docs/architecture/adapter-code-placement.md).
