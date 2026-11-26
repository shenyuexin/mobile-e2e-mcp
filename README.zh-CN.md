# Mobile E2E MCP

[![npm version](https://img.shields.io/npm/v/%40shenyuexin%2Fmobile-e2e-mcp)](https://www.npmjs.com/package/@shenyuexin/mobile-e2e-mcp)
[![CI（build + typecheck + unit + smoke）](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)
[![Platform Smoke（iOS 模拟器 + Android 模拟器）](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml)
[![Real Device Acceptance（self-hosted）](https://img.shields.io/badge/Real%20Device%20Acceptance-self--hosted%20manual-0A66C2)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml)

[English](README.md) | 简体中文

> 通过 MCP 给 AI Agent 提供安全的移动设备控制层：以 policy、session、evidence 为核心，覆盖 Android / iOS 确定性优先执行、有边界视觉兜底与可审计结果。

本仓库是一个 pnpm monorepo，组合了 MCP 工具层、执行适配层与架构文档，用于让 AI Agent 在检查、操作和排障移动应用时，不必直接依赖不可治理的裸设备命令。

## 快速开始

```json
{
  "mcpServers": {
    "mobile-e2e-mcp": {
      "command": "npx",
      "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest"]
    }
  }
}
```

默认情况下，MCP stdio 服务启用 **`core` 工具集（20 个高频核心工具，含 `audit_ui_surface` 结构体检、`perform_gesture` 画布/多点手势与 `record_screen` 录屏证据）**，可显著降低 Agent 上下文 schema 开销（减少约 71%）。如需暴露全部 **68 个 MCP 工具**（录制回放、失败归因、网络策略诊断、性能采集、JS 调试目标等），可传入 `--toolset full` 或设置环境变量 `MOBILE_E2E_TOOLSET=full`：

```json
{
  "mcpServers": {
    "mobile-e2e-mcp": {
      "command": "npx",
      "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest", "--toolset", "full"]
    }
  }
}
```

### 统一单入口 CLI

单包二进制入口同时提供 MCP stdio 服务与本地 CLI 工作流（`stdio`、`doctor`、`init`、`explore`、`run`、`audit`、`diff`、`setup-agent`）：

```bash
# 检查本地 Android/iOS 工具链与已连接设备
npx -y @shenyuexin/mobile-e2e-mcp@latest doctor

# 自动识别 Android / iOS / RN / Expo / Flutter，并生成带 settle 等待的 smoke flow
npx -y @shenyuexin/mobile-e2e-mcp@latest init --no-prompt --with-smoke-flow

# 为 AI 客户端一键安装 MCP 配置与工作流指引（claude|cursor|opencode|codex）
npx -y @shenyuexin/mobile-e2e-mcp@latest setup-agent --target claude --toolset core

# 在受治理 session 内运行确定性 flow
npx -y @shenyuexin/mobile-e2e-mcp@latest run flows/smoke.yaml --dry-run

# 仅保留失败录屏，并在 flow 失败时给出只供审阅的选择器修复 diff
npx -y @shenyuexin/mobile-e2e-mcp@latest run flows/smoke.yaml \
  --record-on-failure --record-output artifacts/run.mp4 --suggest-heal

# 在受治理 session 内执行 UI 体检，并用基线回归作为 PR 门禁
npx -y @shenyuexin/mobile-e2e-mcp@latest audit \
  --baseline-path .e2e/ui-baseline.json --fail-on-regression

# 对比两次 Explorer 运行，输出 PR Markdown 与自包含 HTML 报告
npx -y @shenyuexin/mobile-e2e-mcp@latest diff ./explore-report/base ./explore-report/head \
  --markdown diff.md --html diff.html --fail-on-regression
```

`audit` 通过 `start_session` → `audit_ui_surface` → `end_session` 调用现有工具，默认从 `.e2e/config.yaml`（含 `audit:` 段）继承配置；设置 `--fail-on-regression` 后，一旦检测到基线回归即以非零码退出。`diff` 读取两次运行的 `summary.json`、`failure-review.json` 与可选的 `audit*.json`，配合 `--fail-on-regression` 即可作为零脚本 CI 质量门禁。

`run --record-on-failure` 在 `run_flow` 前启动 `record_screen`，并在 `finally` 中停止：通过时丢弃录像，失败时保留为证据，文本输出与 `--json` 都会带上保存路径（或丢弃状态）；`--dry-run` 下跳过真实录屏。`run --suggest-heal` 在失败时组合 `explain_last_failure`、`suggest_known_remediation` 与只读 `inspect_ui`，生成结构化建议和 unified diff 片段——严格只做提案，绝不修改用户的 flow YAML。

`init` 会自动识别 Android、iOS、React Native / Expo 与 Flutter 工程，预填 `platform`、`appId`、`runnerProfile` 和仅供参考的 `buildCommand`；`--with-smoke-flow` 会生成带启动步骤与显式 settle 等待的 `.e2e/flows/smoke.yaml`。显式 flag 始终优先于自动识别。`setup-agent` 幂等地把 `@shenyuexin/mobile-e2e-mcp@latest` MCP 条目与简洁工作流指引合并进目标客户端配置，并保留无关 MCP server。`doctor` 解析 `axe --version`，当 AXe 低于 v2.2.0（`perform_gesture` 与 `axe serve` 的最低要求）时给出可直接复制的 `brew upgrade cameroncooke/axe/axe` 升级命令。以上都不新增 MCP 工具——注册表仍为 68 个工具 / 20 个核心工具。

## Explorer：核心产品面

Explorer 是这个仓库最核心的对外产品能力——一个内置于 MCP 服务器的 DFS 自动页面遍历引擎。它不是旁路附加的 crawler，而是把移动端 AI Agent 真正需要的一整套核心能力串成闭环：设备发现、可审计 session、UI inspection、受限 UI action、规则风险门控、中断/恢复处理以及结构化 evidence。

适合用 Explorer 回答的问题包括：

- 从当前入口能到达哪些页面？
- 哪些路径被 policy、外部 app 边界、风险规则或连续失败挡住？
- 两次探索之间，页面覆盖、失败、规则决策发生了什么变化？
- 哪些已发现路径值得提升为确定性 replay flow 或 PR review evidence？

```bash
npx -y @shenyuexin/mobile-e2e-mcp@latest explore \
  --app-id com.example.app \
  --platform android \
  --output ./explore-report \
  --export-flows ./flows/generated
```

核心特性：

- **DFS 遍历**：系统化地从起始点探索所有可达页面
- **状态图追踪**：记录已访问状态，检测循环以避免无限遍历
- **熔断器**：当探索收益递减或达到配置限制时自动停止
- **规则门控**：遵循跳过页面、跳过元素、采样与风险门控规则，确保安全探索
- **中断感知证据**：被阻塞、被跳过、被外部边界截断或失败的遍历决策都会带原因，方便复盘而不是只看原始日志
- **实验性横向滚动兜底**：垂直分段遍历结束后，可通过有边界的页面身份校验探测横向可滚动区域
- **iOS/iPad 加固与工程配置**：支持 SplitView/Popover 作用域识别、防止跑偏到 SpringBoard/Dock/Spotlight 的前台预检、可重复 `--launch-env KEY=VALUE` 注入、`.e2e/config.yaml` 自动加载以及 `--no-prompt --config` 只读保护
- **确定性 flow 导出**：`--export-flows <dir>` 将最深的可达、未失败、未被阻断路径导出为 Maestro 兼容 YAML smoke flow，并写入显式 settle 等待

### 输出产物

Explorer 会生成一个包含结构化产物的目录：

| 文件 | 说明 |
|------|-------------|
| `tree.txt` | 所有已发现页面与导航路径的 ASCII 树 |
| `report.md` | 人类可读的覆盖率报告，按模块分组 |
| `report.html` | 自包含单文件 HTML 报告（内联 CSS/JS，无外部 CDN 依赖） |
| `failure-review.md` | 人类可读的失败复盘，按失败模式分组并给出下一步建议 |
| `failure-review.json` | 机器可消费的失败复盘摘要 |
| `summary.json` | 机器可消费的指标与页面元数据 |
| `config.json` | 运行时配置与本次运行的规则设置 |

一次针对 iOS Settings 的真实运行示例输出（181 个页面，最大深度 5）：

- [`tree.txt`](docs/showcase/explorer/tree.txt) — 完整页面层级
- [`report.md`](docs/showcase/explorer/report.md) — 模块分组与路径
- [`summary.json`](docs/showcase/explorer/summary.json) — 指标与元数据

本地真机运行会写入 `output/evidence/explorer/`。架构设计与规则配置参考：

- [Explorer 混合遍历设计](docs/architecture/explorer-hybrid-traversal-ascii.md)
- [Explorer 规则注册表](docs/engineering/explorer-rule-registry.zh-CN.md)

## 核心切入点：受治理的 Agent 控制

这个项目最强的使用场景不是“替代所有移动端 E2E 框架”，而是：给 AI Agent 一个更安全的移动设备控制平面。

相比很薄的 `adb` 或平台命令 wrapper，这个 harness 补上的是：

- **策略边界**：动作执行前会先经过 policy profile 校验。
- **可审计 session**：动作被放进 session、lease、audit、evidence 语境里。
- **能力边界披露**：Agent 可以在行动前查询平台支持范围与限制。
- **结构化结果**：失败、拒绝、证据不是纯日志，而是机器可消费结果。

可以复跑 dry-run proof：

```bash
pnpm run proof:governed-agent-mobile-control
```

该 proof 会在 `output/showcase/governed-agent-mobile-control/<run-id>/` 下生成带时间戳的证据包，并验证 read-only session 会用结构化 `POLICY_DENIED` 阻止交互动作。详见 [Governed Agent Mobile Control Proof](docs/showcase/governed-agent-mobile-control.md)。

## 项目定位：面向 AI 的 Mobile E2E Harness

本仓库同时包含**可执行实现**（MCP server、adapters、contracts、core 编排能力）与**架构和交付知识库**（设计原则、能力模型、阶段规划文档）。它的核心定位是一个 **Explorer-led、给 AI Agent 用的受治理移动控制层**——在多后端间路由 E2E 动作，以策略约束、会话治理、确定性优先与结构化证据确保可控执行，而不是薄封装的测试 runner。

为什么团队会用这个 harness：

- **Deterministic-first**：优先稳定定位与可解释重试，再进入有边界 OCR/CV 兜底
- **Failure-intelligence**：失败携带原因码、证据产物、候选根因与修复建议
- **Governance-aware**：策略 profile、可审计 session 与受控工具面
- **Evidence-first**：真机 Explorer/probe 产物、历史录屏演示与 CI 校验过的 smoke 证据包协同沉淀

## 能力展示

### GIF 快速预览

| Happy Path GIF | 中断恢复 GIF |
|---|---|
| ![Happy Path 预览](docs/showcase/assets/happy-preview.gif) | ![中断恢复预览](docs/showcase/assets/interruption-preview.gif) |

快速体验可复现演示、真机验证与 CI 证据入口：

- **真机录屏与 Explorer/probe 证据**：
  - 历史录屏：[`m2e-happy-path-scroll-pause-40s.mp4`](docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4)、[`m2e-interruption-home-recovery-35s.mp4`](docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4)
  - Android 真机 Explorer 证据（45 页面、最大深度 4、0 失败）：`docs/showcase/evidence/android-explorer-full-2026-04-28T03-38-20/`（`pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4`）
  - 设备 probe 入口：`pnpm run validate:android-tool-probe`（最新 Vivo V2405A 真机结果：20/23 success、0 partial、3 个预期诊断类失败）与 `pnpm run validate:ios-tool-probe`
- **受治理控制与移动变更验证**：
  - `pnpm run quickstart:governed-control`（首次运行 readiness 与下一步命令指南）
  - `pnpm run proof:governed-agent-mobile-control` / `pnpm run proof:governed-policy-escalation`
  - `pnpm run verify:mobile-change`（一条命令跑移动变更验证；contract 模式可用 `-- --live --contract=configs/readiness/mobile-change.android.json`）
  - `pnpm run verify:react-native-change`（实验性 RN lane，编排 readiness 与 evidence-pack；只有接入设备、Metro/调试目标并完成 intake 才算 live 成功证据，blocked 输出不代表成功）
- **开箱即用的 CI 门禁与真开源 App 演示**：
  - [可复用 GitHub Action](.github/actions/mobile-e2e-gate/action.yml) — `audit` / `explore` / `run` / `diff` 门禁，使用 `actions/upload-artifact@v4` 与可选 `gh pr comment`；输入仅通过 `env:` 传入 shell 步骤
  - [真开源 App Killer Demo](docs/showcase/killer-demo-real-app.md) — Wikipedia/Mastodon 两个 60 秒流程，明确标注 `reproducible-demo`（模板，不是真机证明）
- **完整证据索引与 AI 调用指南**：
  - [演示与证据总索引](docs/showcase/README.md) — 完整收录全部 `generate:*` / `validate:*` 命令、失败归因/交接包及跟踪证据报告
  - [CI 证据与边界说明](docs/showcase/ci-evidence.md)、[CI 运行记录](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)、[Platform Smoke](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml)、[Real Device Acceptance](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml)
  - 指南文档：[AI Agent 调用指南](docs/guides/ai-agent-invocation.zh-CN.md)、[Golden Path](docs/guides/golden-path.md)、[Flow 生成指南](docs/guides/flow-generation.md)

## FAQ

### 什么是面向 AI Agent 的 mobile E2E harness？

它是一个执行编排层，让 AI Agent 能在可控边界内稳定执行移动端动作，并拿到可机器消费的结果与证据，而不只是"命令成功/失败"。

### 这个 harness 能跑 Android 真机吗？

可以。当前真机证据以 Explorer/probe 产物为主；历史演示脚本保存在 `scripts/legacy/dev/*`，录屏和展示资产见 `docs/showcase/*`。最新 Android Vivo probe 使用 `native_android` 跑通了 Settings 核心 UI action 与 `resume_interrupted_action` 链路；少数诊断/负向路径在缺少 Metro 等前置条件时不会全绿。

### 这个 harness 怎么处理中断恢复？

它会检测中断信号、分类中断类型，并执行有边界恢复动作（例如 `recover_to_known_state`），然后继续后续流程。

### 它是要替代 Appium / Maestro 吗？

不一定。更准确说法是：它是更上层的 orchestration harness，可与既有执行生态共存，同时补足 AI 场景下的治理与诊断能力。

### 哪些场景最适合这个 harness？

需要安全移动设备访问的 AI Agent、发布门禁回归（release-gate）、脆弱流程排障、AI 驱动探索式检查、以及需要审计证据的真机 CI 场景。

### 什么是 Explorer，什么时候应该用？

Explorer 可以在没有预定义流程的情况下自动遍历应用页面。当你需要大范围覆盖发现、想 mapping 一个不熟悉的应用导航结构，或在编写定向测试流程前需要先识别所有可达页面时，就可以使用它。通过 `explore` CLI 命令即可调用。

Android 真机 Explorer 证据保存在 `docs/showcase/evidence/android-explorer-full-2026-04-28T03-38-20/`：Settings 全量遍历已完成，耗时 33m 50s，覆盖 45 个页面，最大深度 4，失败数 0。

可用 `pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4` 离线校验这组证据。

## Appium / Maestro 与本 Harness 的关系

| 维度 | Appium / Maestro | Mobile E2E MCP Harness |
|---|---|---|
| 核心角色 | 自动化框架 / flow runner | 面向 AI 的编排 harness |
| 执行策略 | 以动作执行为中心 | 确定性优先 + policy/session 治理 |
| 失败处理 | 命令或断言失败信息 | 结构化诊断 + 候选根因排序 + 修复建议 |
| AI 适配 | 可接入，但非一等抽象 | 原生面向 AI Agent 设计 |
| 证据模型 | 依赖外部拼装 | 内建证据优先 action outcome |
| Helper app 依赖 | iOS/Android 回放都需要 | Android: owned-adb 主路径（常用命令不需要 helper app）；iOS 模拟器: axe CLI；iOS 真机: WDA（一次性配置，详见 [外部工具指南](docs/guides/external-tools.md)） |

## 官方 AI 移动端工具与本 Harness 的关系

Android CLI/Journeys、Android Studio Journeys 与 Dart/Flutter MCP Server 属于互补的上游工具，而不是本 harness 的替代品。它们适合提供原生框架上下文、旅程编写或原生执行；只有在证明边界（proof boundary）明确的前提下，才将它们的输出纳入 mobile-e2e 的证据 intake 链路。

可通过以下命令生成机器可读的桥接契约：

```bash
pnpm run validate:official-tool-bridge
```

当前关系矩阵见 `docs/showcase/evidence/official-tool-bridge/bridge.md`。

## 端到端执行原理（How It Works）

典型执行路径：

1. Agent/客户端通过 stdio 或 dev CLI 调用 MCP 工具。
2. MCP server 完成输入校验并执行策略检查。
3. 解析（或创建）会话上下文，并套用租约/调度约束。
4. 适配层优先选择确定性执行路径。
5. 返回结构化结果包（而不是裸文本）。
6. 附加证据（截图、日志、状态摘要、时间线）用于审计与排障。
7. 若确定性路径失败且策略允许，才进入有边界 OCR/CV 兜底。

所以该项目重点不仅是"点点点"，而是 **session + policy + evidence** 的可控执行。

## 高层架构

核心分层：

- **控制平面（Control Plane）**：工具契约、策略校验、会话编排、审计与证据索引
- **执行平面（Execution Plane）**：平台动作执行、UI 解析、重试/中断处理、视觉兜底

架构参考：

- [系统架构与契约（01）](docs/architecture/01-system-architecture.md)
- [平台适配与框架 Profile（02）](docs/architecture/02-platform-adapters.md)
- [架构文档索引（English）](docs/architecture/README.md) | [架构导航索引（中文）](docs/architecture/README.zh-CN.md)

Source-of-truth 说明：

- 架构文档既描述当前基线，也描述目标态设计。
- 如果文档表述与严格校验行为冲突，以 `packages/contracts/*.schema.json` 和 `configs/policies/*.yaml` 的当前实现为准。

## 能力地图（当前范围）

- **设备与环境控制**：设备发现、租约隔离、环境约束
- **应用生命周期**：安装/启动/终止/重置/深链入口
- **页面感知与交互**：UI inspect/query、tap/type/wait、flow 执行
- **诊断与证据**：日志、崩溃信号、性能、截图/时间线证据
- **可靠性与恢复**：原因码失败、有限重试、恢复建议工具

工具注册与签名入口：`packages/mcp-server/src/server.ts`，描述符元数据与 wrapper 组合：`packages/mcp-server/src/index.ts`。

## 完整 MCP 工具目录（当前）

服务**默认暴露 20 个 `core` 工具**，传入 `--toolset full` 或设置 `MOBILE_E2E_TOOLSET=full` 可启用**全部 68 个工具**。

<details>
<summary>展开查看全部 68 个 MCP 工具（9 大分类）</summary>

### 1）会话与生命周期

`start_session`、`request_manual_handoff`、`end_session`、`run_flow`、`reset_app_state`

### 2）任务编排与流程采集

`execute_intent`、`complete_task`、`start_record_session`、`get_record_session_status`、`end_record_session`、`cancel_record_session`、`export_session_flow`、`record_task_flow`、`validate_flow`

### 3）设备与应用控制

`list_devices`、`install_app`、`launch_app`（支持 iOS 模拟器 `launchEnv` / `launchArgs` / `terminateRunning`）、`terminate_app`、`describe_capabilities`、`doctor`

### 4）UI 感知、定位与交互

`inspect_ui`、`query_ui`、`resolve_ui_target`、`audit_ui_surface`（支持通过 `baselinePath` / `baselineMode` 做结构基线增量门禁比对）、`scroll_only`、`perform_gesture`（iOS 模拟器通过 AXe v2.2+ 完整支持 `draw` / `drag` / `pinch` / `double_tap` / `two_finger_tap`；Android 通过 `adb` 部分支持 `drag` / 两点 `draw` / `double_tap`）、`scroll_and_resolve_ui_target`、`wait_for_ui`、`wait_for_ui_stable`、`tap`、`tap_element`、`scroll_and_tap_element`、`type_text`、`type_into_element`、`navigate_back`（iOS 模拟器 AXe 只读/采集命令 `describe-ui` / `displays` / `screenshot` / `ping` 默认复用按 UDID 维护的常驻 `axe serve` 传输池，空闲自动释放，支持 `M2E_DISABLE_AXE_SERVE=1` 关闭；HID 输入命令保持单次调用以避免 `dtuhidd` 虚拟 HID 服务泄漏）

### 5）证据、可观测与诊断

`take_screenshot`、`record_screen`（支持固定时长与非阻塞 `start`/`stop` 含 `discardOnStop` 及 180s 上限；iOS 模拟器优先 `axe record-video` 并带 `simctl` 兜底，Android 走 `adb shell screenrecord`，iOS 真机明确返回 `UNSUPPORTED_OPERATION`）、`get_logs`、`get_crash_signals`、`collect_diagnostics`、`collect_debug_evidence`、`get_screen_summary`、`get_session_state`、`get_page_context`、`capture_js_console_logs`、`capture_js_network_events`、`list_js_debug_targets`、`capture_element_screenshot`、`compare_visual_baseline`

### 6）中断处理

`detect_interruption`、`classify_interruption`、`resolve_interruption`、`resume_interrupted_action`

### 7）失败分析、恢复与修复建议

`perform_action_with_evidence`、`get_action_outcome`、`explain_last_failure`、`rank_failure_candidates`、`find_similar_failures`、`compare_against_baseline`、`recover_to_known_state`、`replay_last_stable_path`、`suggest_known_remediation`、`replay_checkpoint_chain`

### 8）性能分析

`measure_android_performance`、`measure_ios_performance`

### 9）网络诊断

`probe_network_readiness`、`diagnose_network_failure`、`inspect_network_policy`

`probe_network_readiness` 检查运行时连通性、DNS、延迟和可选后端可达性。`diagnose_network_failure` 从已观察到的失败请求出发，判断失败是否很可能来自 Android cleartext 或 iOS ATS release 策略拦截。`inspect_network_policy` 保留为底层静态检查器，使用已解码的 manifest、network-security-config、Info.plist，或可读 APK/IPA ZIP artifact 证据，检查普通 HTTP endpoint 是否被策略允许。这些工具不代理流量，也不修改 App 配置。

</details>

精确签名与输入输出以 `packages/mcp-server/src/server.ts`（工具注册源）为准。

## 确定性阶梯与兜底策略

动作解析顺序是强约束：

1. 稳定 ID/resource-id/testID/可访问性标识
2. UI 树语义匹配（text/label/role）
3. OCR 文字区域兜底（有边界）
4. CV/template 兜底（有边界）
5. 失败并返回原因码 + 证据

禁止行为：

- 默认 OCR/CV 先行
- 无状态变化证据的无限重试
- 从确定性静默降级到概率路径

## 仓库级实现原则（全局）

- **Deterministic-first**：优先使用稳定 ID/UI 树/原生能力；OCR/CV 只作有边界兜底。
- **结构化工具结果**：返回机器可消费的结果包（`status`、`reasonCode`、artifacts）。
- **会话化执行**：所有动作在可审计会话内执行，并绑定策略 profile。
- **证据优先失败模型**：失败要携带足够上下文，支持解释/回放/恢复。

## 会话、策略与治理模型

- 会话是可审计执行单元，包含时间线与证据引用。
- 策略 profile 可限制工具类别（如 read-only / interactive / full-control）。
- 租约与调度约束用于避免同目标的不安全并发执行。
- 治理/脱敏流程用于在保留证据价值的同时控制敏感信息暴露。

关键策略配置路径：

- `configs/policies/*.yaml`
- `configs/profiles/*.yaml`
- [Policy profile 使用指南](docs/guides/policy-profiles.zh-CN.md)

## 非目标（避免误解）

- 不是为了替代所有移动测试框架的内部实现。
- 不是 OCR-first 自动化框架。
- 不是一开始就覆盖 native/RN/Flutter 全部边界场景。
- 不是试图抹平所有平台差异的"单一万能抽象"。

## 精选文档入口

- [README.md](README.md) — English overview
- [docs/README.md](docs/README.md) — 对外文档总索引与公开边界
- [docs/guides/ai-agent-invocation.zh-CN.md](docs/guides/ai-agent-invocation.zh-CN.md) — AI Agent 调用真相源与默认工具链
- [docs/guides/policy-profiles.zh-CN.md](docs/guides/policy-profiles.zh-CN.md) — policy profile 使用方式与权限升级边界
- [docs/engineering/ai-first-capability-expansion-guideline.md](docs/engineering/ai-first-capability-expansion-guideline.md) — AI-first harness 能力扩展规则
- [docs/architecture/01-system-architecture.md](docs/architecture/01-system-architecture.md) — 系统拓扑、契约与可靠性
- [docs/architecture/02-platform-adapters.md](docs/architecture/02-platform-adapters.md) — Android/iOS 执行后端
- [docs/architecture/03-capability-model.md](docs/architecture/03-capability-model.md) — 能力域与成熟度
- [docs/architecture/04-runtime-architecture.md](docs/architecture/04-runtime-architecture.md) — 执行协调、兜底与恢复
- [docs/architecture/05-governance-security.md](docs/architecture/05-governance-security.md) — 治理、策略与安全模型
- [docs/architecture/README.zh-CN.md](docs/architecture/README.zh-CN.md) — 架构导航索引（中文版）
- [docs/architecture/session-orchestration-architecture.zh-CN.md](docs/architecture/session-orchestration-architecture.zh-CN.md) — 会话租约/调度/运行时编排
- [docs/architecture/policy-engine-runtime-architecture.zh-CN.md](docs/architecture/policy-engine-runtime-architecture.zh-CN.md) — 策略运行时/守卫/范围映射
- [docs/architecture/platform-implementation-matrix.zh-CN.md](docs/architecture/platform-implementation-matrix.zh-CN.md) — 跨平台支持矩阵
- [docs/delivery/roadmap.md](docs/delivery/roadmap.md) — 分阶段交付路线
- [docs/delivery/npm-release-and-git-tagging.zh-CN.md](docs/delivery/npm-release-and-git-tagging.zh-CN.md) — npm 发版与 Git tag 一体化规范（含 PR/pre-tag/tag 分层 doc-sync 规则）
- [docs/showcase/README.md](docs/showcase/README.md) — 真机 Demo 证据与复现脚本
- [.github/actions/mobile-e2e-gate/action.yml](.github/actions/mobile-e2e-gate/action.yml) — 可复用 CI 门禁（不新增 MCP 工具；仍为 68 / 20）
- [docs/showcase/killer-demo-real-app.md](docs/showcase/killer-demo-real-app.md) — 两个 60 秒真开源 App 演示与证明等级边界
- [tests/README.md](tests/README.md) — 测试层与 CI 范围

## 路线图快照（简版）

- 近期：增强确定性会话/动作可靠性与证据模型。
- 中期：扩展 framework/profile 成熟度与真实运行覆盖。
- 远期：强化 agentic 恢复治理与企业级控制能力。

公开的路线与范围以 `docs/delivery/roadmap.md` 与 `docs/architecture/*` 为准。

## 开源协作

- License: [MIT](LICENSE)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## 支持这个项目

如果这个项目对你有帮助，你可以通过以下方式支持：

1. 给仓库点 Star 并分享
2. 提交带证据的 Issue / PR
3. 通过赞助支持项目持续维护

捐赠说明：

- [![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://paypal.me/shenyuexin)
