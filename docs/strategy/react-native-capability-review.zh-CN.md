# React Native 能力盘点与优化评审

> 日期：2026-06-01
> 范围：本仓库当前已交付或已形成可校验 artifact 的 React Native / Expo 相关能力。
> 结论先行：当前 RN 能力已经从“有样例和 Metro 调试工具”推进到“有 readiness -> evidence pack -> one-command 的开发者工作流”，但仍是 `experimental`，还不能宣称 RN 全量 E2E 或真实 app success parity。

## 1. 当前 RN 能力总览

| 能力 | 当前成熟度 | 开发者入口 | 主要实现位置 | 底层技术 |
|---|---:|---|---|---|
| RN framework profile | `validated-sample-baseline` | `configs/profiles/react-native.yaml` | `configs/profiles/react-native.yaml`, `configs/matrices/framework-profile-matrix.md` | profile/matrix 配置，声明 Expo RN sample baseline、稳定 selector、deterministic entry 要求 |
| RN Android acceptance prerequisite | smoke/prerequisite gate | `pnpm run validate:phase2-rn-android` | `scripts/validate-phase2-rn-android.ts` | 静态文件/脚本/flow 存在性校验 |
| RN Android acceptance wrapper | self-hosted acceptance lane | `pnpm run validate:phase2-rn-android-acceptance` | `scripts/dev/run-rn-android-acceptance.sh` | Expo sample + legacy Android runner + phase report/evidence generator |
| RN sample flow | sample flow | `flows/samples/react-native/android-login-smoke.yaml` | `flows/samples/react-native/*.yaml` | Maestro YAML 语义：`assertVisible`, `tapOn id`, `inputText`, shared interruption handling |
| RN/Expo JS debug target discovery | MCP tool, conditional | `list_js_debug_targets` | `packages/adapter-maestro/src/js-debug.ts`, `packages/mcp-server/src/tools/list-js-debug-targets.ts` | Metro `/json/list` HTTP discovery，target normalization/ranking |
| RN/Expo JS console snapshot | MCP tool, conditional | `capture_js_console_logs` | `packages/adapter-maestro/src/js-debug.ts`, `packages/mcp-server/src/index.ts` | Metro inspector WebSocket，Chrome DevTools Protocol `Runtime.enable`, `Runtime.consoleAPICalled`, `Runtime.exceptionThrown` |
| RN/Expo JS network snapshot | MCP tool, conditional | `capture_js_network_events` | `packages/adapter-maestro/src/js-debug.ts`, `packages/mcp-server/src/index.ts` | Metro inspector WebSocket，CDP `Network.enable`, request/response/loadingFailed 汇总 |
| RN debug evidence merge | MCP tool, partial/full by platform | `collect_debug_evidence` | `packages/adapter-maestro/src/diagnostics-tools.ts` | native logs/crash + optional Metro console/network summary + diagnosis packet |
| RN selector/source audit | experimental, fixture-backed | `pnpm run validate:react-native-selector-audit` | `scripts/showcase/react-native-selector-audit.ts` | 静态扫描 RN source/template 中的 `testID` / `accessibilityLabel` / `accessibilityHint` literal，并对比 declared stable selectors |
| RN runtime mode contract | experimental, fixture-backed | `pnpm run validate:react-native-runtime-contract` | `scripts/showcase/react-native-runtime-contract.ts` | 区分 `expo_go` / `expo_dev_client` / `bare_debug` / `bare_release` 的 Metro、JS target、app artifact、entry strategy 前置条件 |
| RN readiness doctor | experimental, fixture-backed | `pnpm run validate:react-native-readiness` | `scripts/showcase/react-native-readiness.ts` | device inventory via MCP `list_devices` + runtime mode + Metro target check + readiness contract + stable selector contract |
| RN evidence pack | experimental, fixture-backed | `pnpm run validate:react-native-evidence-pack` | `scripts/showcase/react-native-evidence-pack.ts` | RN readiness artifact + JS signal summary + native evidence references + RN failure taxonomy + proof boundary |
| RN one-command lane | experimental, fixture-backed/live-gated | `pnpm run verify:react-native-change` | `scripts/showcase/react-native-one-command.ts` | readiness -> evidence pack -> optional live bridge -> compact result orchestration；支持 `--live-bridge`, `--contract`, `--output-dir` |
| RN failure taxonomy | experimental, fixture-backed | `pnpm run validate:react-native-failure-taxonomy` | `scripts/showcase/react-native-failure-taxonomy.ts` | 将 RN readiness/JS/network signals 映射为 `RN_*` reason codes 和 bounded next actions |
| Official tool bridge relation | contract-ready | `pnpm run validate:official-tool-bridge` | `scripts/showcase/official-tool-bridge.ts` | 将 Android CLI/Journeys、Android Studio Journeys、Dart/Flutter MCP 定义为 upstream evidence/context provider |

