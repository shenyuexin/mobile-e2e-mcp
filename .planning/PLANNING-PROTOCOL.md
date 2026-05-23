# `.planning` Planning Update Protocol

## Purpose

This document defines how `mobile-e2e-mcp` records planning state when new work appears, existing work changes shape, or completed work needs to be synced back into the planning workspace.

It is the **operating protocol** for `.planning/`.

- `PROJECT.md` holds stable planning rules, long-lived context, and key decisions.
- `ROADMAP.md` holds future intent: phases, dependencies, success criteria, and plan inventory.
- `STATE.md` holds current reality: where execution stopped, what changed recently, and what should happen next.

Read this file when you need to decide **what to update, in what order, and why**.

## Authority Boundary

`.planning/` is an internal execution layer. It does not replace the repository's formal truth owners.

If work changes runtime behavior, support boundaries, contributor workflow, or release expectations, update the formal owner as well:

- code / contracts / schemas
- tests / validation scripts / CI workflows
- `README*`, `docs/**`, `.github/**`

Use `.planning/` to coordinate work, not to silently redefine shipped behavior.

## File Roles

### `PROJECT.md` — stable planning charter

Update only when one of these changes:

- the milestone's core value or planning focus
- durable constraints or non-goals
- the active requirement set at milestone scope
- a meaningful long-lived decision that future phases must inherit
- evolution rules for how the project should be planned

`PROJECT.md` should change **rarely**. It is not a task log.

### `ROADMAP.md` — future intent and sequencing

Update when one of these changes:

- a new phase is added
- an urgent decimal phase is inserted (`2.1`, `3.1`, etc.)
- phase order, dependency, or success criteria changes
- a plan is added to a phase plan list
- a plan summary changes plan or phase completion state

`ROADMAP.md` tracks **what should happen** and **how far along the milestone is**.

### `STATE.md` — current reality and resume point

Update after every meaningful execution change:

- phase starts
- plan starts or completes
- blocker appears, changes, or is cleared
- a notable decision affects immediate downstream work
- session pauses or hands off
- roadmap completion state materially changes

`STATE.md` is the fast resume point. Keep it short, factual, and current.

## Default Update Order

When new work appears, use this sequence:

1. Read `STATE.md` first.
2. Decide whether the new work changes roadmap intent or only execution detail.
3. Update `ROADMAP.md` **only if** phase structure, dependencies, success criteria, or completion state changed.
4. Create or update the relevant phase plan under `phases/**`.
5. Execute the work.
6. Write the plan summary.
7. Write a separate verification artifact if the work needs explicit acceptance evidence beyond the summary.
8. Update `STATE.md` last so it reflects the new reality, not the intended reality.

Rule of thumb:

- **Roadmap first** when intent changes.
- **State last** when reality changes.

## Decision Tree

### Case A — small new task inside the current phase

Examples:

- a follow-up plan is needed to finish the current phase
- a new validation slice is required inside the same phase boundary
- an execution detail emerged but milestone goals did not change

Update order:

1. Read `STATE.md`
2. Check whether the current phase in `ROADMAP.md` already allows this work
3. Add a new plan entry in the current phase if needed
4. Create `XX-YY-PLAN.md`
5. Execute
6. Write `XX-YY-SUMMARY.md`
7. Optionally write `XX-YY-VERIFY.md`
8. Sync `STATE.md`
9. If completion state changed, sync `ROADMAP.md`

### Case B — roadmap-level change or newly discovered phase

Examples:

- work does not fit the current phase goal
- a prerequisite phase is missing
- an urgent insertion must happen before the next planned phase
- release/acceptance work deserves its own tracked phase

Update order:

1. Read `STATE.md`
2. Update `ROADMAP.md` first
3. Create the phase directory under `.planning/phases/`
4. Create the first `PLAN.md` in that phase
5. Execute
6. Write `SUMMARY.md`
7. Write `VERIFY.md` if needed
8. Sync `STATE.md`

### Case C — release or acceptance decision work

If the work is primarily about deciding whether something is safe, validated, or releasable, treat it as **acceptance work**, not as a hidden note inside implementation summaries.

