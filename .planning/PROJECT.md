# Mobile E2E MCP

## What This Is

`mobile-e2e-mcp` is an Explorer-led, AI-first mobile E2E orchestration harness for Android, iOS, React Native, and Flutter. Its primary outward-facing product capability is automatic app exploration that composes deterministic-first execution, bounded OCR fallback, policy-aware session control, interruption/recovery handling, and evidence-rich diagnostics into reviewable coverage artifacts.

This `PROJECT.md` file is part of the repository's **internal planning workspace**. It helps steer execution, but it does not override the codebase, formal docs, or validation artifacts that define shipped behavior.

## Core Value

Teams can use Explorer as the main product entrypoint for understanding mobile app reachability, risk boundaries, interruptions, and failures, while trusting the harness's stated support boundaries because live behavior, capability reporting, and acceptance evidence stay aligned.

## Planning Workspace Rules

- `.planning/` is an internal execution layer for the maintainer and AI agents.
- Public/project-facing truth still lives in code, contracts, tests, CI, `README*`, `docs/**`, and `.github/**`.
- If this file identifies a change to support boundaries, contributor workflow, or release expectations, the corresponding formal source of truth must be updated separately.
- Keep this workspace focused on execution clarity, traceability, and session continuity.

## Requirements

### Validated

- ✓ Structured MCP tool contracts and machine-consumable result envelopes already exist across session, UI, diagnostics, interruption, recovery, and recording flows.
- ✓ Android deterministic execution, evidence capture, and record/replay front-door flows are already implemented and demonstrated.
- ✓ iOS simulator support exists for core session, UI, flow, and recording paths, but with explicit partial-support caveats.
- ✓ Policy, session, and artifact persistence are already first-class parts of the runtime rather than afterthought wrappers.
- ✓ Explorer already produces fixed coverage artifacts (`tree.txt`, `report.md`, `summary.json`, `config.json`, failure review outputs) and has demonstrated large Settings explorations with rule decisions and interruption/failure evidence.

### Active

- [ ] Productize Explorer as the primary external capability: coverage intelligence, failure/rule explanation, PR-ready summaries, run-to-run diffing, replay-path extraction, and curated/redacted showcase evidence.
- [ ] Turn cross-platform support claims into a tracked, reproducible capability baseline for native plus at least one framework lane, starting with React Native Android unless repo truth proves Flutter Android lower risk.
- [ ] Remove silent local-config drift so clean clones, CI, and contributors evaluate the same harness and compatibility inputs, with acceptance evidence separate from smoke validation.
- [ ] Keep README, capability docs, and `describe_capabilities` aligned with live support levels and evidence gates.
- [ ] Validate whether commit range `7db6eceb..abd01e05` is safe and semver-appropriate for npm release `0.1.10` before any publish/tag action is taken.

### Out of Scope

- Enterprise RBAC, approval workflows, and compliance exports in this milestone — valuable, but not the shortest path to proving current capability truth.
- New MCP tool families unrelated to capability verification — expanding surface area before hardening support boundaries would increase drift.
- Multi-host persistence or cloud orchestration backends in this milestone — important later, but not required to prove current platform claims.

## Context

This is a brownfield pnpm monorepo with strong contracts/core/adapter/server layering and a meaningful Android-first execution baseline. The codebase already exposes a broad tool catalog and several showcase flows, but the strongest product direction is now Explorer: it turns the underlying MCP tools into a visible developer workflow for app coverage, risk gating, interruption handling, failure review, and evidence packaging. Adoption risk now centers less on missing raw tool capability and more on whether Explorer outputs are curated, explained, comparable across runs, and easy to consume in PR/release workflows.

## Constraints

