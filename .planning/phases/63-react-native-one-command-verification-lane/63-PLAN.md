# React Native One-Command Verification Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single RN developer command that orchestrates readiness and evidence packing while preserving proof boundaries.

**Architecture:** Add a thin command script that invokes or injects Phase 61/62 steps and writes a compact RN verification result. It is intentionally orchestration-only; runtime proof remains owned by readiness/evidence artifacts.

**Tech Stack:** TypeScript, Node test runner, `tsx`, package scripts.

---

## Files

- Create: `scripts/showcase/react-native-one-command.ts`
- Create: `scripts/showcase/react-native-one-command.test.ts`
- Create: `docs/showcase/evidence/react-native-one-command/result.json`
- Create: `docs/showcase/evidence/react-native-one-command/result.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.planning/ROADMAP.md`
- Modify: `.planning/STATE.md`

## Checklist

- [ ] Define `react-native-one-command/v1` with stages, verdict, proof level, evidence paths, blockers, next action, and boundaries.
- [ ] Add tests for blocked readiness, successful fixture orchestration, and evidence-pack failure propagation.
- [ ] Implement script and renderer.
- [ ] Add `verify:react-native-change`, `validate:react-native-one-command`, and `test:react-native-one-command` scripts.
- [ ] Update README capability showcase with the RN command path and caveats.
- [ ] Write summary/verification artifacts and commit Phase 63.

## Acceptance Criteria

- `pnpm run test:react-native-one-command` passes.
- `pnpm run validate:react-native-one-command` passes.
- README presents RN capability as experimental and evidence-backed, not broad RN parity.
