# Architecture Doc Consolidation Plan

## Current State: 32 documents, 24,730 words, significant overlap and fragmentation

### Problems Identified

| Problem | Affected Docs | Impact |
|---|---|---|
| **No English index page** | overview.md (partial), README.zh-CN.md (Chinese only) | English readers have no navigation hub |
| **3 docs covering the same thing** | adapters-android.md + adapters-ios.md + adapters-react-native.md + adapters-flutter.md are all ~100-140 lines but should be unified | Fragmented platform reference |
| **Stale/outdated content** | adapters-ios.md still has Phase 1/Phase 2+ sections, WDA listed as "future" but already implemented | Misleads new contributors |
| **Duplicate concepts** | orchestration-robustness-strategy.md + bounded-retry + failure-attribution all overlap heavily on multi-step robustness | Reader confusion about which is authoritative |
| **zh-CN vs English divergence** | Many runtime docs only exist in zh-CN (session-orchestration, policy-engine, execution-coordinator, evidence-timeline, failure-attribution, interruption-orchestrator, platform-matrix) | English readers can't access core runtime architecture |
| **Strategic docs that are really roadmap content** | differentiation-strategy.md + ecosystem-landscape-2026.md are business/planning docs, not architecture | Should move to docs/strategy/ |
| **Over-detailed checklists** | harness-deepening-implementation-checklist.md + orchestration-robustness-checklist.md are task tracking, not architecture | Should be in .planning/ or removed |
| **adapter-code-placement.md too long** (401 lines) | It's a coding guide, should be a CONTRIBUTING section or .github/CONTRIBUTING.md | Bloated architecture directory |

---

## Proposed New Structure (4 core docs + index)

