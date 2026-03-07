# 最小 MCP Contracts 与职责边界

## 1. 文档目的

本文档用于约束当前阶段 `mobile-e2e-mcp` 的最小实现边界，避免后续 AI 或工程实现出现以下问题：

- `contracts`、`adapter`、`server` 职责混杂
- 强类型边界没有真正复用
- 继续把长期逻辑堆积在脚本里
- `mcp-server` 直接拼接底层执行细节
- 返回结构不统一，后续 report / governance / self-healing 无法收敛

本文件服务于当前 Todo 中的这些事项：

1. `建立或接入 packages/contracts 的强类型边界`
2. `建立或接入 packages/adapter-maestro 并封装现有 runner 调用`
3. `建立或接入 packages/mcp-server 并实现 start_session/run_flow/end_session`

## 2. 当前阶段的最小产品分层

当前阶段只要求建立以下四层，不要求一次实现完整产品：

1. `packages/contracts`
2. `packages/adapter-maestro`
3. `packages/mcp-server`
4. `scripts/dev` / `scripts/report` 过渡执行层

它们的关系应为：

```text
MCP client / dev CLI
        |
        v
packages/mcp-server
        |
        v
packages/adapter-maestro
        |
        v
scripts/dev  (过渡层，逐步收敛)
        |
        v
Maestro / adb / xcrun / simulator / emulator
```

## 3. `packages/contracts` 的职责

`packages/contracts` 是当前最优先的稳定边界。

它必须负责：

- 定义最小输入输出类型
- 定义 session 结构
- 定义 tool result 结构
- 定义 reason code 枚举或联合类型
- 定义最小 tool input 类型

它不应该负责：

- 读取配置
- 调用外部命令
- 执行 flow
- 依赖某个 adapter 的实现细节

## 4. `packages/contracts` 的最小类型集合

当前阶段至少应包含：

- `Session`
- `ToolResult<TData>`
- `ReasonCode`
- `StartSessionInput`
- `RunFlowInput`
- `EndSessionInput`

建议最小模型如下。

### 4.1 `ReasonCode`

至少覆盖：

- `OK`
- `ADAPTER_ERROR`
- `CONFIGURATION_ERROR`
- `DEVICE_UNAVAILABLE`
- `FLOW_FAILED`
- `POLICY_DENIED`
- `UNSUPPORTED_OPERATION`

### 4.2 `ToolResult<TData>`

建议最小字段：

- `status`
- `reasonCode`
- `sessionId`
- `durationMs`
- `attempts`
- `artifacts`
- `data`
- `nextSuggestions`

### 4.3 `Session`

建议最小字段：

- `sessionId`
- `platform`
- `deviceId`
- `appId`
- `profile`
- `policyProfile`
- `startedAt`
- `artifactsRoot`
- `timeline`

### 4.4 `RunFlowInput`

当前阶段建议至少允许：

- `sessionId`
- `platform`
- `deviceId`
- `flowPath`
- `runnerScript`
- `runCount`
- `artifactsDir`
- `dryRun`

说明：

- `runnerScript` 是过渡阶段允许存在的输入
- 长期目标是让 adapter 不再依赖外部脚本入口，但当前阶段可以接受

## 5. `packages/adapter-maestro` 的职责

`packages/adapter-maestro` 是执行适配层，不是 MCP 协议层。

它必须负责：

- 封装 Maestro 执行入口
- 解析与执行 flow
- 组织 artifacts 目录
- 映射底层错误到 `ReasonCode`
- 封装对现有 `scripts/dev` 的过渡调用

它不应该负责：

- 定义 MCP tool 名称
- 暴露 MCP transport
- 决定 session 生命周期语义
- 拼装最终对外的完整工具协议

## 6. `packages/adapter-maestro` 当前阶段允许的实现方式

当前阶段允许 adapter 通过以下方式工作：

1. 直接调用现有 `scripts/dev/*`
2. 直接调用 `maestro` CLI
3. 调用少量 `adb` / `xcrun` 辅助命令

但要求：

- 这些调用必须被封装在 TS 函数里
- `mcp-server` 不应直接拼接命令
- path resolution 不应散落在多个层级

## 7. `packages/adapter-maestro` 推荐最小接口

当前阶段建议最少抽出这些函数：

- `resolveRepoPath()`
- `buildArtifactsDir()`
- `runFlowWithMaestro(input)`
- `runHarnessScript(input)`
- `collectBasicRunResult()`

这些函数的目标不是最终完美抽象，而是先把执行逻辑从 `mcp-server` 中隔离出来。

