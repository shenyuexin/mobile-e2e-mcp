/**
 * Run-to-run Explorer artifact diffing.
 *
 * Builds a machine-consumable comparison from two run directories by reusing
 * `computeDiff` over each run's `summary.json` page inventory, enriching it with
 * `failure-review.json` failure-pattern deltas and optional `audit*.json`
 * UI-audit baseline deltas. The result drives both the PR Markdown summary and
 * the self-contained HTML report.
 *
 * Existing artifacts (summary.json, report.md, failure-review.*, tree.txt,
 * config.json, index.json) are never modified — this module only reads them.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FailureEntry, PageEntry } from '../types.js';
import type { FailureReview, FailureReviewExample } from './failure-review.js';
import { computeDiff, type RunDiff } from './index-manager.js';
import type { RunSummary } from './summary.js';

/** One failure-pattern count change between two runs. */
export interface FailurePatternDelta {
  category: string;
  base: number;
  head: number;
  delta: number;
}

/** UI-audit baseline delta extracted from an optional `audit*.json` artifact. */
export interface UiAuditDelta {
  baseStatus?: string;
  headStatus?: string;
  surfaceName?: string;
  baselinePath?: string;
  baseNewRegressions: number;
  headNewRegressions: number;
  headNewIssueCount: number;
  hasRegressions: boolean;
}

/** A compact view of a failure example used by the HTML report details. */
export interface DiffFailureExample {
  pageScreenId: string;
  screenTitle?: string;
  elementLabel: string;
  failureType: string;
  errorMessage: string;
  path: string[];
  screenshotPath?: string;
  elementCropPath?: string;
  diffPath?: string;
}

/** Normalized, machine-consumable run comparison. */
export interface RunComparison {
  baseRunId: string;
  headRunId: string;
  baseDir?: string;
  headDir?: string;
  newPages: string[];
  removedPages: string[];
  statusChanges: RunDiff['statusChanges'];
  pathChanges: RunDiff['pathChanges'];
  /** Status changes where a previously healthy page started failing. */
  regressedPages: RunDiff['statusChanges'];
  failurePatterns: {
    base: Record<string, number>;
    head: Record<string, number>;
    delta: FailurePatternDelta[];
  };
  failures: { base: number; head: number };
  /** Failure-pattern categories whose count increased. */
  increasedFailurePatterns: FailurePatternDelta[];
  uiAudit?: UiAuditDelta;
  /** Failure details from the head run, for the HTML report. */
  failureExamples: DiffFailureExample[];
  /** Human-readable page titles keyed by page id/screen id. */
  pageTitles: Record<string, string>;
  /** True when pages, failure patterns, or the UI audit regressed. */
  hasRegressions: boolean;
  summary: {
    totalNew: number;
    totalRemoved: number;
    totalStatusChanges: number;
    totalPathChanges: number;
    totalRegressedPages: number;
    totalFailureDelta: number;
  };
}

/** Raw audit artifact snapshot (tolerates both ToolResult and raw data shapes). */
export interface AuditArtifactSnapshot {
  status?: string;
  surfaceName?: string;
  baselinePath?: string;
  newRegressions: number;
  newIssueCount: number;
}

