# Governed Control Quickstart

This is the shortest entrypoint for evaluating the selected wedge: AI-safe mobile device control via MCP.

Run:

```bash
pnpm run quickstart:governed-control
```

The command writes a timestamped readiness bundle under:

```text
output/showcase/governed-quickstart-readiness/<run-id>/
```

Expected files:

- `quickstart-readiness.json` — machine-readable readiness checks and recommended next commands.
- `report.md` — human-readable setup and evidence review path.

## What It Checks

- Governed-control scripts exist in `package.json`.
- Tracked offline evidence is available for validation.
- The demo business app APK exists.
- `adb devices -l` can see at least one online Android device when local USB access is available.

## Readiness Levels

- `live_ready` — local evidence and device conditions are enough to run live governed proofs.
- `offline_ready` — tracked evidence can be validated without a connected device.
- `blocked` — a required local repo artifact or script is missing.

## Fastest Evaluation Path

If the quickstart reports `offline_ready`, run:

```bash
pnpm run validate:governed-control-evidence
pnpm run validate:governed-business-app-evidence
pnpm run validate:governed-business-app-comparison
```

If it reports `live_ready`, run:

```bash
pnpm run proof:governed-agent-mobile-control:preflight
pnpm run proof:governed-business-app-workflow
```

## Boundary

This quickstart does not run live app actions by itself. It is a first-run readiness and evidence-orientation lane so a developer or AI agent can choose the right next proof without reading every showcase document first.
