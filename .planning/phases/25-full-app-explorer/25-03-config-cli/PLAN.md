# Plan 25-03: Pre-flight Interview + Config + CLI

**Parent:** Phase 25 — Full App Explorer
**Type:** Implementation
**Location:** `packages/explorer/src/config.ts`, CLI wiring
**Dependencies:** 25-01 (types from Step 2 only), 25-02 (report interface)
**Duration:** 1 day

---

## Objective

Implement the CLI entry point for the explorer, integrated into the existing monorepo CLI surface.

### R5-E: CLI Architecture Decision (locked)

The repo's current CLI structure:
- `packages/cli/src/index.js` — thin stdio pass-through to `@shenyuexin/mobile-e2e-mcp`
- `packages/mcp-server/src/cli/preset-runner.ts` — preset step execution
- `packages/mcp-server/src/server.ts` — `MobileE2EMcpServer.invoke(...)`

**Decision:** The `explore` subcommand will be delivered as:

```bash
npx mobile-e2e-mcp explore [--mode smoke|full] [--app-id <id>] [--platform <platform>]
```

Implementation approach:
1. Create `packages/explorer/` as a new workspace package
2. Add a CLI entry script at `packages/explorer/src/cli.ts`
3. Wire it into the existing `packages/cli/src/index.js` pass-through via stdio spawn
4. The explorer imports `MobileE2EMcpServer` from the mcp-server package (`packages/mcp-server/src/server.ts` / `packages/mcp-server/src/index.ts`, package name `@shenyuexin/mobile-e2e-mcp`) directly (in-process), NOT via HTTP

**What this means for package.json:**
- `packages/explorer` is auto-included by the root `pnpm-workspace.yaml` `packages/*` glob (already present)
- `packages/mcp-server`'s CLI layer needs a new case for the `explore` subcommand

**Why not a separate binary:** Keeping the explorer under the existing `mobile-e2e-mcp` bin avoids:
- Conflicting bin names
- Separate installation/PATH issues
- Duplicated stdio pass-through logic

---

## Step 1: Config Types and Schema (`src/config.ts`)

### 1.1 Define interview questions

```typescript
import { ExplorerConfig } from './types';

interface Question {
  id: string;
  prompt: string;
  options: { label: string; value: any }[];
  default: any;
}

export const INTERVIEW_QUESTIONS: Question[] = [
  {
    id: 'mode',
    prompt: '探索模式',
    options: [
      { label: 'A) 主流程冒烟', value: 'smoke' },
      { label: 'B) 指定模块', value: 'scoped' },
      { label: 'C) 全量探索', value: 'full' },
    ],
    default: 'scoped',
  },
  {
    id: 'auth',
    prompt: '登录态',
    options: [
      { label: 'A) 已登录', value: { type: 'already-logged-in' } },
      { label: 'B) 测试账号', value: { type: 'auto-login' } },
      { label: 'C) 手动登录', value: { type: 'handoff' } },
      { label: 'D) 不需要', value: { type: 'skip-auth' } },
    ],
    default: { type: 'already-logged-in' },
  },
  {
    id: 'failureStrategy',
    prompt: '失败策略',
    options: [
      { label: 'A) 重试3次', value: 'retry-3' },
      { label: 'B) 跳过', value: 'skip' },
      { label: 'C) 等待处理', value: 'handoff' },
    ],
    default: 'retry-3',
  },
  {
    id: 'maxDepth',
    prompt: '探索深度',
    options: [
      { label: 'A) 浅层 (5)', value: 5 },
      { label: 'B) 标准 (8)', value: 8 },
      { label: 'C) 深层 (12)', value: 12 },
    ],
    default: 8,
  },
  {
    id: 'compareWith',
    prompt: '历史对比',
    options: [
      { label: 'A) 对比最近一次', value: 'latest' },
      { label: 'B) 选择历史版本', value: 'select' },
      { label: 'C) 不对比', value: null },
    ],
    default: null,
  },
  {
    id: 'platform',
    prompt: '平台',
    options: [
      { label: 'A) iOS 模拟器', value: 'ios-simulator' },
      { label: 'B) iOS 真机', value: 'ios-device' },
      { label: 'C) Android 模拟器', value: 'android-emulator' },
      { label: 'D) Android 真机', value: 'android-device' },
    ],
    default: 'ios-simulator',
  },
  {
    id: 'destructiveActionPolicy',
    prompt: '破坏性操作策略',
    options: [
      { label: 'A) 跳过 (默认)', value: 'skip' },
      { label: 'B) 允许', value: 'allow' },
      { label: 'C) 弹出确认', value: 'confirm' },
    ],
    default: 'skip',
  },
];
```