## 8. `packages/mcp-server` 的职责

`packages/mcp-server` 是 MCP-facing orchestration 层。

它必须负责：

- 注册和暴露 tool
- 组织 tool 输入输出
- 调用 contracts 类型
- 调用 adapter
- 统一返回 `ToolResult`

它不应该负责：

- 拼接 `maestro test` 命令
- 自己决定 screenshot 文件命名细节
- 直接操作 `adb` / `xcrun`
- 重复定义 `ReasonCode` 和 `ToolResult`

## 9. `packages/mcp-server` 当前阶段的最小工具集

当前阶段只要求先实现：

- `start_session`
- `run_flow`
- `end_session`

说明：

- 这是最小闭环，不是最终工具全集
- 不要求本轮就实现 `inspect_ui`、`tap`、`type_text`
- 只要这三个工具能形成稳定闭环，就足以支撑下一轮演进

## 10. 三个最小工具的边界

### 10.1 `start_session`

负责：

- 接收最小 session input
- 生成或确认 `sessionId`
- 返回结构化 session 初始化结果

不负责：

- 真正抢占或锁定设备
- 预加载完整 policy runtime

### 10.2 `run_flow`

负责：

- 接收 `RunFlowInput`
- 调用 `packages/adapter-maestro`
- 返回统一的 `ToolResult`

不负责：

- 自己实现底层 flow 执行
- 自己复制一套脚本逻辑

### 10.3 `end_session`

负责：

- 返回 session 结束结果
- 汇总本轮 artifacts 引用

不负责：

- 当前阶段不强制实现完整 cleanup / device reset

## 11. `scripts/dev` 和 `scripts/report` 的当前职责

这两个目录在当前阶段仍然有价值，但只是过渡层。

### `scripts/dev`

当前允许保留：

- 现有 sample runner
- 平台验证脚本
- 供 adapter 调用的过渡执行入口

不应继续新增：

- 长期复用的业务逻辑
- 新的类型定义
- 新的协议边界

### `scripts/report`

当前允许保留：

- phase report 生成
- failure summary

后续应逐步与 contracts 对齐，但当前不要求一次性重构。

## 12. `configs/`、`flows/` 的边界

### `configs/`

负责：

- harness 配置
- profile
- policy
- matrix

### `flows/`

负责：

- 样例 flow 资产
- shared interruption flow

这两层都不应该被 `mcp-server` 改写语义。  
当前阶段的目标是“读取并执行”，不是“重新发明 DSL”。

## 13. 当前阶段允许的技术债

以下技术债当前可以接受：

- adapter 内部仍通过脚本调用现有 runner
- `scripts/dev` 仍承担部分实际执行职责
- CLI 先是 dev-only 入口，不是最终用户级 CLI

但必须满足：

- 强类型边界已经固定
- 分层职责不被打破
- 后续可以继续把脚本逻辑收敛进 `packages/`

## 14. 当前阶段不允许的实现方式

后续 AI 不应采用以下方式：

- 在 `mcp-server` 中直接写大量 shell 命令拼接
- 在多个包中重复定义 `ToolResult` 或 `ReasonCode`
- 因为偷懒而绕开 `contracts`
- 继续把新功能主要写在 `scripts/dev`
- 把 adapter 变成“另一个 server”

## 15. 数据流约束

当前阶段建议的数据流固定为：

1. `mcp-server` 接收输入
2. `mcp-server` 调用 `adapter-maestro`
3. `adapter-maestro` 调用脚本或 Maestro CLI
4. `adapter-maestro` 收集原始执行结果
5. `mcp-server` 统一组装 `ToolResult`

这条链路一旦建立，后续新增工具时也应沿用同样模式。

## 16. 最小成功标准

如果以下条件成立，说明 contracts 与职责边界已经建立成功：

1. `start_session` / `run_flow` / `end_session` 都复用 `packages/contracts`
2. `run_flow` 不再直接拼接底层执行命令
3. 执行细节被收敛到 `packages/adapter-maestro`
4. 现有脚本仍可作为过渡执行后端
5. 代码层次清晰到可以继续迭代，而不需要再次重构边界

## 17. 结论

当前阶段最重要的不是“把所有能力实现完”，而是先把：

- 类型边界
- adapter 边界
- server 边界
- 脚本的过渡定位

固定下来。

只要这四件事做稳，后续无论是继续实现 `run_flow`，还是扩展到 `inspect_ui` / `tap` / `type_text`，都会轻松很多。