/** Parsed artifacts from a single run directory. */
export interface RunArtifacts {
  dir?: string;
  runId: string;
  summary: RunSummary | null;
  failureReview: FailureReview | null;
  audit: AuditArtifactSnapshot | null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readJsonIfPresent(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Extract a UI-audit snapshot from a ToolResult-shaped or raw-data JSON value. */
export function parseAuditArtifact(raw: unknown): AuditArtifactSnapshot | null {
  const root = asRecord(raw);
  if (!root) return null;
  const data = asRecord(root.data) ?? root;
  const baselineDiff = asRecord(data.baselineDiff);
  const regressions = baselineDiff?.newRegressions;
  const newIssueCounts = baselineDiff?.newIssueCounts;
  const issueCounts = asRecord(data.issueCounts);
  const totalFrom = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return {
    ...(typeof root.status === 'string' ? { status: root.status } : {}),
    ...(typeof data.surfaceName === 'string' ? { surfaceName: data.surfaceName } : {}),
    ...(typeof baselineDiff?.baselinePath === 'string'
      ? { baselinePath: baselineDiff.baselinePath }
      : {}),
    newRegressions: Array.isArray(regressions) ? regressions.length : 0,
    newIssueCount: totalFrom(asRecord(newIssueCounts)?.total ?? issueCounts?.total),
  };
}

function findAuditArtifactPath(dir: string): string | undefined {
  const candidates = ['audit.json', 'audit-result.json'];
  const direct = candidates.find((name) => existsSync(join(dir, name)));
  if (direct) return join(dir, direct);
  try {
    const named = readdirSync(dir)
      .filter((name) => /^audit[-_].*\.json$/i.test(name))
      .sort();
    return named.length > 0 ? join(dir, named[named.length - 1] as string) : undefined;
  } catch {
    return undefined;
  }
}

/** Load the diff-relevant artifacts from a single Explorer run directory. */
export function loadRunArtifacts(dir: string): RunArtifacts {
  const summaryRaw = asRecord(readJsonIfPresent(join(dir, 'summary.json')));
  const reviewRaw = asRecord(readJsonIfPresent(join(dir, 'failure-review.json')));
  const auditPath = findAuditArtifactPath(dir);
  const auditRaw = auditPath ? readJsonIfPresent(auditPath) : undefined;
  const auditValues = Array.isArray(auditRaw)
    ? auditRaw.map(parseAuditArtifact).filter((item): item is AuditArtifactSnapshot => item !== null)
    : [];

  return {
    dir,
    runId:
      typeof summaryRaw?.runId === 'string'
        ? summaryRaw.runId
        : dir.split(/[\\/]/).filter(Boolean).pop() ?? dir,
    summary: (summaryRaw as unknown as RunSummary) ?? null,
    failureReview: (reviewRaw as unknown as FailureReview) ?? null,
    audit: auditValues.at(-1) ?? parseAuditArtifact(auditRaw),
  };
}

function countPatterns(review: FailureReview | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pattern of review?.patterns ?? []) {
    const key = pattern.category ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + (pattern.count ?? 0);
  }
  return counts;
}

function buildFailureExamples(review: FailureReview | null): DiffFailureExample[] {
  const examples = (review?.failedElements ?? []) as FailureReviewExample[];
  return examples.slice(0, 50).map((example) => ({
    pageScreenId: example.pageScreenId,
    ...(example.screenTitle ? { screenTitle: example.screenTitle } : {}),
    elementLabel: example.elementLabel,
    failureType: String(example.failureType),
    errorMessage: example.errorMessage,
    path: example.path ?? [],
    ...(example.visualEvidence?.screenshotPath
      ? { screenshotPath: example.visualEvidence.screenshotPath }
      : {}),
    ...(example.visualEvidence?.elementCropPath
      ? { elementCropPath: example.visualEvidence.elementCropPath }
      : {}),
    ...(example.visualEvidence?.diffPath ? { diffPath: example.visualEvidence.diffPath } : {}),
  }));
}

function buildPageTitles(summary: RunSummary | null): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const page of summary?.pages ?? []) {
    if (page.screenTitle) {
      titles[page.id] = page.screenTitle;
      titles[page.screenId] = page.screenTitle;
    }
  }
  return titles;
}

function buildAuditDelta(base: RunArtifacts, head: RunArtifacts): UiAuditDelta | undefined {
  if (!base.audit && !head.audit) return undefined;
  const baseRegressions = base.audit?.newRegressions ?? 0;
  const headRegressions = head.audit?.newRegressions ?? 0;
  const headIssues = head.audit?.newIssueCount ?? 0;
  return {
    ...(base.audit?.status ? { baseStatus: base.audit.status } : {}),
    ...(head.audit?.status ? { headStatus: head.audit.status } : {}),
    ...(head.audit?.surfaceName ? { surfaceName: head.audit.surfaceName } : {}),
    ...(head.audit?.baselinePath ? { baselinePath: head.audit.baselinePath } : {}),
    baseNewRegressions: baseRegressions,
    headNewRegressions: headRegressions,
    headNewIssueCount: headIssues,
    hasRegressions:
      head.audit?.status === 'failed' || headRegressions > 0 || headIssues > 0,
  };
}

