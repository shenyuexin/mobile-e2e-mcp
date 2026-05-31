# React Native Readiness Doctor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an RN-specific readiness doctor that surfaces device, Metro, debug target, readiness-contract, and stable-selector blockers before live verification.

**Architecture:** Add a standalone showcase script that composes existing mobile-change readiness semantics with RN-specific Metro and selector checks. The first implementation is fixture-checkable and non-mutating; future runtime hooks can replace injected dependencies without changing the evidence schema.

**Tech Stack:** TypeScript, Node test runner, `tsx`, existing `listJsDebugTargetsWithMaestro`, existing mobile-change readiness concepts.

---

## Files

- Create: `scripts/showcase/react-native-readiness.ts`
- Create: `scripts/showcase/react-native-readiness.test.ts`
- Create: `docs/showcase/evidence/react-native-readiness/summary.json`
- Create: `docs/showcase/evidence/react-native-readiness/report.md`
- Modify: `package.json`
- Modify: `.planning/ROADMAP.md`
- Modify: `.planning/STATE.md`

## Checklist

- [ ] Define `react-native-readiness/v1` result shape with checks, blockers, proof boundary, next action, and support boundary.
- [ ] Add injected-device and injected-Metro tests for ready, no-device, Metro-unavailable, no-debug-target, and missing-selector cases.
- [ ] Implement the generator/checker script with deterministic fixture output.
- [ ] Add `generate:react-native-readiness`, `validate:react-native-readiness`, and `test:react-native-readiness` scripts.
- [ ] Generate committed fixture evidence and validate it.
- [ ] Write summary/verification artifacts and commit Phase 61.

## Acceptance Criteria

- `pnpm run test:react-native-readiness` passes.
- `pnpm run validate:react-native-readiness` passes in blocked fixture mode.
- The result distinguishes environment blockers from app verification failures.
- Output includes actionable next commands for device, Metro, debug target, and testID/readiness-contract gaps.