### 1.2 Implement config persistence

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { ExplorerConfig } from './types';

const DEFAULT_CONFIG_PATH = '.explorer-config.json';

export function loadConfig(path: string = DEFAULT_CONFIG_PATH): ExplorerConfig | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as ExplorerConfig;
}

export function saveConfig(config: ExplorerConfig, path: string = DEFAULT_CONFIG_PATH): void {
  // Note: ExplorerConfig does NOT contain raw passwords — only passwordEnv (env var name)
  // and identifier (username). The auto-login credentials type only stores passwordEnv name.
  // No sensitive data needs to be stripped here.
  // SPEC §3.2: all config fields are persisted including destructiveActionPolicy (R1-#1, R3-J)
  writeFileSync(path, JSON.stringify(config, null, 2));
}

export function shouldReuseConfig(path: string = DEFAULT_CONFIG_PATH): boolean {
  if (!existsSync(path)) return false;
  // In CLI: prompt "使用上次配置？[Y/n]"
  // For now, default to true if config exists
  return true;
}
```

### 1.3 Implement adaptive maxPages calculation

```typescript
export class AdaptiveMaxPages {
  private rollingAvg: number;

  constructor(initialEstimateMs: number = 9000) {
    this.rollingAvg = initialEstimateMs;
  }

  update(currentPageTimeMs: number): void {
    // EMA with alpha=0.3
    this.rollingAvg = 0.7 * this.rollingAvg + 0.3 * currentPageTimeMs;
  }

  calculate(timeoutMs: number): number {
    const raw = Math.floor((timeoutMs * 0.8) / this.rollingAvg);
    return Math.min(500, Math.max(50, raw));
  }

  get rollingAvgMs(): number {
    return this.rollingAvg;
  }
}
```

### 1.4 Tests

`tests/config.test.ts`:
- [ ] `loadConfig` returns null when file doesn't exist
- [ ] `loadConfig` parses valid JSON config
- [ ] `saveConfig` writes valid JSON
- [ ] `AdaptiveMaxPages` calculates correctly (minPages=50, maxPages=500)
- [ ] EMA converges correctly after several updates

---

## Step 2: CLI Entry Point (`src/cli.ts`)

### 2.1 Implement CLI explorer command

> **R5-E fix:** The explorer does NOT define its own bin. Instead, it registers as a subcommand under the existing `mobile-e2e-mcp` CLI.

The existing `packages/cli/src/index.js` does:
```js
spawn("pnpm", ["--dir", repoRoot, "--filter", "@shenyuexin/mobile-e2e-mcp", "dev", "--", ...argv], ...)
```

This means all CLI arguments are forwarded to the `@shenyuexin/mobile-e2e-mcp` package (the mcp-server package). The explorer needs to:
1. Export an `explore` function from `packages/explorer/src/index.ts`
2. Add an `explore` command handler in the mcp-server's CLI layer (alongside existing presets)
3. The mcp-server CLI will detect `explore` as a subcommand and delegate to the explorer

**Integration point:** Add a new `explore` case in the mcp-server's CLI entry (e.g., `packages/mcp-server/src/cli/explore-runner.ts`), similar to how `preset-runner.ts` handles presets. This file will:
1. Import `explore()` and `ExplorerConfig` from `@mobile-e2e-mcp/explorer`
2. Import `MobileE2EMcpServer` and `createMcpAdapter` from the mcp-server and explorer packages
3. Parse `--mode`, `--app-id`, `--platform`, `--max-depth`, `--timeout-ms` flags
4. Build config, create server, run explore, print summary

### 2.3 Tests

`tests/cli.test.ts`:
- [ ] `--no-prompt` uses defaults without interaction
- [ ] `--app-id` overrides config appId
- [ ] `--platform` overrides config platform
- [ ] Config is saved after interview
- [ ] Exit code 0 on complete, 2 on partial

---

## Step 3: Integration Test

### 3.1 Full pipeline test with mocked MCP tools

This test verifies the entire pipeline works end-to-end before 25-04:

```typescript
// packages/explorer/tests/integration/pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { explore } from '../../src/engine';
import { generateReport } from '../../src/report';
import { loadFixture } from '../fixtures/loader';