/** Compare two sets of already-parsed run artifacts. */
export function compareRunArtifacts(base: RunArtifacts, head: RunArtifacts): RunComparison {
  const basePages = (base.summary?.pages ?? []).map((page) => ({
    id: page.id,
    path: page.path ?? [],
    hasFailure: page.hasFailure === true,
  }));
  const headPages = (head.summary?.pages ?? []).map((page) => ({
    id: page.id,
    path: page.path ?? [],
    hasFailure: page.hasFailure === true,
  }));

  const diff = computeDiff(base.runId, head.runId, basePages, headPages);
  const basePatterns = countPatterns(base.failureReview);
  const headPatterns = countPatterns(head.failureReview);
  const categories = Array.from(new Set([...Object.keys(basePatterns), ...Object.keys(headPatterns)])).sort();
  const patternDelta: FailurePatternDelta[] = categories.map((category) => {
    const baseCount = basePatterns[category] ?? 0;
    const headCount = headPatterns[category] ?? 0;
    return { category, base: baseCount, head: headCount, delta: headCount - baseCount };
  });
  const increasedFailurePatterns = patternDelta.filter((item) => item.delta > 0);
  const regressedPages = diff.statusChanges.filter(
    (change) => change.from === 'ok' && change.to === 'failed',
  );
  const uiAudit = buildAuditDelta(base, head);
  const failureDelta = (head.summary?.totalFailures ?? 0) - (base.summary?.totalFailures ?? 0);

  return {
    baseRunId: base.runId,
    headRunId: head.runId,
    ...(base.dir ? { baseDir: base.dir } : {}),
    ...(head.dir ? { headDir: head.dir } : {}),
    newPages: diff.newPages,
    removedPages: diff.removedPages,
    statusChanges: diff.statusChanges,
    pathChanges: diff.pathChanges,
    regressedPages,
    failurePatterns: { base: basePatterns, head: headPatterns, delta: patternDelta },
    failures: {
      base: base.summary?.totalFailures ?? 0,
      head: head.summary?.totalFailures ?? 0,
    },
    increasedFailurePatterns,
    ...(uiAudit ? { uiAudit } : {}),
    failureExamples: buildFailureExamples(head.failureReview),
    pageTitles: { ...buildPageTitles(base.summary), ...buildPageTitles(head.summary) },
    hasRegressions:
      regressedPages.length > 0 ||
      increasedFailurePatterns.length > 0 ||
      failureDelta > 0 ||
      uiAudit?.hasRegressions === true,
    summary: {
      totalNew: diff.summary.totalNew,
      totalRemoved: diff.summary.totalRemoved,
      totalStatusChanges: diff.summary.totalStatusChanges,
      totalPathChanges: diff.summary.totalPathChanges,
      totalRegressedPages: regressedPages.length,
      totalFailureDelta: failureDelta,
    },
  };
}

/** Compute a run-to-run diff directly from two run directories. */
export function computeRunDiff(baseDir: string, headDir: string): RunComparison {
  return compareRunArtifacts(loadRunArtifacts(baseDir), loadRunArtifacts(headDir));
}

