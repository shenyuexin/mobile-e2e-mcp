# Planning Summary Template

Use this template for `.planning/phases/<phase-dir>/<phase>-<plan>-SUMMARY.md`.

This is a **repo-local planning template** built around the GSD minimal closure: **Goal → Plan → Implement → Verify → Retro**.

It captures execution evidence and handoff context inside `.planning`, but it does not replace the repository's formal sources of truth in code, docs, tests, or CI.

---

## Frontmatter

```yaml
---
phase: 01-capability-verification-productization
plan: 01
summary_type: internal-planning
task_type: feature | bugfix | refactor | chore
completed: 2026-03-27
requirements_completed:
  - CAP-01
  - CFG-01
key_files:
  created: []
  modified: []
repo_truth_synced:
  - README.md
  - docs/path/to/doc.md
  - packages/path/to/file.ts
verify_file: 01-01-VERIFY.md
---
```

## Body Template

```md
# Phase 01 Plan 01 Summary

## Meta
- Task ID: 01-01
- Date: YYYY-MM-DD
- Repo: mobile-e2e-mcp
- Branch: [branch name]
- Owner: [name/agent]
- Type: feature | bugfix | refactor | chore

## Goal

### Problem
[One sentence describing what problem this work addressed]

### Expected Outcome
- [x] [Observable result 1]
- [x] [Observable result 2]

### Non-goals
- [Out-of-scope item]

## Plan

### Strategy
[One sentence describing the approach actually taken]

### Task Breakdown
1. [Subtask completed]
2. [Subtask completed]
3. [Subtask completed]

### Risks / Unknowns
- [Risk or ambiguity that mattered during execution]

### Done Criteria
- [x] [Completion condition 1]
- [x] [Completion condition 2]

## Implement

### Changes
- `path/to/file` — [why it changed]
- `path/to/file` — [why it changed]

### Key Decisions
- [Decision and rationale]

### Notes
- [Workaround, follow-up note, or execution caveat]

### Deviations
- None — executed within planned scope.

## Verify

### Test Cases
- [x] [Case 1]
- [x] [Case 2]

### Evidence Types
- [x] test
- [x] command
- [ ] screenshot
- [ ] log

### Evidence
```bash
[exact command]
# [relevant output]
```

- Artifact / diff / readback:
  - [Concrete evidence note]

### Result
- ✅ Success / ❌ Fail / ⚠️ Partial

### Execution Metrics
- Duration: [e.g. 35 min]
- Verification scenarios run: [count]
- Environments checked: [android emulator / device / local package install / etc.]
- Notable evidence count: [count or short note]

## Retro

### What went well
- [What helped execution go smoothly]

### What went wrong
- [Problem, friction, or missed assumption]

### Reusable Rule
- If [trigger], then [standard action], because [reason].

### Optimization Ideas
- [What to do earlier or differently next time]

## Source-of-Truth Sync

- Formal repo truth affected: yes / no
- If yes, where it was updated: [`README.md`, `docs/...`, `packages/...`, tests/CI path]

## Next Step

- Ready for `01-02-PLAN.md` / follow-up verify / roadmap update / no immediate follow-up
```

## Required Rules

1. Keep `Goal`, `Verify`, and `Retro` sections in every summary.
2. `Expected Outcome`, `Done Criteria`, and `Result` must reflect what was actually achieved, not what was intended.
3. Include real verification evidence, not planned commands only.
4. Add at least one `Reusable Rule` in `Retro`.
5. If execution changed repo truth, name the formal file(s) that were updated.
6. Use this summary as planning evidence only; shipped behavior is still defined by the repo's formal truth owners.
