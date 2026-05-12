/**
 * Markdown report generation for exploration reports.
 *
 * Renders `report.md` from a structured template including overview table,
 * module breakdown, failure report, and slow page warnings.
 *
 * §5.4 — Markdown report template.
 */

import type { ExplorerConfig, FailureEntry, PageEntry } from '../types.js';
import type { ModuleGroup } from './modules.js';
import { countUniquePaths } from './summary.js';

/** Options passed to markdown generation. */
export interface MarkdownOpts {
  /** Whether the exploration was partial/aborted. */
  partial: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** Sampling metadata for high-fanout collection pages. */
  sampling?: {
    appliedPages: string[];
    skippedChildren: number;
    details?: Record<
      string,
      {
        screenTitle?: string;
        totalChildren: number;
        exploredChildren: number;
        skippedChildren: number;
        exploredLabels: string[];
        skippedLabels: string[];
      }
    >;
  };
}

/** Threshold in milliseconds for marking a page as "slow". */
const SLOW_PAGE_THRESHOLD_MS = 5000;

/**
 * Generate a Markdown-formatted exploration report.
 *
 * @param pages - All visited page entries
 * @param failures - All failure entries
 * @param modules - Inferred module groups
 * @param config - Explorer configuration
 * @param opts - Markdown options
 * @returns Markdown string ready for writing to report.md
 */
export function generateMarkdown(
  pages: PageEntry[],
  failures: FailureEntry[],
  modules: ModuleGroup[],
  config: ExplorerConfig,
  opts: MarkdownOpts,
): string {
  const appVersion = 'unknown';
  const maxDepth = pages.length > 0
    ? pages.reduce((max, p) => Math.max(max, p.depth), 0)
    : 0;
  const slowPages = pages.filter((p) => p.loadTimeMs > SLOW_PAGE_THRESHOLD_MS);

  let content = '';

  // Title
  if (opts.partial) {
    content += `# ⚠️ PARTIAL REPORT — APP Exploration Report — ${config.appId} v${appVersion}\n\n`;
    if (opts.abortReason) {
      content += `> **Aborted:** ${opts.abortReason}\n\n`;
    }
  } else {
    content += `# APP Exploration Report — ${config.appId} v${appVersion}\n\n`;
  }

  // Overview table
  content += `## Overview\n`;
  content += `| Metric | Value |\n`;
  content += `|--------|-------|\n`;
  content += `| Exploration Time | ${new Date().toISOString()} |\n`;
  content += `| Duration | ${formatDuration(opts.durationMs)} |\n`;
  content += `| Mode | ${config.mode} |\n`;
  content += `| Total Pages | ${pages.length} |\n`;
  content += `| Total Paths | ${countUniquePaths(pages)} |\n`;
  content += `| Failures | ${failures.length} |\n`;
  content += `| Max Depth | ${maxDepth} |\n`;
  content += `| Platform | ${config.platform} |\n\n`;

	// Page map reference
	content += `## Page Map\n\n`;
	content += `See [tree.txt](./tree.txt)\n\n`;

	if (opts.sampling) {
		content += `## Sampling Report\n\n`;
		content += `Sampling indicates intentional bounded coverage, not an unexplored traversal failure.\n\n`;
		content += `| Metric | Value |\n`;
		content += `|--------|-------|\n`;
		content += `| Sampled Pages | ${opts.sampling.appliedPages.length} |\n`;
		content += `| Skipped Children | ${opts.sampling.skippedChildren} |\n\n`;

		const details = opts.sampling.details ?? {};
		if (Object.keys(details).length > 0) {
			content += `| Page | Total Children | Explored | Skipped | Explored Labels | Skipped Labels |\n`;
			content += `|------|----------------|----------|---------|-----------------|----------------|\n`;
			for (const [screenId, detail] of Object.entries(details)) {
				const page = detail.screenTitle ?? pages.find((p) => p.screenId === screenId)?.screenTitle ?? screenId;
				content += `| ${escapeMarkdown(page)} | ${detail.totalChildren} | ${detail.exploredChildren} | ${detail.skippedChildren} | ${escapeMarkdown(formatLabelList(detail.exploredLabels))} | ${escapeMarkdown(formatLabelList(detail.skippedLabels))} |\n`;
			}
			content += "\n";
		}
	}

	const ruleDecisions = pages
		.flatMap((page) => [page.ruleDecision, ...(page.ruleDecisions ?? [])])
		.filter((decision): decision is NonNullable<PageEntry["ruleDecision"]> => decision !== undefined);
	if (ruleDecisions.length > 0) {
		content += `## Rule Decisions\n\n`;
		content += `Total recorded rule decisions: ${ruleDecisions.length}\n\n`;
		content += `These decisions explain intentional non-coverage such as skipped elements, gated pages, sampled collections, and deferred risky actions.\n\n`;

		content += `### Decision Summary\n\n`;
		content += `| Action | Category | Count |\n`;
		content += `|--------|----------|-------|\n`;
		for (const row of summarizeRuleDecisionPairs(ruleDecisions)) {
			content += `| ${escapeMarkdown(row.action)} | ${escapeMarkdown(row.category)} | ${row.count} |\n`;
		}
		content += "\n";

		content += `### Top Skip Reasons\n\n`;
		content += `| Count | Action | Category | Reason |\n`;
		content += `|-------|--------|----------|--------|\n`;
		for (const row of summarizeRuleDecisionReasons(ruleDecisions).slice(0, 10)) {
			content += `| ${row.count} | ${escapeMarkdown(row.action)} | ${escapeMarkdown(row.category)} | ${escapeMarkdown(row.reason)} |\n`;
		}
		content += "\n";

		content += `### Decision Examples\n\n`;
		content += `| Rule | Source | Support | Action | Example | Reason | Recovery | Caveat |\n`;
		content += `|------|--------|---------|--------|---------|--------|----------|--------|\n`;
		for (const decision of ruleDecisions.slice(0, 10)) {
			const example =
				decision.elementLabel ??
				decision.screenTitle ??
				(decision.path.join(" → ") || "(unknown)");
			content += `| ${escapeMarkdown(decision.ruleId)} | ${escapeMarkdown(decision.source ?? "unknown")} | ${escapeMarkdown(decision.supportLevel ?? "unspecified")} | ${escapeMarkdown(decision.action)} | ${escapeMarkdown(example)} | ${escapeMarkdown(decision.reason)} | ${escapeMarkdown(decision.recoveryMethod ?? "")} | ${escapeMarkdown(decision.caveat ?? "")} |\n`;
		}
		content += "\n";
	}

	// Module breakdown
  content += `## Module Breakdown\n\n`;
  for (const mod of modules) {
    content += `### ${mod.name} (${mod.pages.length} pages)\n\n`;
    content += `| Page | Depth | Path | Status |\n`;
    content += `|------|-------|------|--------|\n`;
    for (const page of mod.pages) {
      const status = page.hasFailure ? '❌' : '✅';
      const pathStr = page.path.length > 0 ? page.path.join(' → ') : '(root)';
      const title = page.screenTitle || page.screenId;
      content += `| ${escapeMarkdown(title)} | ${page.depth} | ${escapeMarkdown(pathStr)} | ${status} |\n`;
    }
    content += '\n';
  }

  // Failure report
  if (failures.length > 0) {
    content += `## Alerts\n\n`;
    content += `See [failure-review.md](./failure-review.md) for grouped diagnostics and next actions.\n\n`;
    content += `### ❌ Failed Pages (${failures.length})\n\n`;
    for (const f of failures) {
      const pathStr = f.path.length > 0 ? f.path.join(' → ') : '(root)';
      content += `- **${escapeMarkdown(f.pageScreenId)}**: ${f.failureType} on "${escapeMarkdown(f.elementLabel)}" at depth ${f.depth}\n`;
      content += `  Path: ${escapeMarkdown(pathStr)}\n`;
      content += `  Error: ${escapeMarkdown(f.errorMessage)}\n\n`;
    }
  }

  // Slow pages
  if (slowPages.length > 0) {
    content += `### ⚠️ Slow Pages (load > 5s)\n\n`;
    for (const p of slowPages) {
      content += `- **${escapeMarkdown(p.screenId)}**: ${p.loadTimeMs}ms\n`;
    }
    content += '\n';
  }

  return content;
}

