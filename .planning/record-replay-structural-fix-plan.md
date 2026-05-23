# Record Session 结构性修复方案（登录/回放可用性）

## 1. 目标与边界

### 1.1 目标

修复当前 `start_record_session -> end_record_session` 导出结果中“语义错误”与“回放失败”问题，确保手工登录路径可稳定还原为可回放 flow：

- 点击邮箱输入框
- 输入邮箱
- 点击密码输入框
- 输入密码
- 点击登录按钮
- 首页后的滑动/点击（如 Add to cart）

### 1.2 非目标

- 本期不引入 iOS 真机录制
- 本期不实现复杂多指手势高精度还原
- 本期不做 UI 编辑器产品化前端

---

## 2. 根因结论（当前失败为何发生）

### 2.1 结束时单快照污染全部事件

`end_record_session` 当前只在结束时抓一次 `uiautomator dump`，并把该路径（`artifacts/record-snapshots/...-end.xml`）写入每个事件的 `uiSnapshotRef`。

### 2.2 mapper 把快照路径当 selector 文本

`recording-mapper.ts` 中 `tap_element/type_into_element/wait_for_ui` 会把 `event.uiSnapshotRef` 直接放到 `actionIntent.text`。导出时生成：

```yaml
- tapOn:
    text: "artifacts/record-snapshots/xxx-end.xml"
```

这不是页面元素，回放必然失败。

### 2.3 录制与映射未形成“事件时刻 UI 语义”

当前 pipeline 没有“按事件时刻”关联 UI 元素：

- 没有 per-event/per-bucket UI 快照
- 没有按 tap 坐标命中节点并提取 `resource-id/text/content-desc`
- `type` 事件也没有与当前聚焦输入框绑定

### 2.4 swipe 语义缺失

`RecordedEventType` 有 `swipe`，但 runtime 解析与 mapper 分支不完整，导出层无稳定 swipe 语义输出。

---

## 3. 目标架构（修复后）

## 3.1 新流水线

1. **Capture（原始采集）**
   - `getevent -lt`（tap/key 原始流）
   - 关键时刻 UI 快照（分段/分桶）
   - app/activity context

2. **Normalize（事件标准化）**
   - 归一化 tap/type/swipe/back/home/app_switch
   - 文本输入聚合（字符流 -> 字段值）
   - 坐标归一化（映射到当前屏幕坐标系）

3. **Semantic Resolve（语义解析）**
   - tap(x,y) -> 目标节点 selector（优先 resource-id）
   - type(text) -> 上一个聚焦输入框 selector + value
   - swipe -> scroll/sweep step

4. **Export（导出）**
   - 只导出合法 selector，不再导出快照路径文本
   - 低置信度降级策略明确（坐标 tap）

5. **Replay Dry-run（可选）**
   - 用 `run_flow(dryRun=true)` 返回结构化验证

---

## 4. 数据模型调整

### 4.1 RawRecordedEvent 扩展（不破坏现有 envelope）

新增/收敛字段：

- `snapshotRef?: string`（保留，仅表示快照文件）
- `resolvedSelector?: { resourceId?: string; text?: string; contentDesc?: string; className?: string }`
- `normalizedPoint?: { x: number; y: number }`
- `gesture?: { kind: "tap" | "swipe"; start?: {x:number;y:number}; end?: {x:number;y:number} }`
- `inputChunk?: string`
- `focusedFieldHint?: string`

> 关键原则：**快照路径与元素 selector 严格分离**。

### 4.2 RecordedStep 约束

- `tap_element` 必须至少有 `resourceId/text/contentDesc` 之一
- `type_into_element` 必须有 `value`，且优先带 `resourceId`
- 若 selector 缺失：降级 `tap`（坐标）并标记 `low` 置信度

---

## 5. 核心算法方案

## 5.1 事件分桶 + 快照策略

- 以时间窗（建议 250~500ms）或关键事件（tap/type/back/home）触发快照抓取
- 每个 bucket 绑定 `snapshotRef`
- bucket 内事件共享快照，但不同 bucket 不共享

