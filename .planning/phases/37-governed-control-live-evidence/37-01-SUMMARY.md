# Phase 37 Summary: Governed Control Live Evidence

## Outcome

Phase 37 added a narrow Android live-device proof entrypoint for governed agent control:

```bash
pnpm run proof:governed-agent-mobile-control:live
```

The proof uses existing MCP tools only. It selects an Android device, starts a `read-only` session, captures live UI evidence, verifies that an interactive action is blocked with structured `POLICY_DENIED`, asks for governance guidance, and writes a timestamped bundle under:

```text
output/showcase/governed-agent-mobile-control-live/<run-id>/
```

## Current Evidence

Initial verification exercised the explicit no-device path:

```text
verdict: device_unavailable
reasonCode: DEVICE_UNAVAILABLE
```

This is intentional: the script does not fake live evidence. It records a clear unavailable-device proof bundle unless a real Android device or emulator is attached.

A follow-up vivo physical-device run completed successfully:

```text
runId: 2026-05-23T08-56-47-448Z
deviceId: 10AEA40Z3Y000R5
model: V2405A
verdict: live_governed_control_observed
inspect_ui: success, totalNodes=93, clickableNodes=53
perform_action_with_evidence: POLICY_DENIED
suggest_known_remediation: OK
```

## Changed Files

- `scripts/showcase/governed-agent-mobile-control-live-proof.ts`
- `docs/showcase/governed-agent-mobile-control-live.md`
- `docs/showcase/governed-agent-mobile-control.md`
- `docs/showcase/README.md`
- `package.json`

## Next Step

The vivo live proof has been promoted into compact tracked showcase evidence under `docs/showcase/evidence/governed-control-vivo-2026-05-23/`, with full UI hierarchy and runtime artifacts kept out of git.