## 2. 能力分层：当前到底基于什么技术

### 2.1 平台执行仍然复用 Android/iOS backbone

RN 不是单独一套执行 backend。当前架构是：

- Android/iOS adapter 负责设备、安装、启动、UI tree、tap/type/wait/screenshot/log/crash 等平台能力。
- React Native profile 是 instrumentation quality layer，要求 app 暴露稳定 `testID` / accessibility identifiers、deterministic entry、readiness signal。
- RN/Metro 只作为 supplemental debug lane，不替代 native UI post-condition proof。

这个设计是合理的。RN app 最终仍运行在 Android/iOS runtime 上，UI action、截图、日志、crash、device readiness 都不应该重新造一套 RN backend。真正 RN 特有的是 JS runtime、Metro target、bundle/runtime error、testID 质量、Expo/Metro entry。

### 2.2 Metro inspector 是当前 RN runtime 观测核心

当前 JS debug lane 的真实路径是：

1. `list_js_debug_targets` 调用 Metro `/json/list`。
2. `rankJsDebugTarget` 优先选择带 WebSocket、React Native、Expo、Hermes 线索的 target。
3. `capture_js_console_logs` 通过 inspector WebSocket 订阅 `Runtime.consoleAPICalled` 和 `Runtime.exceptionThrown`。
4. `capture_js_network_events` 通过 inspector WebSocket 订阅 `Network.*`，默认偏 failure snapshot。
5. `collect_debug_evidence` 将 native logs/crash 与 JS console/network summary 合并成 diagnosis packet。

这条路径定位准确：它是 one-shot observability，不是 full debugger。仓库已有 `docs/architecture/rn-debugger-sequence.md` 明确记录了这一点。

### 2.3 RN readiness/evidence/one-command 是开发效率层

新补齐的 RN 工作流不直接执行 app success，而是把启动前置条件显性化：

- `react-native-selector-audit/v1`：把 stable selector 从声明升级为 source-level 可审计 artifact。
- `react-native-runtime-contract/v1`：把 RN runtime mode 的前置条件显性化。
- `react-native-readiness/v1`：检查 device、runtime mode、Metro、JS debug target、readiness contract、stable selectors。
- `react-native-evidence-pack/v1`：把 readiness、JS signal summary、native evidence reference、failure summary、failure taxonomy 合成 review artifact。
- `react-native-one-command/v2`：提供 `pnpm run verify:react-native-change` 的 developer-facing orchestration，并可显式开启 live bridge。
- `react-native-failure-taxonomy/v1`：将重复 RN blocker / JS runtime / network signals 归类到稳定 reason codes 和 bounded remediation。

它解决的不是“替代 Detox/Maestro”，而是“AI agent 或开发者在 RN change 后，快速知道为什么不能开始验证，以及能把哪些 evidence 交给 PR/CI/下一步诊断”。

## 3. 合理性评审

### 合理的部分

1. **平台 backbone + RN profile 的分层是对的。**
   RN 不应该变成第三套设备控制 runtime。复用 Android/iOS device action 和 evidence，再补 Metro/JS 观测，是维护成本最低且支持边界最清楚的做法。

2. **Metro evidence 被标记为 supplemental 是对的。**
   JS console/network 信号可以解释失败，但不能证明 UI change 已经成功。当前 evidence pack 没有把 Metro-only 结果升级为 live success，符合 proof-boundary 要求。

3. **先做 readiness doctor 是对的。**
   RN 开发中的真实卡点常常是 Metro 未启动、debug target 没 attach、Expo/native app entry 不稳定、testID 缺失。先把这些 blocker 结构化，比直接堆更多 action tool 更有开发效率价值。