/** Build a single-run comparison for use by `generateReport` (empty baseline). */
export function createRunComparison(input: {
  runId: string;
  pages: PageEntry[];
  failures: FailureEntry[];
  failureReview?: FailureReview | null;
  audit?: AuditArtifactSnapshot | null;
  dir?: string;
}): RunComparison {
  const pages = input.pages.map((page) => ({
    id: page.id,
    screenId: page.screenId,
    screenTitle: page.screenTitle,
    path: page.path ?? [],
    hasFailure: page.hasFailure === true,
  }));
  const summary = {
    runId: input.runId,
    totalFailures: input.failures.length,
    pages,
  } as RunSummary;

  return compareRunArtifacts(
    { runId: 'baseline(none)', summary: null, failureReview: null, audit: null },
    {
      ...(input.dir ? { dir: input.dir } : {}),
      runId: input.runId,
      summary,
      failureReview: input.failureReview ?? null,
      audit: input.audit ?? null,
    },
  );
}

function formatPageList(title: string, ids: string[], comparison: RunComparison): string {
  const lines = [`### ${title} (${ids.length})`, ''];
  if (ids.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| Page | Title |');
    lines.push('| --- | --- |');
    for (const id of ids.slice(0, 100)) {
      lines.push(`| \`${escapeMarkdownCell(id)}\` | ${escapeMarkdownCell(comparison.pageTitles[id] ?? '—')} |`);
    }
    if (ids.length > 100) lines.push('', `_...and ${ids.length - 100} more_`);
  }
  return lines.join('\n');
}

function escapeMarkdownCell(value: string): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Render a PR-ready Markdown summary of a run comparison. */
export function formatDiffMarkdown(comparison: RunComparison): string {
  const notes = comparison.hasRegressions
    ? '**Regression gate: FAILED** — see regressed pages / failure patterns / UI audit below.'
    : '**Regression gate: passed** — no new regressions detected.';
  const failureDelta = comparison.summary.totalFailureDelta;
  const auditLines: string[] = [];
  if (comparison.uiAudit) {
    const audit = comparison.uiAudit;
    auditLines.push(
      `| UI audit new regressions | ${audit.baseNewRegressions} | ${audit.headNewRegressions} |`,
      `| UI audit new issues | — | ${audit.headNewIssueCount} |`,
      '',
      audit.hasRegressions ? 'UI audit baseline regressed.' : 'No UI audit regression detected.',
    );
  }

  const patternLines = [
    '### Failure pattern delta',
    '',
    '| Category | Base | Head | Delta |',
    '| --- | ---: | ---: | ---: |',
  ];
  if (comparison.failurePatterns.delta.length === 0) {
    patternLines.push('| _none_ | 0 | 0 | 0 |');
  } else {
    for (const item of comparison.failurePatterns.delta) {
      patternLines.push(`| ${escapeMarkdownCell(item.category)} | ${item.base} | ${item.head} | ${item.delta > 0 ? `+${item.delta}` : item.delta} |`);
    }
  }

  return [
    '# Explorer run diff report',
    '',
    `- Baseline: \`${comparison.baseRunId}\``,
    `- Head: \`${comparison.headRunId}\``,
    `- Regressions: ${comparison.hasRegressions ? 'YES' : 'no'}`,
    '',
    notes,
    '',
    '## Summary',
    '',
    '| Metric | Base | Head | Delta |',
    '| --- | ---: | ---: | ---: |',
    `| Pages | — | — | ${comparison.summary.totalNew} added / ${comparison.summary.totalRemoved} removed |`,
    `| Failures | ${comparison.failures.base} | ${comparison.failures.head} | ${failureDelta > 0 ? `+${failureDelta}` : failureDelta} |`,
    `| Regressed pages | — | — | ${comparison.summary.totalRegressedPages} |`,
    `| Status changes | — | — | ${comparison.summary.totalStatusChanges} |`,
    `| Path changes | — | — | ${comparison.summary.totalPathChanges} |`,
    '',
    ...auditLines,
    '',
    ...patternLines,
    '',
    formatPageList('Added pages', comparison.newPages, comparison),
    '',
    formatPageList('Removed pages', comparison.removedPages, comparison),
    '',
    formatPageList('Regressed pages', comparison.regressedPages.map((item) => item.pageId), comparison),
    '',
  ].join('\n');
}
