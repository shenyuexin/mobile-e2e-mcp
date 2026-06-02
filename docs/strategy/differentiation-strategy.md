# Differentiation Strategy (2026-2027)

## 1. Goals

Create defensible product advantages beyond being a wrapper around existing automation tools.

---

## 2. Primary Product Bet: Explorer Coverage Intelligence

Explorer should be treated as the main product surface, not as a secondary crawler or a demo path. It composes the capabilities that make this project differentiated in practice: device/session governance, deterministic-first UI inspection/action, bounded fallback, rule-based risk gates, interruption/recovery handling, and reviewable evidence artifacts.

The near-term product question is no longer "can the harness drive one golden path?" It is "can Explorer turn a real mobile app into useful coverage, risk, failure, and replay intelligence that developers can trust?"

Priority productization layers:

- PR-ready Explorer summaries from existing `summary.json`, `report.md`, and failure-review artifacts.
- Run-to-run coverage diffing for added/removed pages, changed paths, changed failures, and changed rule decisions.
- Replay-path extraction so discovered paths can become deterministic flows or targeted verification candidates.
- Evidence redaction and curation so large real-device runs can be promoted into public showcase assets without leaking app/account/device text.

---

## 3. Practical Differentiators

## D1. Semantic View-Tree Diffing (Quick Win)

Instead of pixel-only visual regression, compare semantic structure and intent in view trees.

Example assertion intent:

- "Primary checkout CTA exists below cart list; no error banner shown."

Value:

- Fewer false positives from non-functional visual changes.

## D2. Dynamic Network Fault Injection (No App Rebuild)

Support controlled network behavior mutation (latency/error/malformed payload) in test sessions.

Value:

- Faster edge-case validation without custom app instrumentation.

## D3. Self-Healing Selector Suggestions

When deterministic selectors fail but fallback succeeds, generate candidate selector updates as reviewable patch suggestions.

Value:

- Reduce long-term selector maintenance burden.

## D4. Time-Travel State Rehydration

Allow direct state setup + deep-link handoff to jump into deep screens quickly.

Value:

- Large reduction in end-to-end setup time.

## D5. Multi-Device Orchestration

Support coordinated actions/assertions across multiple devices in one session context.

Value:

- High-value scenarios (chat, realtime collaboration, marketplace dual roles).

## D6. Agentic Exploratory Chaos (Long-term)

Constrained autonomous exploration to discover unknown failure paths and produce reproducible scripts.

Value:

- Finds defects not covered by scripted scenarios.

---

## 4. Delivery Placement

- Primary near-term: Explorer coverage intelligence layers, D1
- Secondary near-term: D2
- Mid-term: D3, D4, Explorer replay-path extraction
- Expansion: D5
- R&D moonshot: D6

---

## 5. Risk Notes

- Any auto-healing output should be proposal-only by default (human-reviewed patch).
- Dynamic network tooling needs strict policy control and environment scoping.
- Explorer productization should build on the existing artifact contract instead of creating another evidence format.
- Exploratory chaos needs guardrails to prevent unbounded loops.
