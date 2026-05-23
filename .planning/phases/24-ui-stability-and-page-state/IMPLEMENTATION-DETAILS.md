# wait_for_ui_stable + get_current_page 实现详解

> 本文档是 Phase 24 设计的补充材料，详细说明两个核心工具的内部实现原理、准确性分析和边界情况处理。

## 1. wait_for_ui_stable — UI 稳定性检测

### 核心思想

不是猜"等几秒"，而是**连续采样 UI 树，看它什么时候不再变化**。

```
时间轴 →

t=0ms     t=300ms   t=600ms   t=900ms
 ┌───┐     ┌───┐     ┌───┐     ┌───┐
 │ A │     │ B │     │ C │     │ C │ ← 连续两次一致！
 └───┘     └───┘     └───┘     └───┘
 旧页面    转场中    新页面    新页面（稳定）
 hash≠prev hash≠prev hash=prev ✓ 返回
```

### 实现步骤

**步骤 1: 捕获 UI 树**

```typescript
// 调用 axe describe-ui (iOS) 或 uiautomator dump (Android)
const snapshot = await captureUiHierarchy(input);
// 返回 ~100-200 个节点的完整树
```

**步骤 2: 提取 hash 签名**

关键设计：**不全量 hash 整棵树**（太慢），只 hash 关键标识：

```typescript
function hashUiTree(snapshot: UiSnapshot): string {
  const signatures = flattenNodes(snapshot)
    .filter(n => n.isVisible && n.text)  // 只关心可见、有文本的节点
    .map(n => `${n.type}|${n.text.slice(0, 60)}|${n.bounds}`);
    // 示例: "Button|General|[20,334][410,378]"

  return sha256(signatures.join('\n'));
}
```

**为什么这样设计 hash 签名：**

| 选择 | 原因 |
|------|------|
| 只 hash 可见节点 | 屏幕外的节点不影响"当前页面是否稳定" |
| 只取 text 前 60 字符 | 大多数 UI 元素的 label 前 60 字符足以区分 |
| 包含 bounds | 同一元素在不同位置 = 不同状态（如弹窗出现） |
| 包含 type | "Button\|General" 和 "Heading\|General" 是不同的 |

**步骤 3: 轮询直到连续一致**

```typescript
async function waitForUiStable(input): Promise<ToolResult> {
  let stableCount = 0;
  let lastHash: string | null = null;
  let polls = 0;
  const deadline = Date.now() + (input.timeoutMs ?? 5000);

  while (Date.now() < deadline) {
    polls++;
    const snapshot = await captureUiHierarchy(input);
    const hash = hashUiTree(snapshot);

    if (hash === lastHash && hash !== null) {
      stableCount++;
      if (stableCount >= (input.consecutiveStable ?? 2)) {
        return {
          status: "success",
          data: { stable: true, polls, stableAfterMs: Date.now() - start }
        };
      }
    } else {
      stableCount = 0;  // 不一致，重置计数
      lastHash = hash;
    }

    await delay(input.intervalMs ?? 300);
  }

  return {
    status: "partial",
    reasonCode: "STABLE_TIMEOUT",
    data: { stable: false, polls, lastHash }
  };
}
```

### 准确性分析

| 场景 | 是否准确 | 说明 |
|------|---------|------|
| 页面转场动画进行中 | ✅ 准确 | 动画期间 UI 树持续变化，hash 每次不同，不会提前返回 |
| 滚动惯性未停止 | ✅ 准确 | 滚动中节点 bounds 持续变化，hash 不一致 |
| 简单页面（无动画） | ✅ 准确 | 第一次和第二次 poll hash 就一致，快速返回 |
| 动态内容页面（如视频播放） | ⚠️ 可能超时 | 进度条/时间戳持续变化，hash 永远不一致 → STABLE_TIMEOUT |
| 加载骨架屏（skeleton） | ⚠️ 可能误判 | 骨架屏动画也会让 hash 变化，但 timeout 内会稳定 |

**处理动态内容的防御策略：**

```typescript
// 方案：忽略已知的动态区域
function hashUiTree(snapshot: UiSnapshot): string {
  const signatures = flattenNodes(snapshot)
    .filter(n => n.isVisible && n.text)
    .filter(n => !isDynamicArea(n))  // 过滤掉视频播放器、进度条等
    .map(n => `${n.type}|${n.text.slice(0, 60)}|${n.bounds}`);
  // ...
}

function isDynamicArea(node: InspectUiNode): boolean {
  return node.type === 'Video'
    || node.type === 'ProgressIndicator'
    || node.className?.includes('Player')
    || node.accessibilityLabel?.includes('loading');
}
```

## 2. get_current_page — 页面身份识别

### 核心思想

从 UI 树中提取**页面标识信息**：标题、是否有返回按钮、是否是顶级页面。

```
┌──────────────────────────────────────┐
│ ‹ Settings          ← Button: "Settings"  → backButtonLabel
├──────────────────────────────────────┤
│ General             ← Heading[0]: "General" → screenTitle
│ Manage your overall setup...         │
│ ┌──────────────────────────────────┐ │
│ │ About                             │ │
│ │ AutoFill & Passwords              │ │
│ │ ...                               │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

提取结果:
  screenId = "Settings-General"
  screenTitle = "General"
  isTopLevel = false
  backButtonLabel = "Settings"
  parentScreenId = "Settings-main"
```

