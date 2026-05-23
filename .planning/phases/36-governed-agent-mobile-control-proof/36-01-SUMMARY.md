# Phase 36 Summary: Governed Agent Mobile Control Proof

## Outcome

Phase 36 implemented the first concrete proof for the Phase 35 wedge: **AI-safe mobile device control via MCP**.

The new proof runner writes a timestamped bundle under `output/showcase/governed-agent-mobile-control/<run-id>/`:

- `baseline-wrapper.json`
- `harness-run.json`
- `comparison.json`
- `report.md`

The proof compares a minimal custom adb wrapper with the MCP harness path and verifies the core differentiator: a read-only policy blocks an interactive tap request with a structured `POLICY_DENIED` result inside a session that preserves evidence references.

## Product Signal

This is real implementation work, not only planning. It makes the wedge reviewable through a repeatable command:

```bash
pnpm run proof:governed-agent-mobile-control
```

The proof also surfaced one useful product gap: `suggest_known_remediation` is currently a generic failure-remediation path and does not automatically turn policy denial into governance-specific next-action guidance. The report records this as a residual gap instead of overstating it as complete.

## Changed Files

- `scripts/showcase/governed-agent-mobile-control-proof.ts`
- `docs/showcase/governed-agent-mobile-control.md`
- `docs/showcase/README.md`
- `package.json`

## Next Step

Use this proof output to decide whether Phase 37 should implement governance-denial guidance, README positioning, or a narrow real-device variant of the same proof.