### 5.1.1 时间戳解析与事件-快照确定性关联（补充）

为避免“全部事件同一时刻/同一快照”的问题，新增以下确定性规则：

1. 从 `getevent -lt` 行解析原始时间戳（`[  12345.678901]`）
2. 归一化为 `eventMonotonicMs`（相对录制开始的单调时间）
3. 每次抓取 UI 快照时记录 `snapshotCapturedMonotonicMs`
4. 事件归属规则：
   - 优先匹配 `snapshotCapturedMonotonicMs >= eventMonotonicMs` 的最近快照
   - 若无后继快照，匹配最近前驱快照
5. 持久化字段：
   - event: `eventMonotonicMs`, `snapshotRef`
   - snapshot index: `snapshotRef`, `snapshotCapturedMonotonicMs`

这样可保证每个事件与“最接近其发生时刻”的 UI 状态关联。

这样可避免“会话末尾单快照污染全部步骤”。

## 5.2 Tap 语义解析

输入：`tap` 事件坐标 + 同 bucket 快照 XML

步骤：

1. 解析 XML 节点 bounds
2. 命中包含坐标的最小可交互节点
3. 提取 selector 优先级：
   - `resource-id`（最高）
   - `content-desc`
   - `text`
4. 输出 `tap_element` 或降级 `tap`

## 5.3 Type 语义解析

输入：type 字符流 + 最近聚焦目标

步骤：

1. 聚合输入片段为完整 `value`
2. 回溯最近的 tap/焦点节点，绑定输入框 selector
3. 输出 `type_into_element { selector, value }`

## 5.4 Swipe 语义解析

输入：触摸轨迹点序列

步骤：

1. 识别 swipe 起止点与方向（阈值过滤短抖动）
2. 导出 `swipe/scroll` 语义步骤
3. 后置 `wait_for_ui`

### 5.4.1 getevent 低层手势解析规范（补充）

从原始输入流提取轨迹：

- `ABS_MT_TRACKING_ID != ffffffff`：触点开始
- `ABS_MT_POSITION_X/Y`：轨迹点
- `ABS_MT_TRACKING_ID == ffffffff`：触点结束
- `BTN_TOUCH DOWN/UP`：辅助边界信号

判定规则（MVP 固定阈值）：

- `durationMs <= 250` 且 `distancePx < 24` => `tap`
- `distancePx >= 24` 且 `durationMs <= 1200` => `swipe`
- 其余 => 噪声或暂不支持（warning）

持久化手势数据：

- `gesture.kind`
- `gesture.start {x,y}`
- `gesture.end {x,y}`
- `gesture.path[]`（可选，MVP 至少存 start/end）
- `gesture.durationMs`

## 5.5 去噪与压缩

- 连续重复 tap（同区域短时间）合并
- 空输入过滤
- 自动插入 wait 保持最小必要

---

## 6. 代码改动清单（实施蓝图）

### 6.1 adapter-maestro

1. `packages/adapter-maestro/src/recording-runtime.ts`
   - 重构 `endRecordSessionWithMaestro` 的 normalize 阶段
   - 引入分桶快照采集
   - 修复 `uiSnapshotRef` 误用（不再写入 selector 字段）
   - 完善 swipe/type 解析链路

2. `packages/adapter-maestro/src/recording-mapper.ts`
   - 增加“selector 合法性门禁”
   - tap/type/swipe/back/home/app_switch 完整映射
   - 仅在 selector 合法时输出 `tap_element/type_into_element`
   - 否则降级为 `tap` 或保留 warning

3. （建议新增）`packages/adapter-maestro/src/recording-selector-resolver.ts`
   - 解析 XML
   - 坐标命中节点
   - selector 质量评分

### 6.2 contracts

- `packages/contracts/src/types.ts`
  - 细化录制事件/步骤模型字段（selector 与 snapshotRef 分离）

### 6.2.1 Contract 具体变更（补充）

`ActionIntent` 新增：

- `actionType` 扩展含 `swipe`
- `startX?: number`, `startY?: number`, `endX?: number`, `endY?: number`, `durationMs?: number`

