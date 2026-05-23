# Planning Verify Template

Use this template for `.planning/phases/<phase-dir>/<phase>-<plan>-VERIFY.md` when a plan needs explicit acceptance or release evidence beyond its summary.

This file is for **internal planning evidence**. It records what was actually checked, what remains unproven, and whether the work is ready to advance.

---

## Body Template

```md
# Verify: Phase 01 Plan 01

## Verification Scope

- Plan: `01-01-PLAN.md`
- Summary: `01-01-SUMMARY.md`
- Verified on: YYYY-MM-DD
- Verified by: [name/agent]

## Goal-Backward Checks

### 1. [Acceptance criterion or must-have]
- Evidence type: command / test / screenshot / log / readback
- Evidence:
  - [Exact command, artifact path, or inspection note]
- Result: PASS / FAIL / PARTIAL

### 2. [Acceptance criterion or must-have]
- Evidence type: command / test / screenshot / log / readback
- Evidence:
  - [Exact command, artifact path, or inspection note]
- Result: PASS / FAIL / PARTIAL

## Requirement Coverage

- `CAP-01` — verified / partial / not verified
- `CFG-01` — verified / partial / not verified

## Formal Truth Checks

- Code/contracts checked: [paths]
- Docs checked: [paths]
- Tests/CI/validation checked: [paths]
- Drift found: none / [brief note]

## Open Gaps

- [What is still unproven, deferred, or waiting on human judgment]

## Decision

- Overall status: PASS / PARTIAL / FAIL / HUMAN_NEEDED
- Ready to advance: yes / no
- Next action: [ship / continue / add follow-up plan / wait for decision]
```

## Required Rules

1. Record only evidence that was actually gathered.
2. Verify backward from `Goal`, `Done Criteria`, `Acceptance Criteria`, and `Success Criteria`.
3. If status is `PARTIAL`, `FAIL`, or `HUMAN_NEEDED`, say exactly what is missing.
4. If repo truth drift exists, name the owner file that still needs correction.
