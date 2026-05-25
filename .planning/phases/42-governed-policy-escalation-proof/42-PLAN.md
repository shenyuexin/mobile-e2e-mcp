# Phase 42 Plan: Governed Policy Escalation Proof

## Goal

Show the step after safe refusal: a side-effecting agent intent is denied under `read-only`, receives governance remediation, then succeeds only after starting a new `interactive` session.

## Practicality Bet

Developers will dismiss the harness if policy only means "block everything." The useful workflow is refusal plus a clear, auditable path to explicit approval and retry.

## Work Items

1. Add a policy escalation proof script with live mode by default.
2. Add a CI-safe dry-run mode for policy mechanics when no Android device is visible.
3. Add compact tracked dry-run evidence and an offline validator.
4. Wire the validator into `test:smoke`.
5. Update README/showcase/CI evidence and the governed evidence brief.

## Boundary

- Dry-run evidence proves policy mechanics and result contracts, not physical-device launch fidelity.
- Live-device evidence remains a follow-up because `adb devices -l` returned no connected device during this phase.

## Verification

- `M2E_POLICY_ESCALATION_DRY_RUN=1 pnpm run proof:governed-policy-escalation`
- `pnpm run validate:governed-policy-escalation-evidence`
- `pnpm run validate:governed-evidence-brief`
- `pnpm run test:smoke`
- `pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck`
- `git diff --check`
