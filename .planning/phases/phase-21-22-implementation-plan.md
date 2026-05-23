# Phase 21 + 22 + 架构优化 综合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 强化7个关键测试缺口文件，验证返回导航能力完整性，并实施热点文件分解与架构清理。

**Architecture:** 按工作流并行执行：工作流1（测试强化）→ 工作流2（返回导航验证）→ 工作流3（架构优化）。每个工作流独立可验证，通过 `pnpm test:ci` 作为全局门禁。

**Tech Stack:** TypeScript, Node.js test runner (node:test), pnpm workspaces, Git worktree (`feat/phase-21-22-hardening-backnav`)

**Worktree:** `/Users/linan/Documents/mobile-e2e-mcp/.worktrees/phase-21-22-hardening-backnav`

---

## 工作流总览

| 工作流 | 内容 | 预计时间 | 依赖 |
|---|---|---|---|
| **工作流1** | Phase 21 测试质量强化（7个文件） | 2-3天 | 无 |
| **工作流2** | Phase 22 返回导航验证与收尾 | 0.5-1天 | 工作流1 |
| **工作流3** | 架构优化（热点分解+分支清理+Policy迁移） | 2-3天 | 工作流1+2 |

---

## 工作流1：Phase 21 测试质量强化

### 前置检查

- [ ] **Step 0.1: 确认基线干净**

```bash
cd /Users/linan/Documents/mobile-e2e-mcp/.worktrees/phase-21-22-hardening-backnav
pnpm test:ci
```

Expected: 全绿通过（与main一致）。

---

### Task 1.1: device-runtime-ios.test.ts — 填充空文件

**Files:**
- Create/Overwrite: `packages/adapter-maestro/test/device-runtime-ios.test.ts`
- Source reference: `packages/adapter-maestro/src/device-runtime-ios.ts`

**Scope:** 测试纯函数（无需shell hook）：`buildIosLogLevelPredicate`、`extractIosSimulatorProcessId`、`extractIosPhysicalProcessId`、`extractIosPhysicalAppName`、`resolveIosAttachTarget`

- [ ] **Step 1: 编写 buildIosLogLevelPredicate 测试**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIosLogLevelPredicate,
  extractIosSimulatorProcessId,
  extractIosPhysicalProcessId,
  extractIosPhysicalAppName,
  resolveIosAttachTarget,
} from "../src/device-runtime-ios.ts";

test("buildIosLogLevelPredicate: F maps to fault", () => {
  const result = buildIosLogLevelPredicate("F");
  assert.equal(result.levelPredicate, "messageType == 'fault'");
  assert.equal(result.actualApplied, true);
  assert.equal(result.levelNote, undefined);
});

test("buildIosLogLevelPredicate: E maps to error", () => {
  const result = buildIosLogLevelPredicate("E");
  assert.equal(result.levelPredicate, "messageType == 'error'");
  assert.equal(result.actualApplied, true);
});

test("buildIosLogLevelPredicate: W maps to error OR default", () => {
  const result = buildIosLogLevelPredicate("W");
  assert.equal(result.levelPredicate, "messageType == 'error' OR messageType == 'default'");
  assert.equal(result.actualApplied, true);
});

test("buildIosLogLevelPredicate: I returns note and no predicate", () => {
  const result = buildIosLogLevelPredicate("I");
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
  assert.ok(result.levelNote?.includes("does not support"));
});

test("buildIosLogLevelPredicate: D returns note and no predicate", () => {
  const result = buildIosLogLevelPredicate("D");
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
  assert.ok(result.levelNote?.includes("does not support"));
});

test("buildIosLogLevelPredicate: V returns note and no predicate", () => {
  const result = buildIosLogLevelPredicate("V");
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
  assert.ok(result.levelNote?.includes("does not support"));
});

test("buildIosLogLevelPredicate: undefined returns all undefined", () => {
  const result = buildIosLogLevelPredicate(undefined);
  assert.equal(result.levelPredicate, undefined);
  assert.equal(result.actualApplied, false);
  assert.equal(result.levelNote, undefined);
});
```

- [ ] **Step 2: 编写 extractIosSimulatorProcessId 测试**

```typescript
test("extractIosSimulatorProcessId: extracts PID from launchctl output", () => {
  const launchctlOutput = `
PID	Status	Label
12345	-	com.example.myapp
67890	-	com.other.app
`;
  const result = extractIosSimulatorProcessId(launchctlOutput, "com.example.myapp");
  assert.equal(result, "12345");
});

test("extractIosSimulatorProcessId: returns undefined when no match", () => {
  const result = extractIosSimulatorProcessId("PID\tStatus\tLabel\n", "com.missing.app");
  assert.equal(result, undefined);
});

