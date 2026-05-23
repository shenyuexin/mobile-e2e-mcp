# `.planning` Workspace Guide

## Role

This directory is the repository's **internal planning workspace** for the maintainer and AI agents.

It exists to make execution clearer, not to become a second public source of truth.

## Authority Boundary

`.planning` is **subordinate** to the repository's formal sources of truth:

1. **Code and contracts** — for current runtime behavior and enforced semantics
2. **Tracked docs** under `README*`, `docs/**`, and `.github/**` — for public/project-facing guidance
3. **Tests, validation scripts, and CI workflows** — for what is actually verified today

Use `.planning` for:

- current focus and execution state
- requirement traceability for ongoing work
- phase-level plans and summaries
- decisions, assumptions, and blockers that help future sessions resume quickly
- repo-analysis snapshots that help AI agents work efficiently

Do **not** use `.planning` as the only place for:

- user-facing support boundaries
- capability claims
- release-critical workflow rules
- anything that should be relied on by contributors who never open `.planning`

If a conclusion in `.planning` changes product truth, support boundaries, or contributor workflow, that conclusion must be reflected in the formal docs/code/tests that own that truth.

## Directory Map

- `PROJECT.md` — planning charter, current focus, constraints, decisions
- `REQUIREMENTS.md` — active requirement set for the current milestone with traceability
- `ROADMAP.md` — phase sequencing and success criteria
- `STATE.md` — current execution state, progress, blockers, and recent activity
- `phases/` — phase-specific context, plans, and summaries
- `templates/` — repo-local planning templates for summaries and future planning artifacts
- `codebase/` — generated repo analysis snapshots for AI-assisted work
- `config.json` — planning workflow preferences

## Operating Rules

1. Prefer **small, current, actionable** planning notes over comprehensive stale prose.
2. When phase work completes, write a summary and update the matching roadmap/state entries.
3. When public behavior changes, update the owning docs/tests/code rather than expanding `.planning` prose.
4. If a planning note drifts from the repo's formal truth, fix the repo truth owner first, then refresh `.planning`.
5. Keep `codebase/` clearly framed as analysis snapshots, not guaranteed live truth.

## Plan Execution Conventions

- Phase plans under `phases/**` are internal execution scaffolds.
- Use `.planning/templates/PLAN-TEMPLATE.md` for new plan artifacts.
- Plan summaries should use `.planning/templates/SUMMARY-TEMPLATE.md`, which follows the repo-local Goal → Plan → Implement → Verify → Retro closure.
- Use `.planning/templates/VERIFY-TEMPLATE.md` when a plan needs a separate verification artifact beyond its summary.
- When using `scribe-finisher`, its closure output should be normalized into the repo-local `PLAN` / `SUMMARY` / `VERIFY` templates instead of introducing a second summary format.
- External workflows may still help an operator execute a plan, but they are convenience tooling, not repo authority.

## Summary Sync Rules

After creating a `*-SUMMARY.md` file:

1. Update `STATE.md` with the new current position, notable decisions, blockers, and session continuity if execution status changed.
2. Update `ROADMAP.md` plan/phase progress if the summary changes completion state.
3. Update `REQUIREMENTS.md` only when the completed work actually verifies or changes requirement status.
4. If repo truth changed, record where the formal owner was updated in the summary itself.
5. Prefer concise factual syncs; do not duplicate the full summary into every planning file.

## Update Triggers

Refresh `.planning` when one of these changes:

- milestone goal or phase ordering
- active requirements or success criteria
- a meaningful implementation decision
- blockers, risks, or execution status
- codebase analysis that downstream AI work depends on

## Success Standard

This workspace is useful only if it reduces future decision cost and speeds up correct execution.

If it stops helping execution, or starts diverging from the repo's formal sources of truth, simplify it.
