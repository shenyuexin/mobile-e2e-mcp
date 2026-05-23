# Planning Plan Template

Use this template for `.planning/phases/<phase-dir>/<phase>-<plan>-PLAN.md`.

This is a **repo-local execution template**. It should be specific enough that a future session can resume from it without recovering hidden context.

---

## Frontmatter

```yaml
---
phase: 01-capability-verification-productization
plan: 01
title: Example plan title
status: planned
summary_file: 01-01-SUMMARY.md
verify_file: 01-01-VERIFY.md
requirements:
  - CAP-01
  - CFG-01
formal_truth_owners:
  - README.md
  - docs/path/to/doc.md
  - packages/path/to/file.ts
---
```

## Body Template

```md
# Phase 01 Plan 01

## Goal

### Problem
[One sentence describing what problem this plan is solving]

### Expected Outcome
- [ ] [Observable result 1]
- [ ] [Observable result 2]

### Non-goals
- [Out-of-scope item]

## Plan

### Strategy
[Short description of the intended approach]

### Read First
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `path/to/owning/spec-or-code.md`

### Task Breakdown
1. [Concrete subtask]
2. [Concrete subtask]
3. [Concrete subtask]

### Risks / Unknowns
- [Risk, ambiguity, or dependency]

### Done Criteria
- [ ] [Completion condition 1]
- [ ] [Completion condition 2]

## Implement

### Planned Changes
- `path/to/file` — [why it will change]

### Key Decisions To Preserve
- [Decision that downstream work must honor]

## Verify

### Test Cases
- [ ] [Case 1]
- [ ] [Case 2]

### Verification Commands
```bash
[exact command]
```

### Acceptance Criteria
- [Truth that must be supported by evidence]
- [Truth that must be supported by evidence]

### Success Criteria
- [Phase-local outcome that must be true]
- [Phase-local outcome that must be true]
```

## Required Rules

1. Keep `Expected Outcome`, `Done Criteria`, `Acceptance Criteria`, and `Success Criteria` observable and verifiable.
2. Put repo-specific truth owners in frontmatter when the work is expected to change code/docs/tests.
3. If the plan needs a separate verification artifact, point `verify_file` at the intended `*-VERIFY.md`.
4. Do not leave hidden dependencies in chat context only; move them into `Read First`, `Risks / Unknowns`, or `Key Decisions To Preserve`.