4. **one-command lane 的阶段设计合理。**
   `readiness -> evidence-pack -> review` 比单个“pass/fail”更适合 AI agent，因为 agent 能根据阶段判断下一步是修环境、看 JS runtime、还是进入 live verification。

5. **official-tool bridge 的定位合理。**
   Android CLI/Journeys 和 Dart/Flutter MCP 是 upstream provider，不是本 harness 的替代品。把关系写成 bridge contract，比 README 口头解释更不容易漂移。

### 当前不够强的部分

1. **RN evidence pack 还没有默认采集 live JS signals。**
   当前 pack 可以接收 console/network summary，但默认 fixture 仍是 unavailable。它证明了 artifact shape，不证明真实 RN runtime 诊断能力。

2. **RN one-command 已有 live bridge，但仍缺少真实成功 evidence。**
   `react-native-one-command/v2` 可以显式进入 mobile-change live verification/intake；不过默认 fixture 仍是 blocked，真实成功 promotion 依赖可见 device/emulator、Metro/debug target、稳定 selectors 和 intake。

3. **selector source audit 已补齐，但还没有 device UI tree confirmation。**
   `react-native-selector-audit/v1` 能证明 selector literal 存在于 source/template；它仍不能证明运行时页面可见。

4. **Expo / bare RN / dev-client / release APK 的差异已建模，但还没有自动执行官方工具。**
   `react-native-runtime-contract/v1` 已拆分 runtime mode；当前仍不负责启动 Expo/Metro、构建 dev-client 或安装 release artifact。

5. **RN iOS 路径还只是 profile/matrix 和平台 backbone 继承。**
   iOS 能力取决于 simulator/physical backend、签名、WDA/axe 路径；RN-specific iOS success evidence 仍不足。

6. **JS network 是被动 snapshot，不是主动网络测试。**
   当前不能做 request body/response body/HAR、mock、延迟注入、网络条件模拟。

## 4. 可优化方向

### 已完成：把 RN one-command 接到 live verification/intake

状态：`react-native-one-command/v2` 已增加 explicit live bridge，可通过 `pnpm run verify:react-native-change -- --live-bridge --contract=<path> --output-dir=<dir>` 进入 mobile-change live verification/intake。

建议设计：

- 输入：RN app id、platform、device id、Metro URL、readiness contract、stable selectors、app artifact 或 Expo URL。
- 流程：readiness passed -> launch/install/deep link -> native UI post-condition -> JS signal snapshot -> live proof intake -> RN evidence pack。
- 输出：`react-native-one-command/v2`，保留 `blocked`, `needs_review`, `verification_failed`, `completed`。

价值：这是最能证明“提升 RN 开发效率”的闭环。

### 已完成：增加 RN selector/source audit

状态：`react-native-selector-audit/v1` 已从“用户声明 stableSelectors”升级为“仓库可检查 selector literal 是否存在”。

可实现路径：

- 对 RN source 做静态扫描：`testID="..."`、`accessibilityLabel="..."`、`accessibilityHint`、常见 wrapper 组件 props。
- 生成 `react-native-selector-audit/v1`：
  - requiredSelectors
  - foundSelectors
  - missingSelectors
  - duplicateSelectors
  - sourceLocations
- readiness doctor 消费 audit 结果，而不是只看 env var。

价值：直接命中 RN 自动化最大痛点之一：selector 不稳定或缺失。

### 已完成：区分 Expo Go / Expo dev-client / bare RN / release artifact

状态：`react-native-runtime-contract/v1` 已把 app entry 模式显性化，避免“RN 支持”变成隐藏前置条件。

建议新增：

- `rnRuntimeMode`: `expo_go` | `expo_dev_client` | `bare_debug` | `bare_release`
- 每种模式对应：
  - launch strategy
  - Metro requirement
  - expected bundle/debug availability
  - artifact requirement
  - caveat

价值：减少用户 30 分钟内因为 Expo/Metro/appId 前置条件不清而退出。

### P1：把 Metro target selection 变成 evidence node

当前 readiness 只记录 target count，底层 `js-debug.ts` 已经有 target ranking reason。可以把 selected target、title、reason、candidate count 写进 readiness/evidence pack。

价值：当 agent 选错 Chrome/Expo/Hermes target 时，排查成本会明显下降。

### 已完成：RN JS runtime failure taxonomy

已基于 readiness blocker 与 console/network snapshot 形成 RN-specific reason codes：

