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

In the current environment no Android device was available, so verification exercised the explicit no-device path:

```text
verdict: device_unavailable
reasonCode: DEVICE_UNAVAILABLE
```

This is intentional: the script does not fake live evidence. It records a clear unavailable-device proof bundle unless a real Android device or emulator is attached.

## Changed Files

- `scripts/showcase/governed-agent-mobile-control-live-proof.ts`
- `docs/showcase/governed-agent-mobile-control-live.md`
- `docs/showcase/governed-agent-mobile-control.md`
- `docs/showcase/README.md`
- `package.json`

## Next Step

Run the live proof on an Android device and archive the resulting `live_governed_control_observed` bundle as showcase evidence.