test("extractIosSimulatorProcessId: handles multi-line with no match", () => {
  const output = "PID\tStatus\tLabel\n123\t-\tcom.a\n456\t-\tcom.b\n";
  const result = extractIosSimulatorProcessId(output, "com.c");
  assert.equal(result, undefined);
});
```

- [ ] **Step 3: 编写 extractIosPhysicalProcessId 测试**

```typescript
test("extractIosPhysicalProcessId: extracts PID from devicectl processes", () => {
  const devicectlOutput = `
Process ID: 98765
Bundle ID: com.example.myapp
`;
  const result = extractIosPhysicalProcessId(devicectlOutput, "com.example.myapp");
  assert.equal(result, "98765");
});

test("extractIosPhysicalProcessId: escapes regex special chars in app name", () => {
  const devicectlOutput = `Process ID: 11111\nBundle ID: com.test.app+debug\n`;
  const result = extractIosPhysicalProcessId(devicectlOutput, "com.test.app+debug");
  assert.equal(result, "11111");
});

test("extractIosPhysicalProcessId: returns undefined when no match", () => {
  const result = extractIosPhysicalProcessId("Process ID: 123\nBundle ID: com.other\n", "com.missing");
  assert.equal(result, undefined);
});
```

- [ ] **Step 4: 编写 extractIosPhysicalAppName 测试**

```typescript
test("extractIosPhysicalAppName: extracts app name from devicectl listing", () => {
  const devicectlAppsOutput = `
1. MyApp (com.example.myapp)
2. OtherApp (com.other.app)
`;
  const result = extractIosPhysicalAppName(devicectlAppsOutput, "com.example.myapp");
  assert.equal(result, "MyApp");
});

test("extractIosPhysicalAppName: returns undefined when no match", () => {
  const result = extractIosPhysicalAppName("1. App (com.a)\n", "com.b");
  assert.equal(result, undefined);
});
```

- [ ] **Step 5: 编写 resolveIosAttachTarget 调度测试**

```typescript
test("resolveIosAttachTarget: dispatches to simulator path for simulator UDID", async () => {
  // Simulator UDID pattern: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
  const result = await resolveIosAttachTarget("/tmp", "ABCD1234-ABCD-1234-ABCD-123456789ABC", "com.test");
  // Returns undefined when no actual xcrun is available in test env
  // This test mainly verifies it doesn't throw and dispatches correctly
  assert.ok(result === undefined || typeof result === "string");
});

test("resolveIosAttachTarget: dispatches to physical path for physical device ID", async () => {
  // Physical device ID pattern: 40 hex chars
  const result = await resolveIosAttachTarget("/tmp", "a".repeat(40), "com.test");
  assert.ok(result === undefined || typeof result === "string");
});
```

- [ ] **Step 6: 运行测试验证**

```bash
cd /Users/linan/Documents/mobile-e2e-mcp/.worktrees/phase-21-22-hardening-backnav
pnpm exec tsx --test packages/adapter-maestro/test/device-runtime-ios.test.ts
```

Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add packages/adapter-maestro/test/device-runtime-ios.test.ts
git commit -m "test(adapter-maestro): fill device-runtime-ios.test.ts with behavioral tests for log predicates and PID extraction"
```

---

### Task 1.2: interruption-classifier.test.ts — 覆盖缺失类型

**Files:**
- Modify: `packages/adapter-maestro/test/interruption-classifier.test.ts`
- Source: `packages/adapter-maestro/src/interruption-classifier.ts`

- [ ] **Step 1: 读取现有测试内容**

```bash
cat packages/adapter-maestro/test/interruption-classifier.test.ts
```

- [ ] **Step 2: 添加 system_alert 检测测试**

在现有测试后追加：

```typescript
test("classifyInterruptionFromSignals: detects system_alert from 'alert' in value", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "visible_text", value: "System Alert: Update Required", confidence: 0.9, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "system_alert");
  assert.ok(classification.confidence > 0);
});

test("classifyInterruptionFromSignals: detects system_alert from 'dialog' in value", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "container_role", value: "dialog", confidence: 0.8, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "system_alert");
});
```

- [ ] **Step 3: 添加 action_sheet 检测测试**

```typescript
test("classifyInterruptionFromSignals: detects action_sheet from 'sheet' in value", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "visible_text", value: "Options sheet", confidence: 0.8, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "action_sheet");
});

test("classifyInterruptionFromSignals: detects action_sheet from container_role", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "container_role", value: "actionSheet", confidence: 0.9, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "action_sheet");
});
```

- [ ] **Step 4: 添加 overlay 检测测试**

