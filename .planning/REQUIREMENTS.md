# Requirements: Mobile E2E MCP

**Defined:** 2026-03-26
**Core Value:** Teams can trust the harness's stated support boundaries because live behavior, capability reporting, and acceptance evidence stay aligned.

This requirements file is an internal planning artifact for the current milestone. It improves traceability for execution, but it is not the public contract by itself.

## v1 Requirements

### Capability Truth

- [x] **CAP-01**: The repo publishes a tracked compatibility matrix for Android, iOS, native, React Native, and Flutter that reflects live support levels.
- [x] **CAP-02**: At least one native lane and one framework lane produce reproducible acceptance evidence from documented validation commands.
- [x] **CAP-03**: `describe_capabilities` and support docs expose matching `full` / `partial` / `unsupported` boundaries for shipped lanes.

### Configuration and Determinism

- [x] **CFG-01**: Canonical harness and framework-matrix inputs are tracked in the repo and consumed by validation scripts.
- [x] **CFG-02**: Missing harness or matrix inputs fail with structured guidance instead of silently falling back to implicit defaults.
- [x] **CFG-03**: A clean clone can run the intended baseline validation path using documented prerequisites and checked-in config.

### Evidence and Release Confidence

- [x] **EVA-01**: Native and framework acceptance lanes emit `phase-sample-report` and `acceptance-evidence` artifacts with explicit pass/no-go semantics.
- [x] **EVA-02**: CI, platform smoke, and real-device acceptance clearly distinguish smoke-grade validation from support-grade acceptance.
- [x] **REL-01**: Any MCP release candidate proves its npm-packed runtime path and packaged assets work without relying on repo-only files.
- [x] **REL-02**: A patch release is published only when the verified runtime delta is backward-compatible and the semver signal matches the observed release risk.

#### Phase 02 evidence contract notes

- `phase-sample-report` is the compact planning and execution bridge for the selected lane.
- `acceptance-evidence` is the proof artifact set for the real acceptance lane and is separate from smoke validation output.
- Missing lane prerequisites are a no-go, not a partial acceptance success.
- The chosen lane must be named in planning notes before evidence can be treated as comparable.

### Documentation Integrity

- [x] **DOC-01**: README and user-facing guides do not overstate unsupported or partial capabilities.
- [x] **DOC-02**: Support-boundary changes are gated by PR/release checks and doc-sync expectations.

## v2 Requirements

### Record/Replay Productization

- **REC-01**: Low-confidence recorded steps can be reviewed and corrected before replay.
- **REC-02**: Record-session output includes a guided post-processing loop for non-engineering users.

### Governance Expansion

- **GOV-01**: Approval workflows and finer-grained policy scopes are available for enterprise deployments.
- **GOV-02**: Audit exports and retention/redaction controls are verifiably stronger than local metadata masking.

### Platform Reach

- **OCR-01**: Bounded OCR fallback is available on at least one non-macOS host option.

### Developer-Facing Skill Enablement

- [x] **DEV-01**: The planning workspace defines a cross-platform E2E readiness rubric that helps app teams improve deterministic entry, stable selectors, ready-state signals, reset semantics, and evidence hooks.
- [x] **DEV-02**: Developer-facing skill planning uses platform-level anchors for Android and iOS, with framework-specific overlays only where Compose, SwiftUI, React Native, or Flutter semantics materially differ.
- [x] **DEV-03**: The roadmap includes a failure-to-remediation lane that turns harness evidence into app-side developer guidance rather than raw automation errors alone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New top-level MCP tool families unrelated to capability verification | This milestone is about trust in current support, not widening the surface area further |
| Enterprise approval/RBAC implementation | Valuable but belongs after the current support baseline is proven |
| Multi-host or cloud-backed orchestration persistence | A scaling concern, not the fastest way to improve capability credibility |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | Phase 1 | Completed |
| CFG-01 | Phase 1 | Completed |
| CFG-02 | Phase 1 | Completed |
| DOC-01 | Phase 1 | Completed |
| CAP-02 | Phase 1 | Completed |
| CFG-03 | Phase 2 | Completed |
| EVA-01 | Phase 1 | Completed |
| EVA-02 | Phase 1 | Completed |
| CAP-03 | Phase 3 | Completed |
| DOC-02 | Phase 3 | Completed |
| REL-01 | Phase 5 | Completed |
| REL-02 | Phase 5 | Completed |
| DEV-01 | Phase 6 | Completed |
| DEV-02 | Phase 6 | Completed |
| DEV-03 | Phase 6 | Completed |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