/** Format milliseconds to a human-readable duration string. */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/** Escape special Markdown characters in text that could break table rendering. */
function escapeMarkdown(text: string): string {
  // In table cells, pipe characters need escaping
  return text.replace(/\|/g, '\\|');
}

function formatLabelList(labels: string[]): string {
	return labels.length > 0 ? labels.join(", ") : "(none)";
}

function summarizeRuleDecisionPairs(
	decisions: NonNullable<PageEntry["ruleDecision"]>[],
): Array<{ action: string; category: string; count: number }> {
	const counts = new Map<string, { action: string; category: string; count: number }>();
	for (const decision of decisions) {
		const key = `${decision.action}\u0000${decision.category}`;
		const current = counts.get(key) ?? {
			action: decision.action,
			category: decision.category,
			count: 0,
		};
		current.count += 1;
		counts.set(key, current);
	}
	return Array.from(counts.values()).sort(
		(a, b) =>
			b.count - a.count ||
			a.action.localeCompare(b.action) ||
			a.category.localeCompare(b.category),
	);
}

function summarizeRuleDecisionReasons(
	decisions: NonNullable<PageEntry["ruleDecision"]>[],
): Array<{ action: string; category: string; reason: string; count: number }> {
	const counts = new Map<
		string,
		{ action: string; category: string; reason: string; count: number }
	>();
	for (const decision of decisions) {
		const key = `${decision.action}\u0000${decision.category}\u0000${decision.reason}`;
		const current = counts.get(key) ?? {
			action: decision.action,
			category: decision.category,
			reason: decision.reason,
			count: 0,
		};
		current.count += 1;
		counts.set(key, current);
	}
	return Array.from(counts.values()).sort(
		(a, b) =>
			b.count - a.count ||
			a.action.localeCompare(b.action) ||
			a.category.localeCompare(b.category) ||
			a.reason.localeCompare(b.reason),
	);
}