- `RN_METRO_UNAVAILABLE`
- `RN_NO_DEBUG_TARGET`
- `RN_JS_EXCEPTION`
- `RN_BUNDLE_LOAD_FAILED`
- `RN_NETWORK_FAILURE`
- `RN_RED_BOX_VISIBLE`
- `RN_SELECTOR_MISSING`
- `RN_NATIVE_MODULE_ERROR`

价值：failure memory 和 remediation 可以更精准，不再只靠泛化的 environment/runtime/network。

### P2：source map / Hermes stack symbolication

当前 exception stack 可以提取 frame，但没有 source map/Hermes symbolication。后续可以：

- 读取 Metro source map
- 将 bundle frame 映射回 TS/TSX source
- 输出 top frame source location

价值：把“JS exception captured”升级为“你该看哪个文件哪一行”。

### P2：persistent inspector session

当前是 one-shot snapshot。full debugger 需要：

- long-lived attach/detach
- reconnect after reload
- target rotation handling
- event timeline buffering

价值高，但复杂度也高。建议在 live verification 闭环和 selector audit 之后再做。

## 5. 可扩充的新功能清单

| 优先级 | 功能 | 目标产物 | 是否适合近期做 |
|---:|---|---|---|
| P0 | RN live one-command verification | `react-native-one-command/v2` + live proof candidate | 是 |
| P0 | RN selector/source audit | `react-native-selector-audit/v1` | 是 |
| P1 | RN runtime mode contract | `configs/readiness/react-native.*.json` 或 `rn-runtime-contract/v1` | 是 |
| P1 | Metro target evidence enrichment | readiness/evidence pack 字段扩展 | 是 |
| P1 | RN failure taxonomy | reason codes + failure memory mapping | 是 |
| P1 | RN PR evidence summary | compact PR markdown/json | 是 |
| P2 | RedBox detection | native UI tree/screenshot + JS exception correlation | 可以做 |
| P2 | Hermes/source map symbolication | source locations in evidence | 可以做 |
| P2 | Persistent inspector session | long-running debug session | 暂缓 |
| P3 | Active network interception/mock | proxy/HAR/mock layer | 暂缓，风险和维护成本高 |

## 6. 推荐下一组 phase

### Phase 65: RN Selector Audit

- **Goal**: 将 RN stable selector 从手写声明升级为 source-level 可审计 artifact。
- **Deliverable**: `react-native-selector-audit/v1`, generator/validator, fixture evidence, smoke wiring。
- **Why first**: 它直接提高 deterministic-first 成功率，是 RN E2E 的根基。

### Phase 66: RN Runtime Mode Contract

- **Goal**: 区分 Expo Go、Expo dev-client、bare debug、bare release 的 entry/readiness/Metro 前置条件。
- **Deliverable**: runtime mode contract + readiness doctor integration。
- **Why second**: 能解决当前 RN 支持边界太粗的问题。

### Phase 67: RN Live Verification Bridge

- **Goal**: 将 `verify:react-native-change` 接入 live mobile-change verification 和 intake。
- **Deliverable**: `react-native-one-command/v2`，可在设备可用时产出 live candidate。
- **Why third**: 这是开发效率闭环，但依赖 selector 和 runtime mode 前置条件更清楚。

### Phase 68: RN Failure Taxonomy And Remediation

- **Goal**: 把 RN-specific blockers/JS failures 接入 failure memory 和 next-action routing。
- **Deliverable**: RN reason codes, deterministic grouping, remediation suggestions。
- **Why fourth**: 让重复 RN 失败能被记住和聚类，减少反复查同类问题。

## 7. 最终判断

当前 RN 实现方向是合理的，但还不是“完整 RN E2E 能力”。它现在更准确的定位是：

> experimental RN verification readiness and evidence workflow, backed by Android/iOS platform execution and Metro inspector observability.

这已经比单纯文档或示例强很多，因为它有命令、schema、fixture evidence、smoke validation。但如果要让严肃 RN 开发者觉得“我需要这个”，下一步必须补：

1. selector/source audit
2. RN runtime mode contract
3. live RN verification/intake bridge
4. RN-specific failure taxonomy

这些完成后，RN 线才会从“能诊断为什么不能跑”变成“能稳定帮助 RN change 进入可审查的移动验证闭环”。
