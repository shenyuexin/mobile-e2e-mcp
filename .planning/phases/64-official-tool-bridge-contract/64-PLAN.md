# Official Tool Bridge Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define a machine-readable bridge matrix for official Android and Flutter AI/mobile tools as upstream evidence/context providers.

**Architecture:** Add a bridge contract generator that classifies Android CLI/Journeys, Android Studio Journeys, and Dart/Flutter MCP outputs by role, acceptable evidence, proof boundary, and intake decision. This keeps official-tool integration explicit without pretending the harness owns those runtimes.

**Tech Stack:** TypeScript, Node test runner, `tsx`, JSON/Markdown contract artifacts.

---

## Files

- Create: `scripts/showcase/official-tool-bridge.ts`
- Create: `scripts/showcase/official-tool-bridge.test.ts`
- Create: `docs/showcase/evidence/official-tool-bridge/bridge.json`
- Create: `docs/showcase/evidence/official-tool-bridge/bridge.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.planning/ROADMAP.md`
- Modify: `.planning/STATE.md`

## Checklist

- [ ] Define `official-tool-bridge/v1` matrix entries for Android CLI Journeys, Android Studio Journeys, and Dart/Flutter MCP.
- [ ] Add tests that reject replacement claims and require proof-boundary language.
- [ ] Implement generator/checker and renderer.
- [ ] Generate committed bridge contract evidence.
- [ ] Update README positioning to describe complementary relationship.
- [ ] Write summary/verification artifacts and commit Phase 64.

## Acceptance Criteria

- `pnpm run test:official-tool-bridge` passes.
- `pnpm run validate:official-tool-bridge` passes.
- The bridge matrix says which outputs may enter evidence intake and which cannot claim mobile verification success alone.