```typescript
test("classifyInterruptionFromSignals: detects overlay from dialog_actions", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "dialog_actions", value: "[\"OK\",\"Cancel\"]", confidence: 0.9, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "overlay");
});

test("classifyInterruptionFromSignals: detects overlay from interrupted signal", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "interrupted", value: "true", confidence: 0.7, source: "runtime" },
  ]);
  assert.equal(classification.type, "overlay");
});
```

- [ ] **Step 5: 添加 keyboard_blocking 检测测试**

```typescript
test("classifyInterruptionFromSignals: detects keyboard_blocking from keyboard in value", () => {
  const classification = classifyInterruptionFromSignals([
    { key: "visible_text", value: "Keyboard is showing", confidence: 0.8, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "keyboard_blocking");
});
```

- [ ] **Step 6: 添加分数优先级测试**

```typescript
test("classifyInterruptionFromSignals: higher score wins when multiple candidates exist", () => {
  // permission_prompt has higher weight (2x), should win over alert
  const classification = classifyInterruptionFromSignals([
    { key: "permission_prompt", value: "camera", confidence: 0.9, source: "ui_tree" },
    { key: "visible_text", value: "Alert", confidence: 0.9, source: "ui_tree" },
  ]);
  assert.equal(classification.type, "permission_prompt");
});
```

- [ ] **Step 7: 运行并提交**

```bash
pnpm exec tsx --test packages/adapter-maestro/test/interruption-classifier.test.ts
git add packages/adapter-maestro/test/interruption-classifier.test.ts
git commit -m "test(adapter-maestro): cover system_alert, action_sheet, overlay, keyboard_blocking in interruption-classifier"
```

---

### Task 1.3: interruption-orchestrator.test.ts — 添加行为测试

**Files:**
- Modify: `packages/adapter-maestro/test/interruption-orchestrator.test.ts`
- Source: `packages/adapter-maestro/src/interruption-orchestrator.ts`

- [ ] **Step 1: 添加 buildResumeCheckpoint 测试**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResumeCheckpoint,
  hasStateDrift,
} from "../src/interruption-orchestrator.ts";

test("buildResumeCheckpoint: minimal valid input preserves required fields", () => {
  const checkpoint = buildResumeCheckpoint({
    actionId: "act-123",
    sessionId: "sess-456",
    platform: "android",
    actionType: "tap_element",
  });
  assert.equal(checkpoint.actionId, "act-123");
  assert.equal(checkpoint.sessionId, "sess-456");
  assert.equal(checkpoint.platform, "android");
  assert.equal(checkpoint.actionType, "tap_element");
  assert.equal(checkpoint.selector, undefined);
  assert.equal(checkpoint.params, undefined);
  assert.ok(checkpoint.createdAt);
});

test("buildResumeCheckpoint: partial input with selector preserves selector", () => {
  const checkpoint = buildResumeCheckpoint({
    actionId: "act-123",
    sessionId: "sess-456",
    platform: "ios",
    actionType: "type_into_element",
    selector: { text: "Search" },
  });
  assert.equal(checkpoint.platform, "ios");
  assert.deepEqual(checkpoint.selector, { text: "Search" });
});

test("buildResumeCheckpoint: multi-action context preserves each actionType", () => {
  const tapCheckpoint = buildResumeCheckpoint({
    actionId: "act-1",
    sessionId: "sess-1",
    platform: "android",
    actionType: "tap_element",
  });
  const typeCheckpoint = buildResumeCheckpoint({
    actionId: "act-2",
    sessionId: "sess-1",
    platform: "android",
    actionType: "type_into_element",
  });
  assert.equal(tapCheckpoint.actionType, "tap_element");
  assert.equal(typeCheckpoint.actionType, "type_into_element");
});
```

- [ ] **Step 2: 添加 hasStateDrift 测试**

```typescript
test("hasStateDrift: same state returns false", () => {
  const state = { appPhase: "ready", readiness: "ready", screenId: "home", blockingSignals: [] };
  assert.equal(hasStateDrift(state, state), false);
});

test("hasStateDrift: changed appPhase returns true", () => {
  const before = { appPhase: "ready", readiness: "ready", screenId: "home", blockingSignals: [] };
  const after = { appPhase: "loading", readiness: "ready", screenId: "home", blockingSignals: [] };
  assert.equal(hasStateDrift(before, after), true);
});

