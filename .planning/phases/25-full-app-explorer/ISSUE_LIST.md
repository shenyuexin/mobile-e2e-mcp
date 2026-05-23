1) MCP 调用路径：包名与入口表述收口
文件
- 25-01-engine-core/PLAN.md
- 25-03-config-cli/PLAN.md
位置
- 25-01 Step 0.1 / 1.2
- 25-03 CLI Architecture Decision
剩余问题
- 仍写了不存在的包名：@mobile-e2e-mcp/mcp-server
- live repo 实际 package 名是：@shenyuexin/mobile-e2e-mcp
- 文档里虽然锁定了 MobileE2EMcpServer.invoke()，但 import / package truth 还没完全对齐
怎么改
- 把所有 @mobile-e2e-mcp/mcp-server 改成与 live repo 一致的真实包入口表达
- 明确说明：
  - explorer 是 library package
  - 真正的 server/runtime 入口来自现有 @shenyuexin/mobile-e2e-mcp
  - 如需直接 import MobileE2EMcpServer，要写明来自哪个真实导出面，而不是想象中的子包名
  完成标准
- 计划文本里不再出现假的 package 名
- import path 与 repo 真实 package/export 一致
---
2) ToolResult 契约：把所有 MCP 方法签名对齐 live contracts
文件
- 25-01-engine-core/PLAN.md
位置
- Step 0.2 McpToolInterface
- Step 5.1 captureSnapshot()
剩余问题
- requestManualHandoff(): Promise<ToolResult<unknown>> 过宽，repo 里已有 RequestManualHandoffData
- takeScreenshot() 解包字段仍写成：
  - filePath // or .path — verify from 25-00
- live repo ScreenshotData 实际字段是 outputPath
- 其他 tool 的输入参数也还偏简化，未体现 live contract 最低必需字段（尤其 session 相关）
怎么改
- requestManualHandoff 改成明确返回 ToolResult<RequestManualHandoffData>
- takeScreenshot() 的读取字段统一为 outputPath
- 不要再保留 “filePath 或 .path 待确认” 这种未定文案
- 在 Step 0 明确一句：
  - explorer 内部 adapter 可以简化参数
  - 但 adapter 对外映射必须覆盖 live MCP contract 所需字段（特别是 sessionId）
  完成标准
- McpToolInterface 中每个方法的 ToolResult<TData> 都能映射到 repo 已存在的具体 data type
- 不再出现 unknown / filePath or .path 这种模糊契约
---
3) tapAndWait 修复收尾：清理旧 boolean 风格接口
文件
- 25-01-engine-core/PLAN.md
位置
- Step 6 Backtracking
- Step 7 Main Engine
剩余问题
- Step 7 已经改对：tapAndWait 不再返回 nextState
- 但 Step 6 仍残留旧接口：
  - interface MCPTools { navigate_back: () => Promise<boolean>; }
- 这和 Step 0 的 ToolResult-aware adapter 冲突
怎么改
- Step 6 也统一改成使用 McpToolInterface
- backtrack 里的 navigate_back 结果统一按 ToolResult<NavigateBackData> 处理
- 删除所有旧的 Promise<boolean> 风格 MCP tool 示例
完成标准
- 25-01 全文只保留一种 MCP 调用模型：McpToolInterface -> ToolResult<TData>
- 不再有旧 MCPTools 局部接口与新 adapter 并存
---
4) CLI 集成模型：消除 workspace / 路由描述残留冲突
文件
- 25-03-config-cli/PLAN.md
- 25-01-engine-core/PLAN.md
位置
- 25-03 开头 CLI architecture
- 25-01 Step 1.5
- 25-03 Dependencies 表尾部
剩余问题
- 还写着：
  - “Root pnpm-workspace.yaml needs packages/explorer added”