### 实现细节

**步骤 1: 提取 Heading（页面标题）**

```typescript
function extractPageTitle(nodes: InspectUiNode[]): string {
  // iOS: role=AXHeading, type=Heading
  // Android: className=Heading / TextView with heading style
  const headings = nodes.filter(n =>
    n.type === 'Heading'
    || n.className === 'Heading'
    || n.role === 'AXHeading'
  );

  return headings[0]?.text || headings[0]?.label || "unknown";
}
```

**步骤 2: 检测返回按钮**

```typescript
function extractBackButton(nodes: InspectUiNode[]): BackButtonResult | null {
  const buttons = nodes.filter(n =>
    n.type === 'Button' || n.className === 'Button'
  );

  // 返回按钮通常在顶部区域（y < 150）
  const topButtons = buttons.filter(b => {
    const y = parseBounds(b.bounds)?.y ?? 9999;
    return y < 150;
  });

  // 匹配常见的返回按钮文本
  const backPatterns = [
    /^settings$/i, /^设置$/i, /^back$/i, /^返回$/i,
    /^‹$/, /^‹ settings$/i, /^‹ 设置$/i,
    /^general$/i,
  ];

  for (const btn of topButtons) {
    const text = btn.text || btn.contentDesc || '';
    if (backPatterns.some(p => p.test(text))) {
      return { label: text, target: inferBackTarget(text) };
    }
  }

  return null;  // 没有返回按钮 = 顶级页面
}
```

**步骤 3: 生成 screenId**

```typescript
function deriveScreenId(nodes: InspectUiNode[], appId: string): CurrentPageData {
  const title = extractPageTitle(nodes);
  const backButton = extractBackButton(nodes);

  const titleSlug = toSlug(title);  // "General" → "general"
  const screenId = backButton
    ? `${appId}-${titleSlug}`
    : `${appId}-main`;

  return {
    screenId,
    screenTitle: title,
    isTopLevel: !backButton,
    backButtonLabel: backButton?.label,
    parentScreenId: backButton ? `${appId}-main` : undefined,
    visibleItemCount: nodes.filter(n => n.text && n.isVisible).length,
    extractedAt: new Date().toISOString(),
  };
}
```

### 准确性分析（Settings 等标准 App）

| 场景 | 准确性 | 说明 |
|------|--------|------|
| iOS Settings 标准页面 | ✅ 高 | Heading[0] 始终是页面标题，返回按钮始终是 "Settings" |
| Android Settings 标准页面 | ✅ 高 | Toolbar title 或 Heading 可识别 |
| 弹窗/Alert 覆盖页面 | ⚠️ 中 | Alert 的 title 可能被识别为 Heading → screenId 错误 |
| 无标题页面（如纯列表） | ⚠️ 低 | 没有 Heading → title="unknown" → screenId="app-unknown" |
| 自定义导航栏的 App | ⚠️ 中 | 返回按钮可能不是标准文本而是图标 → 检测不到 |

**⚠️ 局限性：第三方 App 通用性差**

对于快手、抖音等第三方 App，导航栏可能：
- 使用自定义 View，不是标准 `Heading` 或 `Button`
- 返回按钮是图标 (←) 没有 accessible label
- 页面标题在 `StaticText` 而不是 `Heading`
- 全屏沉浸式设计，没有明显的导航栏

**因此 `get_current_page` 的基于语义的方案通用性有限。**

## 3. 两者配合使用（当前方案）

```typescript
// Probe 脚本中的典型用法:

// 1. 执行一个可能改变页面的操作
await invoke("tap_element", { text: "General" });

// 2. 等待 UI 稳定（不猜时间，等真的稳定）
const stable = await invoke("wait_for_ui_stable", {
  sessionId, platform, deviceId,
  timeoutMs: 5000, intervalMs: 300, consecutiveStable: 2,
});

// 3. 确认到达了预期页面
const page = await invoke("get_current_page", {
  sessionId, platform, deviceId, appId,
});

// 4. 如果不在预期页面，自动回退
if (page.data.screenId !== "com.apple.Preferences-general") {
  await invoke("navigate_back", { toPage: "com.apple.Preferences-general" });
}
```

### 对比当前硬编码方式

| 维度 | 当前 (stabilize) | 新方案 (wait_for_ui_stable) |
|------|-----------------|---------------------------|
| 等待时间 | 硬编码 2000ms | 实际 600ms (快 3x) |
| 跨设备兼容 | 不同设备需要不同时间 | 自动适配 |
| 可验证性 | 无法知道是否真的稳定 | 有 polls/stableAfterMs 指标 |
| 超时处理 | 永远等固定时间 | 提前返回，不浪费时间 |
| 失败诊断 | "stabilize 不够？加时间" | 看 polls 和 hash 变化趋势 |

## 4. 方案局限性总结

`wait_for_ui_stable` 的通用性很好，不依赖任何 app 特定的 UI 结构。

`get_current_page` 的通用性受限：
- ✅ 系统级 App（Settings、Calculator 等）效果好
- ⚠️ 标准 Material Design / HIG 遵循的 App 效果中等
- ❌ 自定义导航栏的第三方 App（快手、抖音等）效果差

对于通用性更好的方案，参见 `24-DESIGN.md` 中的 **UI Tree Hash 作为页面身份** 替代方案。