```
docs/architecture/
├── README.md                    ← NEW: English navigation hub (merge overview.md here)
├── README.zh-CN.md             ← Keep existing Chinese index
│
├── 01-system-architecture.md   ← COMBINED: architecture.md + system-architecture-overview.md
│   - High-level topology (Mermaid)
│   - Control Plane vs Execution Plane
│   - Session model
│   - Tool contract standards
│   - Adapter router
│   - AUT contract
│   - Reliability controls
│
├── 02-platform-adapters.md     ← COMBINED: adapters-android.md + adapters-ios.md + adapters-rn.md + adapters-flutter.md
│   - Unified platform adapter matrix
│   - Android: ADB + UIAutomator2 (current: FULL)
│   - iOS Simulator: AXe CLI (Phase 14+, FULL)
│   - iOS Physical: WDA HTTP API (Phase 15+, FULL)
│   - iOS Physical: devicectl lifecycle (Phase 13+, PARTIAL)
│   - React Native: Metro inspector + JS debug (Phase 12, PARTIAL)
│   - Flutter: framework instrumentation profile (PARTIAL)
│   - Backend selection logic (env var > auto-detect > fallback)
│   - Platform risks and mitigations
│
├── 03-capability-model.md      ← COMBINED: ai-first-capability-model.md + capability-map.md + framework-coverage.md
│   - AI-first capability layers (State, Evidence, Action, Attribution, Recovery, Governance)
│   - Capability domains (A-H from capability-map.md)
│   - Deterministic ladder
│   - Maturity levels (L1-L5)
│   - Platform implementation matrix summary
│   - Framework coverage overview
│
├── 04-runtime-architecture.md  ← COMBINED: execution-coordinator + bounded-retry + failure-attribution + evidence-timeline + orchestration-robustness (zh-CN + EN merged into single English doc)
│   - Deterministic-first action execution
│   - Fallback ladder (tree → semantic → OCR → CV)
│   - Bounded retry and state-change evidence
│   - Failure attribution and recovery
│   - Evidence timeline model
│   - Interruption handling (detect → classify → resolve → resume)
│   - Multi-step orchestration robustness
│   - OCR fallback architecture
│
├── 05-governance-security.md   ← RESTRUCTURED: governance-security.md + policy-engine (zh-CN summary) + human-handoff
│   - Security model (read-only/interactive/full-control)
│   - Access and isolation
│   - Audit requirements
│   - Reliability SLOs
│   - Cost controls
│   - Vision/OCR usage governance
│   - Human handoff and protected-page awareness
│   - Scope granularity roadmap
│
└── (removed or relocated)
    ├── adapters-android.md     → merged into 02-platform-adapters.md
    ├── adapters-ios.md         → merged into 02-platform-adapters.md
    ├── adapters-react-native.md → merged into 02-platform-adapters.md
    ├── adapters-flutter.md     → merged into 02-platform-adapters.md
    ├── architecture.md         → merged into 01-system-architecture.md
    ├── system-architecture-overview.md → merged into 01-system-architecture.md
    ├── ai-first-capability-model.md → merged into 03-capability-model.md
    ├── capability-map.md       → merged into 03-capability-model.md
    ├── framework-coverage.md   → merged into 03-capability-model.md
    ├── bounded-retry-and-state-change-evidence-architecture.md → merged into 04-runtime-architecture.md
    ├── execution-coordinator-and-fallback-ladder.zh-CN.md → merged into 04-runtime-architecture.md (translated)
    ├── failure-attribution-and-recovery-architecture.zh-CN.md → merged into 04-runtime-architecture.md (translated)
    ├── evidence-timeline-architecture.zh-CN.md → merged into 04-runtime-architecture.md (translated)
    ├── orchestration-robustness-strategy.md → merged into 04-runtime-architecture.md
    ├── orchestration-robustness-implementation-checklist.md → moved to .planning/
    ├── harness-deepening-debug-first-strategy.zh-CN.md → moved to .planning/
    ├── harness-deepening-debug-first-implementation-checklist.zh-CN.md → moved to .planning/
    ├── platform-implementation-matrix.zh-CN.md → content merged into 03 + 02-platform-adapters.md, original kept as zh-CN reference
    ├── policy-engine-runtime-architecture.zh-CN.md → governance summary in 05, full zh-CN doc kept
    ├── session-orchestration-architecture.zh-CN.md → kept as zh-CN only (session model is in 01-system-architecture.md English summary)
    ├── interruption-orchestrator-v2.zh-CN.md → interruption handling in 04-runtime-architecture.md English summary
    ├── mobile-e2e-ocr-fallback-design.md → OCR fallback section in 04-runtime-architecture.md
    ├── mobile-e2e-ocr-fallback-implementation-checklist.md → moved to .planning/
    ├── network-anomaly-runtime-architecture.md → kept (specialized topic)
    ├── differentiation-strategy.md → moved to docs/strategy/
    ├── ecosystem-landscape-2026.md → moved to docs/strategy/
    ├── adapter-code-placement.md → moved to CONTRIBUTING.md or kept as-is (implementation guide)
    ├── human-handoff-and-protected-page-awareness.md → merged into 05-governance-security.md
    ├── rn-debugger-sequence.md → kept as-is (specialized RN debugging topic)
    └── overview.md → merged into README.md (index)
```

---

## Implementation Priority

| Priority | Doc | Effort | Rationale |
|---|---|---|---|
| **P0** | Create `README.md` (English index) | 1 hour | Currently no English navigation |
| **P0** | Create `02-platform-adapters.md` | 2 hours | Most stale/outdated content (adapters-ios.md has WDA "future" bug) |
| **P1** | Create `01-system-architecture.md` | 2 hours | Core architecture in English, merge Mermaid diagram |
| **P1** | Create `03-capability-model.md` | 2 hours | Capability model is critical for understanding project scope |
| **P2** | Create `04-runtime-architecture.md` | 3 hours | zh-CN docs need translation/synthesis for English readers |
| **P2** | Create `05-governance-security.md` | 1 hour | Governance + human handoff merge |
| **P3** | Move strategy docs to docs/strategy/ | 30 min | Cleanup |
| **P3** | Move checklists to .planning/ | 30 min | Cleanup |
| **P3** | Delete merged original files | 30 min | Cleanup |

Total: ~12 hours of focused work

---

## What NOT to Change

- **zh-CN docs**: Keep original zh-CN files as references. The new English docs synthesize from them but don't replace them.
- **Specialized docs**: rn-debugger-sequence.md, network-anomaly-runtime-architecture.md stay as-is (they are focused topics, not core architecture).
- **adapter-code-placement.md**: Keep as implementation guide (it's a useful coding guide, not architecture).
