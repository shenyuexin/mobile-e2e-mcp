# Plan 25-02: Report Generator

**Parent:** Phase 25 — Full App Explorer
**Type:** Implementation
**Location:** `packages/explorer/src/report/`
**Dependencies:** 25-01 (engine output types, PageRegistry interface)
**Duration:** 1-2 days

---

## Objective

Implement report generation that produces `summary.json`, `report.md`, Mermaid graph, per-page artifacts, and `index.json` updates.

---

## Step 1: Directory Structure

```
packages/explorer/src/report/
├── index.ts              # generateReport() entry point
├── summary.ts            # summary.json generation
├── markdown.ts           # report.md template rendering
├── mermaid.ts            # Mermaid graph generation
├── modules.ts            # Module inference (§5.3.2)
├── index-manager.ts      # index.json management
├── templates/
│   └── report.md.template  # Markdown template
└── tests/
    ├── summary.test.ts
    ├── markdown.test.ts
    ├── mermaid.test.ts
    └── modules.test.ts
```

---

## Step 2: Module Inference (`src/report/modules.ts`)

### 2.1 Implement §5.3.2 algorithm

```typescript
import { PageEntry } from '../types';

export interface ModuleGroup {
  name: string;
  pages: PageEntry[];
}

export function inferModules(pages: PageEntry[]): ModuleGroup[] {
  const groups = new Map<string, PageEntry[]>();

  for (const page of pages) {
    // depth-1 path segment = first element in path
    const moduleName = page.path.length > 0
      ? page.path[0]
      : 'Home';

    if (!groups.has(moduleName)) {
      groups.set(moduleName, []);
    }
    groups.get(moduleName)!.push(page);
  }

  return Array.from(groups.entries())
    .map(([name, pages]) => ({ name, pages }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

### 2.2 Tests

`tests/modules.test.ts`:
- [ ] Empty pages → returns `[{ name: 'Home', pages: [] }]` (or empty)
- [ ] Pages with depth-1 path "Wi-Fi" → grouped under "Wi-Fi"
- [ ] Pages with empty path → grouped under "Home"
- [ ] Multiple modules sorted alphabetically

---

## Step 3: Summary Generation (`src/report/summary.ts`)

### 3.1 Implement summary.json

```typescript
import { PageEntry, FailureEntry, ExplorerConfig } from '../types';
import { ModuleGroup } from './modules';

export interface RunEntry {
  id: string;
  appId: string;
  appVersion: string;
  platform: string;
  mode: string;
  scope?: string;
  pageCount: number;
  failureCount: number;
  durationMs: number;
  maxDepthReached: number;
  configPath: string;
  summaryPath: string;
  status: 'complete' | 'partial';
  aborted?: boolean;
  abortReason?: string;
}

export function generateSummaryJson(
  pages: PageEntry[],
  failures: FailureEntry[],
  modules: ModuleGroup[],
  config: ExplorerConfig,
  opts: { partial: boolean; abortReason?: string; durationMs: number }
): any {
  const maxDepth = pages.reduce((max, p) => Math.max(max, p.depth), 0);

  return {
    runId: generateRunId(),
    startedAt: '', // TODO: capture at explore start
    completedAt: new Date().toISOString(),
    durationMs: opts.durationMs,
    totalPages: pages.length,
    totalPaths: countUniquePaths(pages),
    totalFailures: failures.length,
    maxDepthReached: maxDepth,
    uniqueModules: modules.map(m => m.name),
    failures: failures.map(f => ({
      pageScreenId: f.pageScreenId,
      elementLabel: f.elementLabel,
      failureType: f.failureType,
      retryCount: f.retryCount,
      errorMessage: f.errorMessage,
      depth: f.depth,
      path: f.path,
    })),
    pages: pages.map(p => ({
      id: p.id,
      screenId: p.screenId,
      screenTitle: p.screenTitle,
      depth: p.depth,
      path: p.path,
      arrivedFrom: p.arrivedFrom,
      viaElement: p.viaElement,
      loadTimeMs: p.loadTimeMs,
      clickableCount: p.clickableCount,
      hasFailure: p.hasFailure,
    })),
    ...(opts.partial ? { aborted: true, abortReason: opts.abortReason } : {}),
  };
}

function generateRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function countUniquePaths(pages: PageEntry[]): number {
  const paths = new Set(pages.map(p => p.path.join('/')));
  return paths.size;
}
```

### 3.2 Tests

`tests/summary.test.ts`:
- [ ] Summary includes correct page count
- [ ] Partial report includes `aborted: true` and `abortReason`
- [ ] Full report does not include `aborted`
- [ ] `uniqueModules` matches module inference output
- [ ] `maxDepthReached` is correct

---

## Step 4: Markdown Report (`src/report/markdown.ts`)

### 4.1 Implement report.md template

```typescript
import { PageEntry, FailureEntry } from '../types';
import { ModuleGroup } from './modules';

