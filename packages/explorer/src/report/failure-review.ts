/**
 * Failure review generation for exploration reports.
 *
 * Produces a focused diagnostic companion to report.md so failures can be
 * triaged without expanding the full traversal report.
 */

import type { ExplorerConfig, FailureEntry, PageEntry } from "../types.js";

/** Options passed to failure review generation. */
export interface FailureReviewOpts {
  /** Whether the exploration was partial/aborted. */
  partial: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
  /** Total duration in milliseconds. */
  durationMs: number;
}

export type FailureReviewCategory =
  | "navigation-backtrack"
  | "interaction-targeting"
  | "stability-timeout"
  | "app-crash"
  | "run-interruption";

export interface FailureReviewPattern {
  category: FailureReviewCategory;
  count: number;
  failureTypes: Partial<Record<FailureEntry["failureType"], number>>;
  affectedPages: Array<{
    screenId: string;
    screenTitle?: string;
    count: number;
  }>;
  examples: FailureReviewExample[];
}

export interface FailureReviewExample {
  pageScreenId: string;
  screenTitle?: string;
  elementLabel: string;
  failureType: FailureEntry["failureType"];
  retryCount: number;
  errorMessage: string;
  depth: number;
  path: string[];
}

export interface RuleDecisionContext {
  total: number;
  byRuleId: Record<string, number>;
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  examples: NonNullable<PageEntry["ruleDecision"]>[];
}

export interface FailureReview {
  appId: string;
  platform: ExplorerConfig["platform"];
  mode: ExplorerConfig["mode"];
  status: "complete" | "partial";
  abortReason?: string;
  durationMs: number;
  totalPages: number;
  totalFailures: number;
  generatedAt: string;
  patterns: FailureReviewPattern[];
  failedElements: FailureReviewExample[];
  ruleDecisionContext?: RuleDecisionContext;
  nextActions: string[];
  artifacts: {
    summary: "summary.json";
    report: "report.md";
    tree: "tree.txt";
    config: "config.json";
  };
}

const MAX_PATTERN_EXAMPLES = 5;
const MAX_RULE_EXAMPLES = 10;

export function generateFailureReviewJson(
  pages: PageEntry[],
  failures: FailureEntry[],
  config: ExplorerConfig,
  opts: FailureReviewOpts,
): FailureReview {
  const pagesByScreenId = new Map(pages.map((page) => [page.screenId, page]));
  const failedElements = failures.map((failure) =>
    toFailureExample(failure, pagesByScreenId.get(failure.pageScreenId)),
  );
  const patterns = groupPatterns(failedElements);
  const ruleDecisionContext = summarizeRuleDecisions(pages);

  return {
    appId: config.appId,
    platform: config.platform,
    mode: config.mode,
    status: opts.partial ? "partial" : "complete",
    ...(opts.abortReason ? { abortReason: opts.abortReason } : {}),
    durationMs: opts.durationMs,
    totalPages: pages.length,
    totalFailures: failures.length,
    generatedAt: new Date().toISOString(),
    patterns,
    failedElements,
    ...(ruleDecisionContext ? { ruleDecisionContext } : {}),
    nextActions: buildNextActions(patterns, failures.length, opts),
    artifacts: {
      summary: "summary.json",
      report: "report.md",
      tree: "tree.txt",
      config: "config.json",
    },
  };
}

export function generateFailureReviewMarkdown(review: FailureReview): string {
  let content = "# Explorer Failure Review\n\n";

  content += "## Overview\n\n";
  content += "| Metric | Value |\n";
  content += "|--------|-------|\n";
  content += `| App | ${escapeMarkdown(review.appId)} |\n`;
  content += `| Platform | ${review.platform} |\n`;
  content += `| Mode | ${review.mode} |\n`;
  content += `| Status | ${review.status} |\n`;
  if (review.abortReason) {
    content += `| Abort Reason | ${escapeMarkdown(review.abortReason)} |\n`;
  }
  content += `| Duration | ${formatDuration(review.durationMs)} |\n`;
  content += `| Total Pages | ${review.totalPages} |\n`;
  content += `| Total Failures | ${review.totalFailures} |\n\n`;

  content += "## Related Artifacts\n\n";
  content += `- [summary.json](./${review.artifacts.summary})\n`;
  content += `- [report.md](./${review.artifacts.report})\n`;
  content += `- [tree.txt](./${review.artifacts.tree})\n`;
  content += `- [config.json](./${review.artifacts.config})\n\n`;

  if (review.totalFailures === 0) {
    content += "No failures were recorded in this Explorer run.\n";
    return content;
  }

  content += "## Failure Patterns\n\n";
  for (const pattern of review.patterns) {
    content += `### ${pattern.category} (${pattern.count})\n\n`;
    content += "| Failure Type | Count |\n";
    content += "|--------------|-------|\n";
    for (const [failureType, count] of Object.entries(pattern.failureTypes)) {
      content += `| ${failureType} | ${count} |\n`;
    }
    content += "\n";

    content += "| Page | Element | Depth | Retries | Error |\n";
    content += "|------|---------|-------|---------|-------|\n";
    for (const example of pattern.examples) {
      const page = example.screenTitle ?? example.pageScreenId;
      content += `| ${escapeMarkdown(page)} | ${escapeMarkdown(example.elementLabel)} | ${example.depth} | ${example.retryCount} | ${escapeMarkdown(example.errorMessage)} |\n`;
    }
    content += "\n";
  }

  if (review.ruleDecisionContext) {
    content += "## Rule Decision Context\n\n";
    content += `Total recorded rule decisions: ${review.ruleDecisionContext.total}\n\n`;
    content += "| Rule | Count |\n";
    content += "|------|-------|\n";
    for (const [ruleId, count] of Object.entries(review.ruleDecisionContext.byRuleId)) {
      content += `| ${escapeMarkdown(ruleId)} | ${count} |\n`;
    }
    content += "\n";
  }

  content += "## Suggested Next Actions\n\n";
  for (const action of review.nextActions) {
    content += `- ${escapeMarkdown(action)}\n`;
  }

  return `${content}\n`;
}