- 但 live repo pnpm-workspace.yaml 已经是 packages/*
- 25-03 Dependencies 里仍残留：
  - mcp-tools.ts
- 这和现在的 mcp-adapter.ts 不一致
- CLI routing 的责任边界仍有一点混杂：packages/cli vs packages/mcp-server CLI layer
怎么改
- Step 1.5 改成：
  - packages/explorer 默认已被 packages/* 覆盖
  - 仅需验证，不需预设“手动添加”
- 把 mcp-tools.ts 全部改成 mcp-adapter.ts
- 明确一句责任划分：
  - packages/cli: 外层 pass-through/bin
  - packages/mcp-server CLI layer: 识别 explore 子命令并委派
  - packages/explorer: 提供 library API
  完成标准
- workspace 说明与 live repo 完全一致
- 文档里不再出现旧文件名或模糊路由职责
---
5) “repo-truth readiness” 结论要回写到规划文本本体
文件
- REVIEWLOG.md
- 25-01-engine-core/PLAN.md
- 25-03-config-cli/PLAN.md
位置
- Review 5 已有
- 但计划正文里仍有若干“待确认”文字
剩余问题
- Review 5 已指出 NO-GO
- 但正文里还残留一些会让人误判“已经可开工”的模糊句子，比如：
  - filePath // or .path
  - runtime mode still ambiguous
  - package import path 未完全落地
  怎么改
- 把 Review 5 的 blocker 直接映射回正文对应段落
- 原则是：review log 指出的问题，正文必须消掉对应歧义
- 不要让 review 是对的、正文还是旧的
完成标准
- Review 5 中列出的每个 blocker 都能在正文里找到对应修正
- 读正文的人不需要再靠 REVIEWLOG 才知道正确实现路径
---
建议你下一轮最小修订顺序
1. 先修 25-01 Step 0 / Step 5 / Step 6
2. 再修 25-03 CLI integration / dependencies / workspace
3. 最后做一次 Review 6
   - 只检查这 5 项尾巴是否全部清零
重新判定 Go 的门槛
满足下面 4 条，我会认为可以从 NO-GO 升到 GO：
- 文档中不再出现假的 package/import path
- 全部 MCP 示例统一到 ToolResult<TData>
- 不再残留 boolean 风格旧接口
- CLI/workspace/ownership 描述与 live repo 一致
---
6) Android explorer smoke 仍落在 systemui/锁屏界面，不是稳定进入 Settings
文件
- packages/explorer/src/explorer-platform-android.ts
- scripts/explorer/test-explorer-android.ts
- artifacts/explorer/android-smoke/*
位置
- 25-02C provisional Android hook integration
- Android real-device smoke harness / probe
剩余问题
- 25-02C 已完成 Android hook 接入，且 iOS parity/test/typecheck/build 全绿
- Android smoke 也能跑通，但当前探针与首页快照显示前台落在 `com.android.systemui`
- 具体表现：
  - probe `inspect_ui` 返回锁屏/系统界面 XML
  - target app identity 被识别为 `com.android.systemui`
  - 后续强化证据里还出现 `topActivity=com.android.mms/.ui.ConversationList`，但 UI 文本仍然是锁屏/系统覆盖层（`0.00`, `KB/s`, 日期, `Do Not Disturb`）
- Explorer 实际探索的是锁屏快捷入口/Do Not Disturb，而不是 `com.android.settings`
- 这说明当前问题已经不再是 shared parser/seam 设计问题，而是 Android 真机执行前置条件/进入路径问题
怎么改
- 保持该问题为 Android-local follow-on，不要为绕过它去修改 shared explorer 默认语义
- 优先排查并收敛：
  - 真机是否处于锁屏/半锁屏状态
  - `launch_app` 后前台是否真的切到 Settings
  - 是否需要在 Android harness 中增加“确认前台包名=目标 app”的前置门禁
  - 是否需要把“人工完整解锁并停留在 home screen”明确为这台 Vivo 的硬性 preflight，而不是继续尝试通用 adb 解锁
  - 是否需要在 harness/probe 中补“解锁/前台校验/重试 launch”而不是继续扩 shared explorer 逻辑
完成标准
- Android smoke 首页快照的 app identity 稳定为 `com.android.settings`
- Explorer 首页不再以 `com.android.systemui` / 锁屏节点作为根页面
- 如果设备仍要求人工解锁，则 harness 报错必须明确指出“device still appears locked or covered by system UI”，而不是模糊地报 foreground mismatch
- Android-only 进入前置条件被文档化为 harness/provisional lane 约束，而不是 shared core 特判