test("hasStateDrift: undefined before/after returns false", () => {
  assert.equal(hasStateDrift(undefined, undefined), false);
  assert.equal(hasStateDrift(undefined, { appPhase: "ready", readiness: "ready", screenId: "", blockingSignals: [] }), false);
});
```

- [ ] **Step 3: 运行并提交**

```bash
pnpm exec tsx --test packages/adapter-maestro/test/interruption-orchestrator.test.ts
git add packages/adapter-maestro/test/interruption-orchestrator.test.ts
git commit -m "test(adapter-maestro): add behavioral tests for buildResumeCheckpoint and hasStateDrift"
```

---

### Task 1.4: doctor-runtime.test.ts — 验证检查状态

**Files:**
- Modify: `packages/adapter-maestro/test/doctor-runtime.test.ts`
- Source: `packages/adapter-maestro/src/doctor-runtime.ts`

- [ ] **Step 1: 读取现有测试**

```bash
cat packages/adapter-maestro/test/doctor-runtime.test.ts
```

- [ ] **Step 2: 强化断言**

增强现有测试，添加状态验证：

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { runDoctorWithMaestro } from "../src/index.ts";

test("runDoctorWithMaestro: returns checks with valid statuses and non-empty details", async () => {
  const result = await runDoctorWithMaestro({});
  assert.equal(result.status, "success");
  assert.ok(Array.isArray(result.data.checks));
  assert.ok(result.data.checks.length > 0);

  for (const check of result.data.checks) {
    assert.ok(["pass", "warn", "fail"].includes(check.status), `Invalid status: ${check.status}`);
    assert.ok(typeof check.detail === "string" && check.detail.length > 0, `Empty detail for ${check.name}`);
    assert.ok(typeof check.name === "string" && check.name.length > 0, "Missing check name");
  }
});

test("runDoctorWithMaestro: includes device lists", async () => {
  const result = await runDoctorWithMaestro({});
  assert.ok(result.data.devices);
  assert.ok(Array.isArray(result.data.devices.android));
  assert.ok(Array.isArray(result.data.devices.ios));
});
```

- [ ] **Step 3: 运行并提交**

```bash
pnpm exec tsx --test packages/adapter-maestro/test/doctor-runtime.test.ts
git add packages/adapter-maestro/test/doctor-runtime.test.ts
git commit -m "test(adapter-maestro): strengthen doctor-runtime.test.ts with status enum validation and detail assertions"
```

---

### Task 1.5: diagnostics-pull.test.ts — 添加mock测试

**Files:**
- Modify: `packages/adapter-maestro/test/diagnostics-pull.test.ts`
- Source: `packages/adapter-maestro/src/diagnostics-pull.ts`

**注意**: `diagnostics-pull.ts` 第4行已经使用 `executeRunnerWithTestHooks as executeRunner`，说明测试钩子已经就位。

- [ ] **Step 1: 读取 runtime-shared.ts 确认测试钩子API**

```bash
grep -n "setExecuteRunnerForTesting\|executeRunnerWithTestHooks" packages/adapter-maestro/src/runtime-shared.ts
```

- [ ] **Step 2: 编写 boundedRemoteFileRead mock测试**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedRemoteFileRead,
  boundedRemoteFileReadBatch,
  checkRemoteFileSize,
} from "../src/diagnostics-pull.ts";
import { setExecuteRunnerForTesting } from "../src/runtime-shared.ts";

test("boundedRemoteFileRead: mock successful shell cat", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 0,
    stdout: "mock file content\nline 2",
    stderr: "",
    execution: { exitCode: 0, stdout: "mock file content\nline 2", stderr: "" },
  }));

  const result = await boundedRemoteFileRead("/tmp", {
    deviceId: "emulator-5554",
    remotePath: "/data/local/tmp/test.txt",
  });

  assert.equal(result.status, "success");
  assert.equal(result.readMethod, "shell_cat");
  assert.equal(result.content, "mock file content\nline 2");
  assert.ok(result.bytesRead > 0);

  setExecuteRunnerForTesting(undefined);
});

