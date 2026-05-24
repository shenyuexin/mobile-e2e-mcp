# Phase 38 Summary: Business App Governed Workflow

## Outcome

Phase 38 adds a practical governed-control proof against the repo's Android demo business app:

```bash
pnpm run proof:governed-business-app-workflow
```

The proof uses a setup session with `sample-harness-default` to install and launch `com.epam.mobitru`, then switches to a `read-only` session for agent observation and action mediation.

## Product Value

This moves the wedge closer to a real mobile developer workflow:

- setup can be explicitly permissioned;
- agent observation can be restricted to read-only;
- business UI evidence is captured before action;
- side-effecting UI actions are denied with structured `POLICY_DENIED`;
- remediation guidance remains available for the agent.
- compact vivo evidence is tracked and validated offline in smoke.

## Changed Files

- `scripts/showcase/governed-business-app-workflow-proof.ts`
- `scripts/showcase/validate-governed-business-app-evidence.ts`
- `docs/showcase/governed-business-app-workflow.md`
- `docs/showcase/evidence/governed-business-app-vivo-2026-05-24/`
- `docs/showcase/README.md`
- `docs/showcase/ci-evidence.md`
- `README.md`
- `README.zh-CN.md`
- `package.json`

## Follow-up Hardening During Verification

The live run exposed a usability issue: long device operations were silent until final summary output. The script now prints each MCP step before executing it and supports `M2E_BUSINESS_SKIP_INSTALL=1` for faster reruns when the demo app is already installed.