export function generateMarkdown(
  pages: PageEntry[],
  failures: FailureEntry[],
  modules: ModuleGroup[],
  config: ExplorerConfig,
  opts: { partial: boolean; abortReason?: string; durationMs: number }
): string {
  const appVersion = 'unknown'; // TODO: detect from device
  const maxDepth = pages.reduce((max, p) => Math.max(max, p.depth), 0);
  const slowPages = pages.filter(p => p.loadTimeMs > 5000);

  let content = `# APP Exploration Report — ${config.appId} v${appVersion}\n\n`;

  if (opts.partial) {
    content = `# ⚠️ PARTIAL REPORT — APP Exploration Report — ${config.appId} v${appVersion}\n\n`;
    if (opts.abortReason) {
      content += `> **Aborted:** ${opts.abortReason}\n\n`;
    }
  }

  content += `## Overview
| Metric | Value |
|--------|-------|
| Exploration Time | ${new Date().toISOString()} |
| Duration | ${formatDuration(opts.durationMs)} |
| Mode | ${config.mode} |
| Total Pages | ${pages.length} |
| Total Paths | ${countUniquePaths(pages)} |
| Failures | ${failures.length} |
| Max Depth | ${maxDepth} |
| Platform | ${config.platform} |

## Page Map

See [graph.mmd](./graph.mmd)

`;

  content += `## Module Breakdown\n\n`;
  for (const mod of modules) {
    content += `### ${mod.name} (${mod.pages.length} pages)\n`;
    content += `| Page | Depth | Path | Status |\n`;
    content += `|------|-------|------|--------|\n`;
    for (const page of mod.pages) {
      const status = page.hasFailure ? '❌' : '✅';
      content += `| ${page.screenTitle || page.screenId} | ${page.depth} | ${page.path.join(' → ')} | ${status} |\n`;
    }
    content += '\n';
  }

  if (failures.length > 0) {
    content += `## Alerts\n\n`;
    content += `### ❌ Failed Pages (${failures.length})\n\n`;
    for (const f of failures) {
      content += `- **${f.pageScreenId}**: ${f.failureType} on "${f.elementLabel}" at depth ${f.depth}\n`;
      content += `  Path: ${f.path.join(' → ')}\n`;
      content += `  Error: ${f.errorMessage}\n\n`;
    }
  }

  if (slowPages.length > 0) {
    content += `### ⚠️ Slow Pages (load > 5s)\n\n`;
    for (const p of slowPages) {
      content += `- **${p.screenId}**: ${p.loadTimeMs}ms\n`;
    }
    content += '\n';
  }

  return content;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
```

### 4.2 Tests

`tests/markdown.test.ts`:
- [ ] Markdown includes overview table with correct values
- [ ] Partial report includes `⚠️ PARTIAL REPORT —` prefix
- [ ] Module breakdown groups pages correctly
- [ ] Failure section lists all failures
- [ ] Slow pages section appears only when pages > 5s

---

## Step 5: Mermaid Graph (`src/report/mermaid.ts`)

### 5.1 Implement graph generation

```typescript
import { PageEntry, FailureEntry } from '../types';

export function generateMermaidGraph(pages: PageEntry[], failures: FailureEntry[]): string {
  const lines = ['graph TD'];

  // Add synthetic home node for pages whose arrivedFrom doesn't match any page
  const hasOrphanArrivals = pages.some(p =>
    p.arrivedFrom && !pages.some(pp => pp.screenId === p.arrivedFrom)
  );
  if (hasOrphanArrivals) {
    lines.push('  home["Home"]');
  }

  for (const page of pages) {
    const style = getFailureStatus(page.id, failures);
    const label = escapeMermaidLabel(page.screenTitle || page.screenId);
    lines.push(`  ${page.id}["${label}"]`);
    if (style === 'fail') lines.push(`  style ${page.id} fill:#f99,stroke:#f66`);
    else if (style === 'warn') lines.push(`  style ${page.id} fill:#ff9,stroke:#cc6`);
  }

  for (const page of pages) {
    if (page.arrivedFrom) {
      const fromId = findPageIdByScreenId(pages, page.arrivedFrom);
      const edgeLabel = page.viaElement ? `|${escapeMermaidLabel(page.viaElement)}|` : '';
      lines.push(`  ${fromId} -->${edgeLabel} ${page.id}`);
    }
  }

  return lines.join('\n');
}

function findPageIdByScreenId(pages: PageEntry[], screenId: string): string {
  const found = pages.find(p => p.screenId === screenId);
  if (!found) return 'home'; // fallback to synthetic node
}

function getFailureStatus(pageId: string, failures: FailureEntry[]): 'ok' | 'warn' | 'fail' {
  const pageFailures = failures.filter(f => f.path.some(p => p.includes(pageId)));
  if (pageFailures.length > 2) return 'fail';
  if (pageFailures.length > 0) return 'warn';
  return 'ok';
}

function escapeMermaidLabel(text: string): string {
  return text.replace(/["()]/g, '').replace(/#/g, 'sharp');
}
```

### 5.2 Tests

`tests/mermaid.test.ts`:
- [ ] Graph has one node per page
- [ ] Edges connect parent to child via arrivedFrom
- [ ] Failed pages have red style
- [ ] Labels are escaped (no quotes, parens, or #)
- [ ] `findPageIdByScreenId` returns 'home' synthetic node when screenId not found
- [ ] Graph includes `home["Home"]` node when pages have orphan arrivedFrom references

---

## Step 6: Index Management (`src/report/index-manager.ts`)

### 6.1 Implement index.json

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

interface RunIndex {
  runs: RunEntry[];
}

interface RunEntry {
  id: string;
  appId: string;
  appVersion: string;
  platform: string;
  mode: string;
  pageCount: number;
  failureCount: number;
  durationMs: number;
  maxDepthReached: number;
  configPath: string;
  summaryPath: string;
  status: 'complete' | 'partial';
}

export function updateIndex(
  reportDir: string,
  entry: RunEntry
): void {
  const indexPath = join(reportDir, 'index.json');
  let index: RunIndex = { runs: [] };

  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, 'utf-8'));
  }

  index.runs.push(entry);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}
```

### 6.2 Tests

- [ ] Creates new index.json if none exists
- [ ] Appends to existing index.json
- [ ] Entry has all required fields

---

## Step 7: Main Entry Point (`src/report/index.ts`)

### 7.1 Implement `generateReport()`

```typescript
import { PageEntry, FailureEntry, ExplorerConfig } from '../types';
import { inferModules } from './modules';
import { generateSummaryJson } from './summary';
import { generateMarkdown } from './markdown';
import { generateMermaidGraph } from './mermaid';
import { updateIndex } from './index-manager';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function generateReport(
  pages: PageEntry[],
  failures: FailureEntry[],
  config: ExplorerConfig,
  opts: { partial: boolean; abortReason?: string; durationMs: number }
): Promise<void> {
  const modules = inferModules(pages);
  const reportDir = config.reportDir;
  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = join(reportDir, runId);

  mkdirSync(runDir, { recursive: true });

  // Generate summary.json
  const summary = generateSummaryJson(pages, failures, modules, config, opts);
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Generate report.md
  const markdown = generateMarkdown(pages, failures, modules, config, opts);
  writeFileSync(join(runDir, 'report.md'), markdown);

  // Generate graph.mmd
  const graph = generateMermaidGraph(pages, failures);
  writeFileSync(join(runDir, 'graph.mmd'), graph);

  // Save config
  writeFileSync(join(runDir, 'config.json'), JSON.stringify(config, null, 2));

  // Update index.json
  updateIndex(reportDir, {
    id: runId,
    appId: config.appId,
    appVersion: 'unknown',
    platform: config.platform,
    mode: config.mode,
    pageCount: pages.length,
    failureCount: failures.length,
    durationMs: opts.durationMs,
    maxDepthReached: pages.reduce((max, p) => Math.max(max, p.depth), 0),
    configPath: join(runDir, 'config.json'),
    summaryPath: join(runDir, 'summary.json'),
    status: opts.partial ? 'partial' : 'complete',
  });
}
```

---

## Acceptance Criteria

- [ ] `generateReport()` creates all files in correct directory structure
- [ ] `summary.json` has all required fields per spec §5.3
- [ ] `report.md` renders correctly in VS Code Markdown preview
- [ ] `graph.mmd` renders in GitHub and Obsidian
- [ ] `index.json` is updated after each run (no duplicates)
- [ ] Partial reports include `⚠️ PARTIAL REPORT —` prefix
- [ ] Module inference groups pages by depth-1 path segment
- [ ] For 200+ pages, top-level + sub-graph approach works (can defer to later)
- [ ] All unit tests pass

---

## Dependencies on 25-01

| Input | Source | Used In |
|-------|--------|---------|
| `PageEntry[]` | Engine output (`visited.getEntries()`) | All report functions |
| `FailureEntry[]` | Engine output (`failed.getEntries()`) | summary, markdown |
| `ExplorerConfig` | Config passed to explore() | summary, markdown, index |
| `durationMs` | Engine tracks start/end time | summary, markdown |