function toFailureExample(
  failure: FailureEntry,
  page?: PageEntry,
): FailureReviewExample {
  return {
    pageScreenId: failure.pageScreenId,
    screenTitle: page?.screenTitle,
    elementLabel: failure.elementLabel,
    failureType: failure.failureType,
    retryCount: failure.retryCount,
    errorMessage: failure.errorMessage,
    depth: failure.depth,
    path: failure.path,
  };
}

function groupPatterns(examples: FailureReviewExample[]): FailureReviewPattern[] {
  const byCategory = new Map<FailureReviewCategory, FailureReviewExample[]>();
  for (const example of examples) {
    const category = classifyFailure(example.failureType);
    const bucket = byCategory.get(category) ?? [];
    bucket.push(example);
    byCategory.set(category, bucket);
  }

  return Array.from(byCategory.entries())
    .map(([category, bucket]) => ({
      category,
      count: bucket.length,
      failureTypes: countBy(bucket, (example) => example.failureType),
      affectedPages: summarizeAffectedPages(bucket),
      examples: bucket.slice(0, MAX_PATTERN_EXAMPLES),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function classifyFailure(type: FailureEntry["failureType"]): FailureReviewCategory {
  switch (type) {
    case "BACKTRACK_MISMATCH":
      return "navigation-backtrack";
    case "TAP_FAILED":
      return "interaction-targeting";
    case "TIMEOUT":
      return "stability-timeout";
    case "CRASH":
      return "app-crash";
    case "INTERRUPTED":
      return "run-interruption";
  }
}

function summarizeAffectedPages(
  examples: FailureReviewExample[],
): FailureReviewPattern["affectedPages"] {
  const byPage = new Map<string, { screenTitle?: string; count: number }>();
  for (const example of examples) {
    const current = byPage.get(example.pageScreenId) ?? {
      screenTitle: example.screenTitle,
      count: 0,
    };
    current.count += 1;
    byPage.set(example.pageScreenId, current);
  }

  return Array.from(byPage.entries())
    .map(([screenId, value]) => ({ screenId, ...value }))
    .sort((a, b) => b.count - a.count || a.screenId.localeCompare(b.screenId));
}

function summarizeRuleDecisions(pages: PageEntry[]): RuleDecisionContext | undefined {
  const decisions = pages
    .flatMap((page) => [page.ruleDecision, ...(page.ruleDecisions ?? [])])
    .filter((decision): decision is NonNullable<PageEntry["ruleDecision"]> => Boolean(decision));

  if (decisions.length === 0) {
    return undefined;
  }

  return {
    total: decisions.length,
    byRuleId: countBy(decisions, (decision) => decision.ruleId),
    byCategory: countBy(decisions, (decision) => decision.category),
    byAction: countBy(decisions, (decision) => decision.action),
    examples: decisions.slice(0, MAX_RULE_EXAMPLES),
  };
}

function buildNextActions(
  patterns: FailureReviewPattern[],
  totalFailures: number,
  opts: FailureReviewOpts,
): string[] {
  const actions: string[] = [];
  const categories = new Set(patterns.map((pattern) => pattern.category));

  if (totalFailures === 0) {
    actions.push("No failure-specific follow-up is required for this run.");
  }
  if (categories.has("navigation-backtrack")) {
    actions.push(
      "Inspect navigate_back behavior and fallback ordering for affected paths; BACKTRACK_MISMATCH usually means the Explorer could not realign the frame after returning.",
    );
  }
  if (categories.has("interaction-targeting")) {
    actions.push(
      "Compare target labels/selectors with the captured UI tree and consider a more stable selector before adding visual fallback.",
    );
  }
  if (categories.has("stability-timeout")) {
    actions.push(
      "Review UI settle timing around the failed transition and increase waits only where the artifact shows delayed state changes.",
    );
  }
  if (categories.has("app-crash")) {
    actions.push(
      "Check device/app logs for the same timestamp before treating the failure as an Explorer traversal issue.",
    );
  }
  if (opts.partial) {
    actions.push(
      "Treat this as a partial run and compare the abort reason with summary.json before making coverage claims.",
    );
  }

  return actions;
}

function countBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, "\\|");
}