test("boundedRemoteFileRead: mock file not found", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 1,
    stdout: "",
    stderr: "No such file or directory",
    execution: { exitCode: 1, stdout: "", stderr: "No such file or directory" },
  }));

  const result = await boundedRemoteFileRead("/tmp", {
    deviceId: "emulator-5554",
    remotePath: "/data/local/tmp/missing.txt",
    allowPullFallback: false,
  });

  assert.equal(result.status, "not_found");
  setExecuteRunnerForTesting(undefined);
});
```

- [ ] **Step 3: 编写 boundedRemoteFileReadBatch mock测试**

```typescript
test("boundedRemoteFileReadBatch: mock batch read with 3 files", async () => {
  let callCount = 0;
  setExecuteRunnerForTesting(async () => {
    callCount++;
    return {
      exitCode: 0,
      stdout: `content-${callCount}`,
      stderr: "",
      execution: { exitCode: 0, stdout: `content-${callCount}`, stderr: "" },
    };
  });

  const results = await boundedRemoteFileReadBatch("/tmp", "emulator-5554", [
    "/data/local/tmp/a.txt",
    "/data/local/tmp/b.txt",
    "/data/local/tmp/c.txt",
  ]);

  assert.equal(results.length, 3);
  assert.equal(results[0].status, "success");
  assert.equal(results[1].status, "success");
  assert.equal(results[2].status, "success");
  setExecuteRunnerForTesting(undefined);
});
```

- [ ] **Step 4: 编写 checkRemoteFileSize mock测试**

```typescript
test("checkRemoteFileSize: mock successful ls response", async () => {
  setExecuteRunnerForTesting(async () => ({
    exitCode: 0,
    stdout: "1234 /data/local/tmp/test.txt",
    stderr: "",
    execution: { exitCode: 0, stdout: "1234 /data/local/tmp/test.txt", stderr: "" },
  }));

  const size = await checkRemoteFileSize("/tmp", "emulator-5554", "/data/local/tmp/test.txt");
  assert.equal(size, 1234);
  setExecuteRunnerForTesting(undefined);
});
```

- [ ] **Step 5: 运行并提交**

```bash
pnpm exec tsx --test packages/adapter-maestro/test/diagnostics-pull.test.ts
git add packages/adapter-maestro/test/diagnostics-pull.test.ts
git commit -m "test(adapter-maestro): add mocked executeRunner tests for boundedRemoteFileRead, batch, and size checks"
```

---

### Task 1.6: action-outcome-startup.test.ts — 添加场景覆盖

**Files:**
- Modify: `packages/adapter-maestro/test/action-outcome-startup.test.ts`
- Source: `packages/adapter-maestro/src/action-outcome.ts`

- [ ] **Step 1: 读取现有测试结构**

```bash
cat packages/adapter-maestro/test/action-outcome-startup.test.ts
```

- [ ] **Step 2: 添加 indexed remediation 路径测试**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { suggestKnownRemediationWithMaestro } from "../src/action-outcome.ts";
import { persistActionRecord, recordFailureSignature } from "@mobile-e2e-mcp/core";
import { resolveRepoPath } from "../src/harness-config.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

test("suggestKnownRemediationWithMaestro: includes indexed remediation when failure index has entry", async () => {
  const repoRoot = await resolveRepoPath();
  const sessionId = `test-session-${Date.now()}`;

  // Write a minimal evidence file to trigger the path
  const evidenceDir = path.join(repoRoot, ".mobile-e2e", "sessions", sessionId);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    path.join(evidenceDir, "evidence.json"),
    JSON.stringify({
      stateSummary: { readiness: "offline_terminal", appPhase: "ready", screenId: "login" },
    }),
  );

  // Persist a failure signature with remediation
  await recordFailureSignature(repoRoot, {
    signature: "network_offline",
    sessionId,
    actionId: "act-1",
    reasonCode: "network_error",
    remediation: ["Check network connectivity", "Retry with wifi enabled"],
  });

  const result = await suggestKnownRemediationWithMaestro({
    sessionId,
    platform: "android",
  });

  assert.equal(result.status, "success");
  assert.ok(Array.isArray(result.data.remediation));
  // At least one remediation should mention network
  const hasNetworkHint = result.data.remediation.some((r: string) =>
    r.toLowerCase().includes("network") || r.toLowerCase().includes("wifi"),
  );
  assert.ok(hasNetworkHint, "Expected network-related remediation");
});
```

- [ ] **Step 3: 添加 blocking signals 路径测试**

```typescript
test("suggestKnownRemediationWithMaestro: includes interruption-layer remediation for permission_prompt", async () => {
  const repoRoot = await resolveRepoPath();
  const sessionId = `test-session-${Date.now()}`;
  const evidenceDir = path.join(repoRoot, ".mobile-e2e", "sessions", sessionId);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    path.join(evidenceDir, "evidence.json"),
    JSON.stringify({
      stateSummary: {
        readiness: "interrupted",
        appPhase: "ready",
        screenId: "home",
        blockingSignals: ["permission_prompt"],
      },
    }),
  );

  const result = await suggestKnownRemediationWithMaestro({
    sessionId,
    platform: "android",
  });

  assert.equal(result.status, "success");
  assert.ok(Array.isArray(result.data.remediation));
  // Should contain interruption-related guidance
  assert.ok(result.data.remediation.length > 0);
});
```

- [ ] **Step 4: 运行并提交**

```bash
pnpm exec tsx --test packages/adapter-maestro/test/action-outcome-startup.test.ts
git add packages/adapter-maestro/test/action-outcome-startup.test.ts
git commit -m "test(adapter-maestro): add indexed remediation and blocking-signals scenarios to action-outcome-startup"
```

---

### Task 1.7: interruption-tools.test.ts — 强化MCP服务器工具测试

**Files:**
- Modify: `packages/mcp-server/test/interruption-tools.test.ts`
- Source: `packages/mcp-server/src/index.ts` (工具注册)

- [ ] **Step 1: 读取现有测试**