Preferred location:

- inside the owning phase directory under `.planning/phases/`

Minimum artifacts:

- `PLAN.md` — what will be validated
- `SUMMARY.md` — what was concluded
- `VERIFY.md` — evidence, checks, and final pass/gap decision

Acceptance is considered part of the execution unit, not a parallel documentation track. If a task, slice, or release check belongs to a phase, keep its acceptance artifact beside that phase's plan and summary.

## Plan Artifact Rules

Each real execution unit should have a plan file and a summary file.

### Required plan structure

Every `*-PLAN.md` should make these sections easy to find:

- objective / goal
- scope
- out of scope
- read-first context
- actionable checklist
- verification approach
- acceptance criteria
- success criteria

Preferred starting point: `.planning/templates/PLAN-TEMPLATE.md`

### Required summary structure

Every `*-SUMMARY.md` should capture:

- what changed
- what completed
- evidence produced
- deviations from plan
- blockers or follow-on work
- repo truth owners that were updated

Preferred starting point: `.planning/templates/SUMMARY-TEMPLATE.md`

If a closure-oriented agent such as `scribe-finisher` is used, convert its output into this repo-local summary structure rather than storing a separate agent-specific summary format beside the phase artifacts.

If execution metrics are useful, record them here at the plan level:

- duration
- number of verification commands or scenarios
- environments checked
- notable evidence counts

### Separate verification artifact

Create `*-VERIFY.md` when:

- release or acceptance gates need a dedicated record
- the verification is too detailed for the summary
- a human decision may be needed after evidence review
- multiple commands, flows, or environments were checked

Preferred starting point: `.planning/templates/VERIFY-TEMPLATE.md`

If agent-generated closure notes already contain verification conclusions, fold them into the repo-local `*-VERIFY.md` structure so future sessions only need to read one verification format.

## Metrics Placement Rule

`STATE.md` should not act as a performance dashboard.

Use these rules instead:

- put plan-level execution metrics in the corresponding `*-SUMMARY.md`
- create `.planning/METRICS.md` only if the project truly benefits from cross-phase trend tracking
- do not keep velocity tables in `STATE.md` unless they directly help resume the next session

The default should be: **resume context in `STATE.md`, execution metrics in `SUMMARY.md`**.

## Phase Completion Rule

A phase may be marked `Completed` in `ROADMAP.md` only when all of the following are true:

1. The phase's planned work is complete, or any unfinished work has been explicitly deferred, moved, or cancelled.
2. The phase `Success Criteria` in `ROADMAP.md` are supported by summary or verification evidence.
3. `STATE.md` has been synced to the new current reality.
4. If the phase changed repo truth, the formal owner in code/docs/tests/CI has also been updated.

Do **not** mark a phase complete merely because a checklist was finished.

Use this distinction:

- **Plan complete** = this execution unit finished and has a summary.
- **Phase complete** = the phase goal and success criteria are now true.

## Sync Rules

After a summary is written:

1. Update `STATE.md` with the new position, blockers, decisions, and resume point.
2. Update `ROADMAP.md` only if plan/phase completion state changed.
3. Update `PROJECT.md` only if the work changed durable planning truth.
4. Update formal repo truth owners if support boundaries, release rules, or runtime behavior changed.

Do not copy the full summary into `STATE.md`.
Do not treat summary completion as automatic proof that the phase itself is complete.

## Writing Style Rules

- Prefer short factual updates over narrative journaling.
- Record outcomes, not aspirations.
- Keep `STATE.md` digest-sized.
- Keep `ROADMAP.md` phase-oriented, not task-oriented.
- Keep `PROJECT.md` stable; avoid turning it into a changelog.
- Keep acceptance evidence adjacent to the phase that owns it.

## Minimal Operating Loop

For day-to-day work, the default loop is:

```text
Read STATE
→ decide whether ROADMAP intent changed
→ write or update PLAN
→ execute
→ write SUMMARY
→ write VERIFY if needed
→ sync STATE
→ sync ROADMAP if completion changed
```

If this loop ever becomes heavier than the work it is trying to coordinate, simplify the planning artifacts rather than letting them drift stale.