## Maintenance Rules

- Keep only milestone-relevant requirements here; move long-lived public capability statements to formal docs/contracts.
- When a requirement is validated, record where that truth now lives in the repo (docs, code, tests, workflow, or release gate).
- If a requirement is abandoned or deferred, say why briefly instead of leaving silent stale entries.
- Avoid duplicating stable architecture prose here unless it directly improves execution decisions.
- A plan summary alone does not complete a requirement; update requirement status only when the summary includes concrete verification and identifies the formal repo evidence.

## Current Validation Notes

- Phase 01 completed on 2026-03-27 and is summarized in:
  - `.planning/phases/01-capability-verification-productization/01-01-SUMMARY.md`
  - `.planning/phases/01-capability-verification-productization/01-02-SUMMARY.md`
  - `.planning/phases/01-capability-verification-productization/01-03-SUMMARY.md`
- Formal repo evidence for completed Phase 01 requirements now lives in tracked config (`configs/harness/*`, `configs/matrices/*`), adapter tests, top-level support docs, showcase/docs workflow wording, and `scripts/validate-phase3-samples.ts`.
- Remaining planned work is concentrated in Phase 02 follow-on slices and the new Phase 05 release-acceptance gate.
- Phase 02 planning now records React Native Android as the default acceptance lane unless repo truth later shows Flutter Android is lower risk.
- Phase 02 slice `02-01` completed on 2026-03-27 and is summarized in `.planning/phases/02-framework-acceptance-lane/02-01-SUMMARY.md`.
- Formal repo evidence now includes the dedicated Phase 02 RN Android entrypoint, repo-owned `examples/rn-login-demo`, Android real-device acceptance evidence with `status: GO`, and a passing iOS baseline validation.
- Phase 03 completed on 2026-03-27 and is summarized in `.planning/phases/03-capability-truth-guardrails/03-SUMMARY.md`.
- Formal repo evidence for Phase 03 now includes PR metadata enforcement, release doc-sync validation, and explicit support-truth caveats in the highest-risk architecture/release guidance docs.
- Phase 04 slice `04-01` completed on 2026-03-27 and is summarized in `.planning/phases/04-structured-replay-step-orchestration/04-01-SUMMARY.md`.
- Formal repo evidence for Phase 04 now includes step-aware `run_flow` preview fields (`executionMode`, `replayProgress`, `stepOutcomes`), replay timeline persistence through the session store, replay-summary artifact separation, and synced replay docs.
- Phase 05 completion status was restored on 2026-03-28 from explicit user confirmation; this session did not reconstruct the original verification evidence.
- Phase 06 is planned to define a developer-facing skill roadmap that keeps the harness focused on readiness, debugging, evidence interpretation, and remediation rather than generic UI-building assistance.
- Phase 06 completed on 2026-03-28 and is summarized in `.planning/phases/06-developer-facing-skill-roadmap/06-01-SUMMARY.md`.
- Formal planning evidence for Phase 06 now includes concrete Android/iOS readiness skill drafts, overlay rules for Compose/SwiftUI/UIKit/View-system guidance, and a follow-on decision point for cross-platform baseline vs platform-first implementation.

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-28 after Phase 06 skill-draft execution sync*