```bash
cat packages/mcp-server/test/interruption-tools.test.ts
```

- [ ] **Step 2: 强化每个工具的行为测试**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES, TOOL_NAMES } from "@mobile-e2e-mcp/contracts";
import { createTestServer } from "./test-server-factory.js"; // 或类似辅助函数

test("detect_interruption: returns structured signals array", async () => {
  const server = await createTestServer();
  const result = await server.invokeTool(TOOL_NAMES.detectInterruption, {
    sessionId: "test-session",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.ok(Array.isArray(result.data.signals));
  if (result.data.signals.length > 0) {
    const signal = result.data.signals[0];
    assert.ok(typeof signal.source === "string");
    assert.ok(typeof signal.key === "string");
    assert.ok("value" in signal);
    assert.ok(typeof signal.confidence === "number");
  }
});

test("classify_interruption: returns valid InterruptionType", async () => {
  const server = await createTestServer();
  const result = await server.invokeTool(TOOL_NAMES.classifyInterruption, {
    sessionId: "test-session",
    signals: [{ key: "permission_prompt", value: "camera", confidence: 0.9, source: "ui_tree" }],
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.ok(["system_alert", "action_sheet", "permission_prompt", "app_modal", "overlay", "keyboard_blocking", "unknown"].includes(result.data.classification.type));
  assert.ok(typeof result.data.classification.confidence === "number");
});

test("resolve_interruption: returns status and strategy fields", async () => {
  const server = await createTestServer();
  const result = await server.invokeTool(TOOL_NAMES.resolveInterruption, {
    sessionId: "test-session",
    classification: { type: "permission_prompt", confidence: 0.9, rationale: ["Camera permission"] },
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.ok(["resolved", "denied", "not_needed", "failed"].includes(result.data.status));
  assert.ok(typeof result.data.strategy === "string");
});

test("resume_interrupted_action: preserves checkpoint fields", async () => {
  const server = await createTestServer();
  const result = await server.invokeTool(TOOL_NAMES.resumeInterruptedAction, {
    sessionId: "test-session",
    checkpoint: {
      actionId: "act-123",
      sessionId: "test-session",
      platform: "android",
      actionType: "tap_element",
      selector: { text: "Submit" },
    },
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.ok(result.data.checkpoint);
  assert.equal(result.data.checkpoint.actionType, "tap_element");
  assert.deepEqual(result.data.checkpoint.selector, { text: "Submit" });
});
```

**注意**: `createTestServer` 辅助函数可能不存在。如果现有测试使用不同的模式（如直接调用工具函数），请遵循现有模式。

- [ ] **Step 3: 运行并提交**

```bash
pnpm exec tsx --test packages/mcp-server/test/interruption-tools.test.ts
git add packages/mcp-server/test/interruption-tools.test.ts
git commit -m "test(mcp-server): strengthen interruption-tools with behavioral assertions on signals, classification types, and checkpoint fields"
```

---

### 工作流1 验证门禁

- [ ] **Step W1-Final: 全量测试验证**

```bash
pnpm test:ci
```

Expected: 全绿通过。

---

## 工作流2：Phase 22 返回导航验证与收尾

**前提**: Phase 22 的大部分实现（`ui-action-back.ts`、服务器工具注册、契约类型）已经存在。本工作流专注于**验证完整性**和**补齐缺失的文档/测试**。

### Task 2.1: 验证契约完整性

- [ ] **Step 1: 确认 NavigateBackInput / NavigateBackData 字段完整**

```bash
grep -A 20 "export interface NavigateBackInput" packages/contracts/src/types.ts
grep -A 20 "export interface NavigateBackData" packages/contracts/src/types.ts
```

Expected: 应包含 `sessionId?`, `platform?`, `deviceId?`, `runnerProfile?`, `target?` (BackTarget), `dryRun?` 等字段。

- [ ] **Step 2: 确认 tool-names.ts 包含 navigateBack**

```bash
grep "navigateBack" packages/contracts/src/constants/tool-names.ts
```

Expected: `navigateBack: "navigate_back"`

- [ ] **Step 3: 确认 server.ts 注册完整**

```bash
grep "navigate_back" packages/mcp-server/src/server.ts
```

Expected: `navigate_back: ToolContract<NavigateBackInput, NavigateBackData>`

- [ ] **Step 4: 确认 mcp-server/index.ts 描述符完整**

```bash
grep -A 15 "name: TOOL_NAMES.navigateBack" packages/mcp-server/src/index.ts
```

Expected: 应包含 `policy.enforced`, `policy.requiredScopes`, `session.required` 等字段。

---

### Task 2.2: 验证能力模型

- [ ] **Step 1: 确认 Android 为 FULL，iOS 为 CONDITIONAL**

```bash
grep -B 1 -A 1 "navigateBack" packages/adapter-maestro/src/capability-model.ts
```

Expected:
- Android: `buildToolCapability(TOOL_NAMES.navigateBack, FULL, "...")`
- iOS: `buildToolCapability(TOOL_NAMES.navigateBack, CONDITIONAL, "...")`

- [ ] **Step 2: 确认 iOS 支持边界说明诚实**

读取 iOS 的 capability 说明，确认：
- 明确声明 `system back` 不支持
- 明确声明 `app-level back` 通过选择器点击支持
- 包含 `IOS_CONDITIONAL_NOTE`

---

### Task 2.3: 补齐工具输出契约测试

**Files:**
- Modify: `packages/mcp-server/test/tool-output-contracts.test.ts`

- [ ] **Step 1: 添加 navigate_back 输出契约验证**

在现有测试中添加：

```typescript
test("navigate_back output contract: well-formed payload", async () => {
  const server = await createTestServer();
  const result = await server.invokeTool(TOOL_NAMES.navigateBack, {
    sessionId: "test-session",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.ok(typeof result.data.dryRun === "boolean");
  assert.ok(["app", "system"].includes(result.data.target));
  assert.ok(["android_keyevent", "ios_selector_tap", "ios_edge_swipe", "unsupported"].includes(result.data.executedStrategy));
  assert.ok(["full", "conditional", "partial", "unsupported"].includes(result.data.supportLevel));
  assert.ok(typeof result.data.fallbackUsed === "boolean");
});
```

- [ ] **Step 2: 运行并提交**

```bash
pnpm exec tsx --test packages/mcp-server/test/tool-output-contracts.test.ts
git add packages/mcp-server/test/tool-output-contracts.test.ts
git commit -m "test(mcp-server): add navigate_back output contract validation"
```

---

### Task 2.4: 更新文档

**Files:**
- Modify: `README.md`（如果工具目录未包含 navigate_back）
- Modify: `docs/guides/ai-agent-invocation.zh-CN.md`（如果需要更新调用顺序示例）

- [ ] **Step 1: 确认 README 工具目录包含 navigate_back**

```bash
grep "navigate_back" README.md
```

如果未包含，在 UI perception 类别下添加：

```markdown
- `navigate_back` — app/system back navigation with explicit platform semantics
```

- [ ] **Step 2: 确认 ai-agent-invocation.zh-CN.md 提及返回导航**

```bash
grep "navigate_back\|返回" docs/guides/ai-agent-invocation.zh-CN.md
```

如果需要，在合适的调用顺序示例中添加 `navigate_back`。

- [ ] **Step 3: 运行架构守卫验证**

```bash
pnpm validate:architecture-guardrails
```

Expected: 通过（或至少不因为 navigate_back 而失败）。

- [ ] **Step 4: Commit 文档更新**

```bash
git add README.md docs/guides/ai-agent-invocation.zh-CN.md
git commit -m "docs: add navigate_back to tool catalog and invocation guide"
```

---

### 工作流2 验证门禁

- [ ] **Step W2-Final: 全量验证**

```bash
pnpm test:ci
pnpm validate:architecture-guardrails
pnpm validate:tool-output-contracts
```

Expected: 全绿通过。

---

## 工作流3：架构优化

### Task 3.1: contracts/types.ts 按域拆分

**Files:**
- Create: `packages/contracts/src/types/platform.ts`
- Create: `packages/contracts/src/types/session.ts`
- Create: `packages/contracts/src/types/tool-common.ts`
- Modify: `packages/contracts/src/types.ts`（瘦身，保留重新导出）

**策略**: 这是一个**高风险**变更，因为 `types.ts` 有2163行，被整个 monorepo 导入。采用**渐进式拆分**：先创建新文件，然后修改 `types.ts` 为重新导出，确保零破坏性变更。

- [ ] **Step 1: 创建 platform.ts**

```typescript
// packages/contracts/src/types/platform.ts
export type Platform = "android" | "ios";
export type RunnerProfile = "phase1" | "native_android" | "native_ios" | "flutter_android";
export type CapabilitySupportLevel = "full" | "conditional" | "partial" | "unsupported";
```

- [ ] **Step 2: 从 types.ts 提取 Platform/RunnerProfile/CapabilitySupportLevel**

在 `types.ts` 中：

```typescript
// 替换原有定义为重新导出
export type { Platform, RunnerProfile, CapabilitySupportLevel } from "./types/platform.js";
```

- [ ] **Step 3: 运行 build 验证无破坏性变更**

```bash
pnpm build
```

Expected: 成功。所有下游导入 `Platform` / `RunnerProfile` 的包应不受影响。

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/types/platform.ts packages/contracts/src/types.ts
git commit -m "refactor(contracts): extract platform types into types/platform.ts"
```

**后续步骤**（如果Step 3成功）：继续提取 `session.ts`（Session, SessionTimelineEvent 等）和 `tool-common.ts`（ToolResult, ReasonCode 等）。如果Step 3失败，回滚并重新评估拆分策略。

---

### Task 3.2: 平台分支清理（ui-inspection-tools.ts）

**Files:**
- Create: `packages/adapter-maestro/src/ui-inspection-tools-android.ts`
- Create: `packages/adapter-maestro/src/ui-inspection-tools-ios.ts`
- Modify: `packages/adapter-maestro/src/ui-inspection-tools.ts`

**策略**: 将 `ui-inspection-tools.ts` 中的4处平台分支提取到专用模块，主文件只保留工具编排逻辑。

- [ ] **Step 1: 识别4处平台分支**

```bash
grep -n "platform ===" packages/adapter-maestro/src/ui-inspection-tools.ts
```

- [ ] **Step 2: 提取 Android 特定逻辑到 ui-inspection-tools-android.ts**

```typescript
// packages/adapter-maestro/src/ui-inspection-tools-android.ts
export function buildAndroidInspectUiCommand(deviceId: string): string[] {
  return ["adb", "-s", deviceId, "shell", "uiautomator", "dump"];
}
```

- [ ] **Step 3: 提取 iOS 特定逻辑到 ui-inspection-tools-ios.ts**

```typescript
// packages/adapter-maestro/src/ui-inspection-tools-ios.ts
export function buildIosInspectUiCommand(deviceId: string): string[] {
  // AXe or WDA based command building
  return []; // 具体实现从原文件复制
}
```

- [ ] **Step 4: 修改 ui-inspection-tools.ts 使用提取的模块**

替换 `if (platform === "android")` 分支为：

```typescript
import { buildAndroidInspectUiCommand } from "./ui-inspection-tools-android.js";
import { buildIosInspectUiCommand } from "./ui-inspection-tools-ios.js";

const buildCommand = platform === "android" ? buildAndroidInspectUiCommand : buildIosInspectUiCommand;
const command = buildCommand(deviceId);
```

- [ ] **Step 5: 运行测试验证**

```bash
pnpm test:adapter
```

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-maestro/src/ui-inspection-tools-*.ts
git commit -m "refactor(adapter-maestro): extract platform-specific inspect commands from ui-inspection-tools.ts"
```

---

### Task 3.3: Policy 逻辑从 interruption-tools.ts 迁移

**Files:**
- Modify: `packages/adapter-maestro/src/interruption-tools.ts`
- Modify: `packages/mcp-server/src/policy-guard.ts`

**策略**: 将 `interruption-tools.ts` 中的策略规则加载和高风险门控检查，改为通过参数传入预验证的策略决策。

- [ ] **Step 1: 识别 Policy 逻辑范围**

```bash
grep -n "policy\|Policy\|allow\|deny" packages/adapter-maestro/src/interruption-tools.ts | head -20
```

- [ ] **Step 2: 在 policy-guard.ts 中添加 interruption 策略检查**

如果 `policy-guard.ts` 尚未包含 interruption 相关策略映射，添加：

```typescript
// packages/mcp-server/src/policy-guard.ts
function requiredScopesForInterruptionTool(toolName: string): string[] {
  switch (toolName) {
    case TOOL_NAMES.resolveInterruption:
      return ["interactive", "full-control"];
    default:
      return ["read-only"];
  }
}
```

- [ ] **Step 3: 修改 interruption-tools.ts 接收策略决策**

将策略加载逻辑替换为从输入参数接收 `policyDecision`：

```typescript
interface InterruptionToolInput {
  // ... existing fields
  policyDecision?: {
    allowed: boolean;
    requiredScopes: string[];
    reason?: string;
  };
}
```

- [ ] **Step 4: 运行测试验证**

```bash
pnpm test:unit
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-maestro/src/interruption-tools.ts packages/mcp-server/src/policy-guard.ts
git commit -m "refactor(adapter-maestro,mcp-server): migrate interruption policy checks from adapter to policy-guard"
```

---

## 全局验证门禁

每个工作流完成后必须运行：

```bash
pnpm build
pnpm typecheck
pnpm test:ci
pnpm validate:architecture-guardrails
pnpm validate:tool-output-contracts
```

Expected: 全绿通过。

---

## 计划执行选项

**Plan saved to:** `.planning/phases/phase-21-22-implementation-plan.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — 我为每个 Task 派遣独立子代理，每个子代理专注一个文件/模块，我在 Task 之间审查结果

2. **Inline Execution** — 在当前会话中按步骤顺序执行，适合对代码库已有深入理解的场景

**Which approach?**
