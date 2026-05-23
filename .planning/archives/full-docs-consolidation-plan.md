# Full Docs Consolidation Plan

## Current State: 50 documents, 28,064 words across 6 subdirectories

```
docs/
├── README.md                          — 公共入口，保留
├── architecture/ (14 files)           — 刚整合完，结构良好 ✅
├── delivery/ (2 files)
├── engineering/ (4 files)
├── guides/ (7 files)
├── showcase/ (8 files)
├── strategy/ (4 files)
└── templates/ (8 files)
```

---

## Assessment by Directory

### docs/delivery/ (2 files, 323 lines)
| File | Status | Reason |
|---|---|---|
| roadmap.md | 🟡 保留但简化 | 交付路线，但部分内容已过时 |
| npm-release-and-git-tagging.zh-CN.md | ✅ 保留 | 发版规范，操作性文档 |

### docs/engineering/ (4 files, 1789 lines) — 最大问题区
| File | Status | Reason |
|---|---|---|
| ai-first-capability-expansion-guideline.md | ✅ 保留 | AI coding agent 核心指南 |
| capability-family-inventory.md | 🟡 合并 | 能力清单应归入 architecture 能力模型 |
| ai-first-capability-refactor-architecture-roadmap.zh-CN.md | ❌ 删除 | 重构路线图，内容已并入架构文档 |
| type-export-sequencing-guideline.md | ❌ 移到 .planning/ | 一次性实现指南，已完成 |

### docs/guides/ (7 files, 1289 lines)
| File | Status | Reason |
|---|---|---|
| external-tools.md | ✅ 保留 | 外部工具统一指南 |
| wda-setup.md | ✅ 保留 | WDA 专用设置指南 |
| flow-generation.md | ✅ 保留 | Flow 生成/导出指南 |
| golden-path.md | ✅ 保留 | 首次运行闭环指南 |
| record-session-quickstart.md | ✅ 保留 | 录制快速入门 |
| vivo-oppo-multi-user-replay.md | ✅ 保留 | 特定 OEM 排障手册 |
| ai-agent-invocation.zh-CN.md | ✅ 保留 | AI 调用中文指南 |

### docs/showcase/ (8 files, 640 lines) — 演示证据
| File | Status | Reason |
|---|---|---|
| README.md | ✅ 保留 | showcase 索引 |
| android-real-device-demo-run-2026-03-18.md | ✅ 保留 | 实际运行证据 |
| ci-evidence.md | ✅ 保留 | CI 验证 |
| demo-playbook.zh-CN.md | ✅ 保留 | 演示剧本 |
| failure-intelligence-demo.md | ✅ 保留 | 失败智能演示 |
| flow-record-replay-demo.md | ✅ 保留 | 回放演示 |
| ios-recording-showcase.md | ✅ 保留 | iOS 录制展示 |
| record-session-demo.md | ✅ 保留 | 录制演示 |

### docs/strategy/ (4 files, 922 lines)
| File | Status | Reason |
|---|---|---|
| differentiation-strategy.md | ✅ 保留 | 差异化策略（从 architecture 移来） |
| ecosystem-landscape-2026.md | ✅ 保留 | 竞品生态分析 |
| record-replay-productization.md | 🟡 合并 | 产品化方案，部分内容可并入 delivery roadmap |
| record-replay-structural-fix-plan.md | ❌ 移到 .planning/ | 修复计划，已完成 |
| ios-recording-implementation-checklist.md | ❌ 移到 .planning/ | 实现清单，一次性跟踪 |

### docs/templates/ (8 files, 220 lines) — 模板
| File | Status | Reason |
|---|---|---|
| acceptance-evidence-template.md | ✅ 保留 | 验收模板 |
| adr-template.md | ✅ 保留 | 架构决策模板 |
| bug-packet-template.md | ✅ 保留 | Bug 报告模板 |
| dependency-decision-register.md | ✅ 保留 | 依赖决策登记 |
| phase-charter-template.md | ✅ 保留 | Phase 章程模板 |
| phase-review-checklist.md | ✅ 保留 | Phase 审查清单 |
| sample-app-matrix-template.md | ✅ 保留 | 样本应用矩阵模板 |
| workstream-status-template.md | ✅ 保留 | 工作流状态模板 |

### docs/README.md (1 file)
| File | Status | Reason |
|---|---|---|
| README.md | 🟡 重写 | 当前太简单，应成为 docs/ 完整导航 |

---

## Consolidation Actions

| # | Action | Target | Effort |
|---|---|---|---|
| 1 | Rewrite docs/README.md | Full docs navigation hub | 30 min |
| 2 | Merge capability-family-inventory.md → architecture/03-capability-model.md | engineering/ | 30 min |
| 3 | Delete ai-first-capability-refactor-architecture-roadmap.zh-CN.md | engineering/ | 5 min |
| 4 | Move type-export-sequencing-guideline.md → .planning/ | engineering/ | 5 min |
| 5 | Merge record-replay-productization.md → delivery/roadmap.md | strategy/ → delivery/ | 30 min |
| 6 | Move record-replay-structural-fix-plan.md → .planning/ | strategy/ | 5 min |
| 7 | Move ios-recording-implementation-checklist.md → .planning/ | strategy/ | 5 min |
| 8 | Update cross-references in affected docs | Multiple | 30 min |

Total: ~2 hours

Result: 50 → ~43 files (14% reduction), better organization