describe('Pipeline integration', () => {
  it('CLI → Config → Engine → Report produces output files', async () => {
    // Mock MCP tools with fixture data
    const mockMcp = createMockMcpAdapter(loadFixture('settings-home'));

    // Run explore with mock
    const config = {
      mode: 'smoke' as const,
      appId: 'com.apple.Preferences',
      platform: 'ios-simulator' as const,
      failureStrategy: 'skip' as const,
      maxDepth: 2,
      maxPages: 10,
      timeoutMs: 60000,
      reportDir: './test-reports',
      compareWith: null,
      auth: { type: 'skip-auth' as const },
    };

    const result = await explore(config, mockMcp);

    // Generate report
    await generateReport(
      result.visited.getEntries(),
      result.failed.getEntries(),
      config,
      { partial: false, durationMs: 1000 }
    );

    // Verify output files exist
    expect(existsSync('./test-reports/index.json')).toBe(true);
  });
});
```

### 3.2 Deliverables

- [ ] `packages/explorer/tests/integration/pipeline.test.ts`
- [ ] Test passes with mocked MCP adapter
- [ ] Test produces valid output files in `./test-reports/`

---

## Step 4: MCP Tool Integration

### 4.1 Use MCP adapter from 25-01

The `McpToolInterface` and `createMcpAdapter` are defined in 25-01 Step 0 (`src/mcp-adapter.ts`). The CLI integration imports from there:

```typescript
import { McpToolInterface, createMcpAdapter } from './mcp-adapter';
```

### 4.2 Integration pattern

The CLI runner (`explore-runner.ts`) creates the server and adapter:

```typescript
import { MobileE2EMcpServer } from '@shenyuexin/mobile-e2e-mcp/server';  // actual package path
import { createMcpAdapter, McpToolInterface } from '@mobile-e2e-mcp/explorer';
import { explore } from '@mobile-e2e-mcp/explorer';

// Create server with tool registry (same as existing mcp-server CLI)
const server = createServer(toolRegistry);
const mcp: McpToolInterface = createMcpAdapter(server);

// Run exploration
const result = await explore(config, mcp);
```

---

## Acceptance Criteria

- [ ] `npx mobile-e2e-mcp explore --no-prompt` runs exploration with defaults
- [ ] `npx mobile-e2e-mcp explore --app-id com.apple.Preferences` uses specified app
- [ ] Config persists to `.explorer-config.json`
- [ ] Re-run with existing config offers reuse prompt
- [ ] `--no-prompt` skips all interaction
- [ ] Exit code reflects run outcome (0=complete, 1=error, 2=partial)
- [ ] All unit tests pass
- [ ] `AdaptiveMaxPages` calculates correctly for various timeout values

---

## Dependencies

| From | Dependency | Used In |
|------|-----------|---------|
| 25-01 | `explore()` function signature | `cli.ts` |
| 25-01 | `PageRegistry`, `FailureLog` interfaces | `cli.ts` |
| 25-02 | `generateReport()` function signature | `cli.ts` |
| 25-01 | MCP tool interface (`McpToolInterface`, `createMcpAdapter`) | `mcp-adapter.ts` |
