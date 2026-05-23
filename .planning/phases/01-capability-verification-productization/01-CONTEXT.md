# Phase 1: Capability Baseline Productization - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Brownfield codebase mapping + GSD prioritization analysis

This context file is a phase execution aid inside `.planning`. It supports planning and implementation sessions, but does not replace the repo's formal architecture or support-boundary documents.

<domain>
## Phase Boundary

This phase hardens the repo's current support baseline before any broader capability expansion. The goal is to eliminate silent config drift, define a tracked compatibility/evidence baseline, and align public capability language with what the live runtime and validation lanes can actually prove today.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Phase 1 is about proving current capability truth, not adding unrelated new MCP tools.
- Tracked harness and compatibility inputs must become part of the repo contract rather than ignored local state.
- `describe_capabilities`, README/guides, and validation outputs must use the same support-boundary semantics.
- Acceptance evidence is part of the deliverable, not a post-hoc nice-to-have.

### the agent's Discretion
- Whether the first framework acceptance target should remain React Native Android or switch to Flutter based on implementation readiness.
- Whether config hardening should prefer checked-in canonical files, stricter required-file enforcement, or both.
- Which docs need the smallest high-signal edits first to remove overclaims without destabilizing broader architecture prose.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

When a phase decision changes project-facing truth, update the owning canonical file rather than only extending this context note.

### Live runtime and support boundaries
- `packages/adapter-maestro/src/capability-model.ts` — live `full` / `partial` / `unsupported` support definitions
- `packages/mcp-server/src/server.ts` — authoritative tool registry contract map
- `packages/adapter-maestro/src/harness-config.ts` — current harness fallback behavior and config loading

### Current risks and repo analysis
- `.planning/codebase/CONCERNS.md` — current config drift, support-boundary, and validation risks
- `.planning/codebase/ARCHITECTURE.md` — control-plane vs execution-plane ownership and entry points
- `.planning/codebase/TESTING.md` — current CI, smoke, and acceptance lane boundaries

### Product and support-language context
- `README.md` — public product positioning and AI-agent entry guidance
- `docs/delivery/roadmap.md` — delivery sequencing and intended phase outcomes
- `docs/engineering/ai-first-capability-expansion-guideline.md` — capability-surface guardrails
- `docs/showcase/ci-evidence.md` — what current CI proves and does not prove

</canonical_refs>

<specifics>
## Specific Ideas

- Promote canonical harness/matrix files into tracked repo inputs and make missing files fail loudly.
- Establish a compatibility matrix that distinguishes Android/iOS/native/RN/Flutter support without implying parity where none exists yet.
- Define a repeatable evidence contract for native plus the first framework lane before deepening framework rollout.

</specifics>

<deferred>
## Deferred Ideas

- Enterprise approval/RBAC and compliance exports
- Review/edit tooling for low-confidence recorded steps
- Cross-platform OCR provider expansion beyond macOS

</deferred>

---

*Phase: 01-capability-verification-productization*
*Context gathered: 2026-03-26 via brownfield GSD initialization*