- **Architecture**: Keep deterministic-first execution primary and make any fallback explicit and auditable.
- **Evidence**: Every support claim must be backed by reproducible artifacts or structured partial/unsupported responses.
- **Brownfield**: Follow existing contracts/core/adapter/server boundaries instead of introducing sidecar logic in one layer.
- **Delivery**: Favor tracked, reproducible native plus one framework lane before broadening the matrix further.
- **Doc Sync**: README and architecture prose must not outrun the live registry, policy config, or validation lanes.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Current planning focus is capability verification and productization, not new tool expansion | The repo already has substantial tool surface; the higher-leverage gap is trust in what is truly supported | Phase 02 planning should sharpen acceptance evidence and clean-clone readiness |
| Phase 1 will harden tracked config and capability truth before deeper framework rollout | Silent config drift and doc/runtime mismatch make later acceptance results less credible | Completed via Phase 01 summaries and PR #2 |
| The first framework acceptance lane should default to React Native Android unless research proves Flutter is lower-risk | The repo already contains an RN demo app and RN debug-lane capabilities that can strengthen the first framework proof point | Phase 02 planning keeps RN Android as the default acceptance lane |
| The 0.1.10 release decision must be backed by packaged-runtime evidence, not source-checkout confidence | The candidate range changes shipped runtime behavior and semver risk cannot be inferred from repo-local tests alone | Phase 05 validates npm-packed behavior and patch-release fit before any publish action |
| Developer-facing skill planning should use platform-level anchors with framework overlays | The harness creates more leverage by helping teams expose deterministic states, evidence hooks, and remediation paths than by acting like a generic UI copilot | Future skill planning should anchor on `android-e2e-readiness` / `ios-e2e-readiness`, keep a cross-platform baseline, and treat Compose / SwiftUI as overlays unless they prove they need top-level status |
| Developer-facing readiness planning should sequence baseline first, then platform refinement | A thin shared baseline keeps Android, iOS, React Native, and Flutter aligned on the same E2E contract before platform-specific checklists diverge | Phase 06 follow-on work should progress in the order `mobile-e2e-readiness-baseline` -> `android-e2e-readiness` -> `ios-e2e-readiness` |
| Draft skills must be pressure-tested before real skill publication | Planning clarity alone is not enough; the draft skill must actually change agent behavior under pressure before it deserves promotion into a real reusable skill | Phase 06 follow-on work should add a pressure-test slice before any real skill files are created |
| Real skill publication should use repo-tracked canonical sources before any local install target | Skill quality, reviewability, and rollback are easier when the source of truth lives in the repo instead of only in a local skill directory | Future publication work should create canonical skill sources in-repo first, then treat local installation/export as a downstream step |
| The canonical repo-tracked skill source root is `skills/` | A simple top-level skill root matches common skill layouts and avoids hiding the first real skill inside planning-only folders | The first real baseline skill source should live at `skills/mobile-e2e-readiness-baseline/SKILL.md` |
| Platform real skills should extend the baseline instead of restating it wholesale | The baseline should remain the shared contract layer; platform skills should stay smaller and more corrective about platform-specific misdiagnosis patterns | `android-e2e-readiness` should focus on Android entry/reset, stable hooks, hybrid ownership, ready-state visibility, and blocked-state interpretation |
| iOS real skills should correct false SwiftUI-only or timing-only diagnoses without becoming a second baseline | The iOS layer adds platform-specific interpretation for launch/reset, accessibility identifiers, mixed ownership, interruption handling, and post-transition actionability | `ios-e2e-readiness` should stay layered under the baseline and keep SwiftUI, UIKit, and mixed-surface distinctions explicit |
| Canonical skills should ship with a repo-tracked selection layer | A first-wave skill set is easier to use and harder to misuse when the invocation boundary is explicit in one shared place | The repo should include a `skills/README.md` or equivalent decision layer explaining when to use baseline vs Android vs iOS |
| Canonical skills should support explicit export without changing source ownership | Repo-tracked skill sources are more useful when users can materialize them into a chosen target directory on demand, but exports must remain downstream copies or symlinks | The repo should provide an explicit export script with `--out-dir` and keep `skills/` as the only canonical source |
| Explorer is the primary outward-facing product capability | Explorer exercises and composes the harness's core MCP abilities: device/session control, UI inspection/action, risk rules, interruption handling, recovery, and evidence reporting. This is more differentiated than a narrow golden-path E2E demo. | Future roadmap work should optimize Explorer coverage intelligence, review consumption, replay extraction, and curated evidence before adding unrelated tool surface |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**
1. Requirements invalidated? Move them to Out of Scope with a reason.
2. Requirements validated? Move them to Validated with the phase reference.
3. New requirements emerged? Add them to Active.
4. Decisions to log? Add them to the Key Decisions table.
5. "What This Is" still accurate? Update it if reality drifted.
6. Did a planning conclusion change formal project truth? Update the owning repo docs/code/tests, then note the sync here.

**After each milestone**
1. Review all sections for drift.
2. Recheck the Core Value against the actual product direction.
3. Audit Out of Scope items and confirm the reasons still hold.
4. Refresh Context with the current repo and adoption state.
5. Remove or trim any planning prose that duplicates stable public docs without adding execution value.

---
*Last updated: 2026-03-28 after Phase 06 export-layer sync*
