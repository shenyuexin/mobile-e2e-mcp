# Phase 03 Context: Capability Truth Guardrails

## Phase Intent

Phase 03 closes the gap between shipped support boundaries and the words used to describe them. The goal is to make capability claims harder to drift, especially around docs, release checks, and support-boundary language on the repo's main truth surfaces.

This phase does not add product capability. It tightens the guardrails around existing capability claims so future changes have an explicit review path and unsupported target-state language gets trimmed before it spreads.

## Locked Scope

### In scope

- CAP-03, which requires `describe_capabilities` and support docs to expose matching `full`, `partial`, and `unsupported` boundaries for shipped lanes.
- DOC-02, which requires support-boundary changes to be gated by PR and release checks plus doc-sync expectations.
- Overclaim audit and trim work across the most visible support-boundary surfaces.
- Phase 03 planning artifacts only, with clear execution steps for later implementation.

### Out of scope

- New runtime tools or adapter features.
- Phase 02 lane execution work.
- Platform reach expansion or fallback rework.
- Enterprise policy or release automation beyond capability truth guardrails.

## Repo Truth Used As Inputs

- `.planning/PROJECT.md` says the milestone focus is capability verification and productization, not new tool expansion.
- `.planning/STATE.md` now points to Phase 03 as the next execution target after the RN Android acceptance slice.
- `.planning/REQUIREMENTS.md` keeps CAP-03 and DOC-02 in Phase 3.
- `.planning/ROADMAP.md` defines Phase 3 as capability truth guardrails and lists two plans for it.
- `README.md` still contains broad positioning language that must stay aligned with live registry truth.
- `docs/delivery/npm-release-and-git-tagging.zh-CN.md` is the canonical release-tagging guardrail source and should inform any doc-sync gate language.
- `docs/architecture/capability-map.md` and `docs/architecture/governance-security.md` are the main support-boundary prose surfaces to audit for overclaim drift.

## Decisions

| Decision | Why it was chosen | Effect on Phase 03 |
|---|---|---|
| Treat doc-sync as a release and PR gate, not a cleanup note | Support-boundary drift needs to be caught before publication, not after | The plan should name explicit checks and owners for capability-related wording changes |
| Audit only the highest-risk support surfaces first | The goal is to trim overclaims without creating a broad docs rewrite | The plan should focus on README, capability, and architecture surfaces that speak most directly to support truth |
| Keep the phase rooted in current shipped truth | The repo already has real acceptance evidence for RN Android and a stable iOS baseline, so Phase 03 should preserve that truth instead of inventing new support claims | Any wording changes must match the existing live registry and evidence scope |

## Planning Boundaries

The planning artifacts for this phase should answer four questions without hand-waving:

1. Which repo surfaces can overclaim support even when runtime truth is narrower?
2. What exact checks should block a PR or release if capability wording drifts?
3. What wording should be trimmed or normalized so shipped lanes and docs match?
4. How will later changes prove they went through the guardrail path instead of bypassing it?

## Downstream Planning Guidance

- Keep the plan concrete about files, gates, and review outputs.
- Prefer a small, enforced review path over a broad policy rewrite.
- Make the first plan about gating and the second about trimming language.
- Tie every wording change back to live support truth, not target-state aspirations.

## Exit Definition

Phase 03 is ready for execution when the plan files:

- name the exact doc and release surfaces to guard,
- define the PR and release gate checks,
- list the docs that must be audited and trimmed,
- and describe the verification evidence expected after the guardrails land.