`RawRecordedEvent` 新增：

- `eventMonotonicMs?: number`
- `gesture?: { kind: "tap" | "swipe"; start?: {x:number;y:number}; end?: {x:number;y:number}; durationMs?: number }`

`RecordedStep.actionType` 扩展：

- 增加 `swipe`

约束：

- `tap_element/type_into_element/wait_for_ui` 的 selector 字段禁止为快照路径（`artifacts/record-snapshots/` 前缀）

### 6.3 tests

1. `packages/adapter-maestro/test/recording-mapper.test.ts`
   - 新增 12+ 案例（见第 7 节）
2. `packages/mcp-server/test/server.test.ts`
   - 新增 start->end->export 的语义断言（禁止 xml path selector）
3. `packages/mcp-server/test/stdio-server.test.ts`
   - 新增 end_record_session 返回 report 字段稳定性断言

---

## 7. 测试计划（必须通过）

### 7.1 单元测试（adapter）

- tap + 有 selector -> `tap_element`（high/medium）
- tap + 无 selector -> `tap`（low）
- type 聚合 -> `type_into_element`（含完整邮箱）
- type 未绑定焦点 -> warning + fallback
- swipe -> `swipe/scroll` step
- back/home/app_switch 语义正确
- 禁止导出 `text: "artifacts/record-snapshots/..."`

### 7.2 集成测试（server）

- `start_record_session` 成功
- `end_record_session` 产出 `flowPath`
- 导出 YAML 不含 snapshot 文件路径 selector
- `report.confidenceSummary/warnings/reviewRequired` 正确

### 7.4 导出格式断言（补充）

必须新增以下断言：

1. 导出 YAML 中不存在：
   - `text: "artifacts/record-snapshots/..."`
2. `swipe` 事件导出格式固定为：

```yaml
- swipe:
    start: "<x1>,<y1>"
    end: "<x2>,<y2>"
    duration: <ms>
```

3. 登录路径导出最小语义：
   - `tapOn(id/text)` for email field
   - `inputText` for email
   - `tapOn(id/text)` for password field
   - `inputText` for password
   - `tapOn(id/text)` for sign in

### 7.3 手动 QA（真机）

场景：手工登录 + 首页滑动 + add to cart

验收：

- flow 中出现 `tapOn(id/text)` 到登录相关控件
- flow 中出现 `inputText`（邮箱、密码）
- flow 中出现 swipe/scroll 相关步骤
- 不出现 `tapOn text=artifacts/record-snapshots/...xml`

---

## 8. 验收标准（二进制）

以下全部满足才算完成：

1. 手工登录录制导出后，flow 含登录语义步骤（邮箱/密码/登录按钮）
2. flow 不含 snapshot 文件路径作为 selector 文本
3. 滑动与 add-to-cart 至少能恢复为可执行动作（swipe 或可点击 selector）
4. `pnpm typecheck && pnpm test && pnpm build` 全通过
5. 真机手动 QA 通过并产出证据文件路径

---

## 9. 实施顺序（最小风险）

### Phase A（热修门禁）

- 在 mapper 导出前拦截非法 selector（snapshot path）
- 防止再生成明显错误 flow

### Phase B（结构修复核心）

- 分桶快照 + selector resolver + type 聚合 + swipe 解析

### Phase C（质量封口）

- 全量单测/集成测试/真机 QA
- 文档更新（flow-generation + showcase）

---

## 10. 风险与应对

- 设备厂商差异导致 getevent 轨迹格式不一致
  - 通过多模式解析 + 回退策略
- 输入法导致 type 事件不完整
  - 结合焦点字段值 diff 与输入片段聚合
- selector 不稳定
  - 优先 resource-id，文本次之，坐标最终兜底

---

## 11. 需要 Oracle 审核的关键点

1. selector 与 snapshotRef 分离是否充分
2. 分桶快照策略是否满足性能与准确性平衡
3. type 聚合与焦点绑定策略是否足够稳健
4. swipe 语义输出是否符合 Maestro 回放行为
5. 测试矩阵是否覆盖登录到购物关键路径
