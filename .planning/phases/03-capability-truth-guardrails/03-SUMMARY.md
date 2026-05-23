# Phase 03 — Capability Truth Guardrails
Status: completed

## Goal
Establish capability-truth guardrails so public-facing docs, PR gating, and release validation distinguish shipped support truth from taxonomy/design direction.

## Plan
- Require capability-truth checks in the PR template.
- Enforce truth-source review in CI-facing PR gate validation.
- Extend release validation to require canonical public docs updates for capability-governed release ranges.
- Clarify documentation language so architecture docs separate roadmap/taxonomy from shipped support truth.

## Verify
Verified facts from this session:
- PR template now requires:
  - `Capability truth source checked`
  - `Public docs / canonical guide update`
- `scripts/validate-pr-capability-gate.mjs` enforces those fields.
- `scripts/release/validate-mcp-release.ts` now checks capability-governed release ranges for canonical public docs updates.
- `docs/delivery/npm-release-and-git-tagging.zh-CN.md` now treats missing doc-sync as a release failure for guarded ranges.
- `docs/architecture/capability-map.md` and `docs/architecture/governance-security.md` now explicitly distinguish taxonomy/design direction from shipped support truth.

Verification evidence:
- passing synthetic PR-gate success case
- passing `pnpm release:mcp:check`
- passing repo verification already run in this session:
  - `pnpm test:ci`
  - Android RN acceptance pass
  - iOS baseline pass

## Decisions / Deviations
- Phase 03 focused on capability-truth guardrails, not new product capability.
- No runtime support boundaries were changed in this phase.
- Release doc-sync is enforced as a guardrail for guarded ranges rather than treated as optional documentation hygiene.

## Retro
What worked:
- Truth checks were enforced at both PR-gate and release-validation layers.
- Docs now state support truth more explicitly and reduce taxonomy/support confusion.

What to carry forward:
- Keep capability-truth assertions tied to verified release/doc evidence.
- Preserve the distinction between design intent and shipped support truth in future docs and gates.

## Reusable rule
If a change affects capability-gated behavior, the PR and release path must prove the shipped truth source and the canonical public docs update before closure.
