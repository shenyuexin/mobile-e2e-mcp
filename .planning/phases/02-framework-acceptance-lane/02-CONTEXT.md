# Phase 02 Context: Framework Acceptance Lane

## Phase Intent

Phase 02 proves one framework profile end-to-end with reproducible acceptance evidence, starting from the live repo truth already established in Phase 01.

The work is acceptance-evidence-first. That means the phase is only successful if the chosen framework lane can be run from documented prerequisites and checked-in config, and if the resulting evidence clearly separates smoke-grade validation from acceptance-grade proof.

React Native Android is the default first acceptance lane. Only switch to Flutter Android if later repo truth in the planning docs, matrix, or validation notes proves Flutter is lower risk for the same acceptance boundary.

## Locked Scope

### In scope

- CFG-03, clean-clone baseline validation using documented prerequisites and checked-in config.
- CAP-02 evidence intent already established in the milestone requirements, now turned into a runnable acceptance lane.
- EVA-01 and EVA-02 evidence shape and boundary clarity for native plus framework acceptance runs.
- One framework acceptance lane, with React Native Android as the default first target.
- Clean-clone closure only where it supports the acceptance lane and its reproducibility.
- Acceptance evidence contract details needed by the eventual execution summary.

### Out of scope

- Phase 03 guardrails, PR/release doc-sync enforcement, and support-language tightening.
- New tool families or broader platform expansion.
- Enterprise governance features, approval workflows, or multi-host orchestration.

## Decision Record

| Decision | Why it was chosen | Effect on Phase 02 |
|---|---|---|
| Use acceptance evidence as the phase boundary | The phase exists to prove support truth, not just runtime behavior | All tasks must end in reproducible proof, not smoke-only success |
| Default the first framework lane to React Native Android | Repo truth shows React Native is already the safer acceptance backbone, while Flutter remains more constrained in the shared acceptance path | The first lane plan should build on RN Android unless a later repo-truth check makes Flutter clearly lower risk |
| Keep clean-clone closure narrow | CFG-03 matters only insofar as it supports the acceptance lane and removes hidden local drift | Fix only the config and prerequisites required for the lane to run consistently |
| Preserve the smoke vs acceptance distinction | Existing docs and test guidance already separate toolchain smoke from real-device acceptance | Phase 02 must not blur those lanes in plan text or evidence artifacts |

## Repo Truth Used As Inputs

- `.planning/PROJECT.md` says the milestone focus is capability verification and productization, with Phase 02 defaulting to React Native Android unless Flutter proves lower risk.
- `.planning/STATE.md` already points to Phase 02 framework-acceptance-lane planning.
- `.planning/REQUIREMENTS.md` keeps CFG-03 in Phase 2 and CAP-03/DOC-02 in Phase 3.
- `configs/matrices/framework-profile-matrix.md` shows React Native and Flutter as `validated-sample-baseline`, while the current shared acceptance path treats React Native backbone lanes and Flutter sample lanes differently.
- `docs/showcase/ci-evidence.md` and `tests/README.md` both distinguish smoke proof from acceptance proof and name the real-device acceptance workflow as the acceptance-evidence lane.

## Planning Boundaries

The planning artifacts for this phase should answer four questions without hand-waving:

1. What exact repo inputs are required for the chosen framework lane to run on a clean clone?
2. Which evidence artifacts prove the lane is acceptance-grade instead of smoke-grade?
3. What repo truth needs to be synchronized so the lane is reproducible and reviewable?
4. What proof is needed to say the lane is ready before any Phase 03 doc-sync work begins?

## Downstream Planning Guidance

- Write tasks around evidence artifacts first, then prerequisite closure, then lane hardening.
- Keep the plan concrete about commands, files, and proof outputs.
- Treat React Native Android as the first lane unless a later live-repo check forces a different call.
- Keep smoke validation separate from acceptance proof in every planning note and artifact label.

## Clean-Clone Prerequisites

The chosen lane must be runnable from a clean clone with only tracked inputs. The minimum prerequisites are:

1. Canonical harness config and framework matrix entries already checked in.
2. The lane command path documented in repo-owned planning or support docs.
3. The selected framework profile and sample assets needed by the lane.
4. No hidden local config, untracked environment files, or machine-specific defaults.

If any prerequisite is missing, Phase 02 should record the gap rather than claiming acceptance readiness.

## Acceptance Summary Handoff Fields

The eventual summary for this phase should include:

- lane name and target platform,
- evidence artifact paths,
- validation commands run,
- clean-clone prerequisite status,
- smoke versus acceptance separation note,
- and whether CFG-03 is fully closed or only narrowed.

## Phase Exit Definition

Phase 02 is ready for execution when the plan file:

- names the first framework lane,
- lists the repo files and docs that must be touched,
- defines the acceptance evidence outputs expected from the lane,
- and states the verification commands that prove the lane is reproducible from a clean clone.
