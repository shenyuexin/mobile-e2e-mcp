# React Native Evidence Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package RN readiness, Metro console/network summaries, native evidence references, and bounded failure context into one reviewable artifact.

**Architecture:** Add an RN evidence pack builder that consumes the Phase 61 readiness artifact plus injected or generated JS/native evidence summaries. Metro evidence is marked supplemental so the harness does not overclaim RN runtime proof.

**Tech Stack:** TypeScript, Node test runner, `tsx`, JSON/Markdown evidence artifacts.

---

## Files

- Create: `scripts/showcase/react-native-evidence-pack.ts`
- Create: `scripts/showcase/react-native-evidence-pack.test.ts`
- Create: `docs/showcase/evidence/react-native-evidence-pack/evidence-pack.json`
- Create: `docs/showcase/evidence/react-native-evidence-pack/evidence-pack.md`
- Modify: `package.json`
- Modify: `.planning/ROADMAP.md`
- Modify: `.planning/STATE.md`

## Checklist

- [ ] Define `react-native-evidence-pack/v1` with readiness, JS signal, native evidence, failure summary, review status, and proof boundary fields.
- [ ] Add tests for blocked readiness, supplemental JS evidence, and success-candidate proof labeling.
- [ ] Implement renderer and validator.
- [ ] Generate fixture-backed evidence pack.
- [ ] Add package scripts and smoke validation.
- [ ] Write summary/verification artifacts and commit Phase 62.

## Acceptance Criteria

- `pnpm run test:react-native-evidence-pack` passes.
- `pnpm run validate:react-native-evidence-pack` passes.
- The pack never treats Metro-only evidence as live verification success.
- Review status and next action are machine-consumable.
