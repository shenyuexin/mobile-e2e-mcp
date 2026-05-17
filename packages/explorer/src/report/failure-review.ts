/**
 * Failure review generation for exploration reports.
 *
 * Produces a focused diagnostic companion to report.md so failures can be
 * triaged without expanding the full traversal report.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExplorerConfig, FailureEntry, PageEntry, UiHierarchy } from "../types.js";

/** Options passed to failure review generation. */
export interface FailureReviewOpts {
  /** Whether the exploration was partial/aborted. */
  partial: boolean;
  /** Reason for abortion, if applicable. */
  abortReason?: string;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** Optional raw explorer log text from the run directory. */
  logText?: string;
  /** Optional run directory for writing failure visual-evidence artifacts. */
  runDir?: string;
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
  visualEvidence?: FailureVisualEvidence;
}

export interface FailureVisualEvidence {
  status: "captured" | "missing_screenshot" | "missing_bounds";
  screenshotPath?: string;
  elementCropPath?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  baselineStatus: "not_configured";
  reason?: string;
}

export interface RuleDecisionContext {
  total: number;
  byRuleId: Record<string, number>;
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  examples: NonNullable<PageEntry["ruleDecision"]>[];
}

export interface ExplorerLogSignals {
  backtrackWarnings: LogSignalCounter;
  backtrackSuccesses: LogSignalCounter;
  reasonCodes: Record<string, number>;
  deviceConnectivity: {
    usbmuxNotFound: number;
    coreDeviceProviderMissing: number;
    connectionRefused: number;
    ideDisconnected: number;
    proxyBadGateway: number;
  };
  examples: ExplorerLogSignalExample[];
}

export interface LogSignalCounter {
  total: number;
  byMethod: Record<string, number>;
}

export interface ExplorerLogSignalExample {
  level: "warn" | "success" | "device";
  message: string;
  method?: string;
  reason?: string;
  status?: string;
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
  logSignals?: ExplorerLogSignals;
  nextActions: string[];
  artifacts: {
    summary: "summary.json";
    report: "report.md";
    tree: "tree.txt";
    config: "config.json";
    log?: "log.txt";
  };
}

const MAX_PATTERN_EXAMPLES = 5;
const MAX_RULE_EXAMPLES = 10;
const MAX_LOG_EXAMPLES = 12;

export function generateFailureReviewJson(
  pages: PageEntry[],
  failures: FailureEntry[],
  config: ExplorerConfig,
  opts: FailureReviewOpts,
): FailureReview {
  const pagesByScreenId = new Map(pages.map((page) => [page.screenId, page]));
  const failedElements = failures.map((failure, index) =>
    toFailureExample(failure, pagesByScreenId.get(failure.pageScreenId), {
      runDir: opts.runDir,
      index,
    }),
  );
  const patterns = groupPatterns(failedElements);
  const ruleDecisionContext = summarizeRuleDecisions(pages);
  const logSignals = opts.logText ? parseExplorerLogSignals(opts.logText) : undefined;

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
    ...(logSignals ? { logSignals } : {}),
    nextActions: buildNextActions(patterns, failures.length, opts, logSignals),
    artifacts: {
      summary: "summary.json",
      report: "report.md",
      tree: "tree.txt",
      config: "config.json",
      ...(logSignals ? { log: "log.txt" as const } : {}),
    },
  };
}

export function parseExplorerLogSignals(logText: string): ExplorerLogSignals {
  const signals: ExplorerLogSignals = {
    backtrackWarnings: { total: 0, byMethod: {} },
    backtrackSuccesses: { total: 0, byMethod: {} },
    reasonCodes: {},
    deviceConnectivity: {
      usbmuxNotFound: 0,
      coreDeviceProviderMissing: 0,
      connectionRefused: 0,
      ideDisconnected: 0,
      proxyBadGateway: 0,
    },
    examples: [],
  };

  for (const rawLine of logText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.includes("[BACKTRACK-WARN]")) {
      const method = extractLogField(line, "method") ?? "unknown";
      const reason = extractLogField(line, "reason");
      const status = extractLogField(line, "status");
      signals.backtrackWarnings.total += 1;
      increment(signals.backtrackWarnings.byMethod, method);
      if (reason) {
        increment(signals.reasonCodes, reason);
      }
      pushLogExample(signals, { level: "warn", message: line, method, reason, status });
      continue;
    }

    if (line.includes("[BACKTRACK-TRACE]") && isBacktrackSuccessLine(line)) {
      const method = extractLogField(line, "method") ?? "unknown";
      const reason = extractLogField(line, "reason");
      const status = extractLogField(line, "status");
      signals.backtrackSuccesses.total += 1;
      increment(signals.backtrackSuccesses.byMethod, method);
      if (reason && reason !== "OK") {
        increment(signals.reasonCodes, reason);
      }
      pushLogExample(signals, { level: "success", message: line, method, reason, status });
      continue;
    }

    const deviceSignal = classifyDeviceConnectivityLine(line);
    if (deviceSignal) {
      signals.deviceConnectivity[deviceSignal] += 1;
      pushLogExample(signals, { level: "device", message: line });
    }
  }

  return signals;
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
  if (review.artifacts.log) {
    content += `- [log.txt](./${review.artifacts.log})\n\n`;
  }

  if (review.logSignals) {
    content += "## Log Signals\n\n";
    content += "| Signal | Count |\n";
    content += "|--------|-------|\n";
    content += `| Backtrack warnings | ${review.logSignals.backtrackWarnings.total} |\n`;
    content += `| Backtrack successes | ${review.logSignals.backtrackSuccesses.total} |\n`;
    content += `| Device connectivity signals | ${sumValues(review.logSignals.deviceConnectivity)} |\n\n`;

    content += "| Backtrack Method | Warnings | Successes |\n";
    content += "|------------------|----------|-----------|\n";
    for (const method of uniqueSorted([
      ...Object.keys(review.logSignals.backtrackWarnings.byMethod),
      ...Object.keys(review.logSignals.backtrackSuccesses.byMethod),
    ])) {
      content += `| ${escapeMarkdown(method)} | ${review.logSignals.backtrackWarnings.byMethod[method] ?? 0} | ${review.logSignals.backtrackSuccesses.byMethod[method] ?? 0} |\n`;
    }
    content += "\n";
  }

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

  const examplesWithVisualEvidence = review.failedElements.filter((example) => example.visualEvidence);
  if (examplesWithVisualEvidence.length > 0) {
    content += "## Visual Evidence\n\n";
    content += "| Page | Element | Status | Screenshot | Element Crop | Bounds | Baseline |\n";
    content += "|------|---------|--------|------------|--------------|--------|----------|\n";
    for (const example of examplesWithVisualEvidence) {
      const evidence = example.visualEvidence;
      if (!evidence) {
        continue;
      }
      const page = example.screenTitle ?? example.pageScreenId;
      const screenshot = evidence.screenshotPath
        ? `[screenshot](${escapeMarkdownLink(evidence.screenshotPath)})`
        : "";
      const crop = evidence.elementCropPath
        ? `[crop](${escapeMarkdownLink(evidence.elementCropPath)})`
        : "";
      const bounds = evidence.bounds
        ? `${evidence.bounds.x},${evidence.bounds.y} ${evidence.bounds.width}x${evidence.bounds.height}`
        : evidence.reason ?? "";
      content += `| ${escapeMarkdown(page)} | ${escapeMarkdown(example.elementLabel)} | ${evidence.status} | ${screenshot} | ${crop} | ${escapeMarkdown(bounds)} | ${evidence.baselineStatus} |\n`;
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
  opts?: {
    runDir?: string;
    index: number;
  },
): FailureReviewExample {
  const visualEvidence =
    opts?.runDir && page
      ? buildFailureVisualEvidence(failure, page, opts.runDir, opts.index)
      : undefined;
  return {
    pageScreenId: failure.pageScreenId,
    screenTitle: page?.screenTitle,
    elementLabel: failure.elementLabel,
    failureType: failure.failureType,
    retryCount: failure.retryCount,
    errorMessage: failure.errorMessage,
    depth: failure.depth,
    path: failure.path,
    ...(visualEvidence ? { visualEvidence } : {}),
  };
}

function buildFailureVisualEvidence(
  failure: FailureEntry,
  page: PageEntry,
  runDir: string,
  index: number,
): FailureVisualEvidence | undefined {
  const screenshotPath = page.snapshot?.screenshotPath;
  if (!screenshotPath) {
    return {
      status: "missing_screenshot",
      baselineStatus: "not_configured",
      reason: "page snapshot did not include screenshotPath",
    };
  }

  const screenshotAbsolutePath = path.isAbsolute(screenshotPath)
    ? screenshotPath
    : path.resolve(screenshotPath);
  if (!existsSync(screenshotAbsolutePath)) {
    return {
      status: "missing_screenshot",
      screenshotPath,
      baselineStatus: "not_configured",
      reason: "screenshot file was not found when generating the report",
    };
  }

  const bounds = findFailureElementBounds(page, failure.elementLabel);
  if (!bounds) {
    return {
      status: "missing_bounds",
      screenshotPath: toRunRelativeLink(runDir, screenshotAbsolutePath),
      baselineStatus: "not_configured",
      reason: "failed element bounds were not present in the captured UI tree",
    };
  }

  const dimensions = readImageDimensions(screenshotAbsolutePath);
  const clampedBounds = dimensions
    ? clampBounds(bounds, dimensions.width, dimensions.height)
    : bounds;
  if (clampedBounds.width <= 0 || clampedBounds.height <= 0) {
    return {
      status: "missing_bounds",
      screenshotPath: toRunRelativeLink(runDir, screenshotAbsolutePath),
      baselineStatus: "not_configured",
      reason: "failed element bounds were outside the screenshot viewport",
    };
  }

  const evidenceDir = path.join(runDir, "visual-evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const cropFileName = `${String(index + 1).padStart(3, "0")}-${slugify(failure.elementLabel)}.svg`;
  const cropAbsolutePath = path.join(evidenceDir, cropFileName);
  const imageHref = toRelativeHref(evidenceDir, screenshotAbsolutePath);
  const svg = buildCropSvg(imageHref, clampedBounds, dimensions);
  writeFileSync(cropAbsolutePath, svg, "utf-8");

  return {
    status: "captured",
    screenshotPath: toRunRelativeLink(runDir, screenshotAbsolutePath),
    elementCropPath: toRunRelativeLink(runDir, cropAbsolutePath),
    bounds: {
      x: clampedBounds.x,
      y: clampedBounds.y,
      width: clampedBounds.width,
      height: clampedBounds.height,
    },
    baselineStatus: "not_configured",
  };
}

function findFailureElementBounds(
  page: PageEntry,
  elementLabel: string,
): FailureVisualEvidence["bounds"] | undefined {
  const expected = normalizeLabel(elementLabel);
  const nodes = flattenUiTree(page.snapshot?.uiTree);
  const scored = nodes
    .map((node) => {
      const labels = [
        node.label,
        node.text,
        node.contentDesc,
        node.accessibilityLabel,
        node.resourceId,
      ].filter((value): value is string => typeof value === "string" && value.length > 0);
      const score = labels.reduce((best, label) => Math.max(best, scoreLabel(expected, label)), 0);
      return { node, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const candidate of scored) {
    const bounds = extractNodeBounds(candidate.node);
    if (bounds) {
      return bounds;
    }
  }
  return undefined;
}

function flattenUiTree(root: UiHierarchy | undefined): UiHierarchy[] {
  if (!root || typeof root !== "object") {
    return [];
  }
  const nodes: UiHierarchy[] = [root];
  const children = Array.isArray(root.children)
    ? root.children
    : [];
  for (const child of children) {
    nodes.push(...flattenUiTree(child));
  }
  return nodes;
}

function scoreLabel(expected: string, rawLabel: string): number {
  const label = normalizeLabel(rawLabel);
  if (!expected || !label) {
    return 0;
  }
  if (label === expected) {
    return 100;
  }
  if (label.includes(expected) || expected.includes(label)) {
    return 50;
  }
  return 0;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractNodeBounds(node: Record<string, unknown>): FailureVisualEvidence["bounds"] | undefined {
  const frame = node.frame;
  if (frame && typeof frame === "object") {
    const value = frame as Record<string, unknown>;
    if (
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      typeof value.width === "number" &&
      typeof value.height === "number"
    ) {
      return {
        x: Math.round(value.x),
        y: Math.round(value.y),
        width: Math.round(value.width),
        height: Math.round(value.height),
      };
    }
  }

  if (typeof node.bounds === "string") {
    const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(node.bounds);
    if (match) {
      const left = Number(match[1]);
      const top = Number(match[2]);
      const right = Number(match[3]);
      const bottom = Number(match[4]);
      return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    }
  }

  return undefined;
}

function clampBounds(
  bounds: NonNullable<FailureVisualEvidence["bounds"]>,
  imageWidth: number,
  imageHeight: number,
): NonNullable<FailureVisualEvidence["bounds"]> {
  const x = Math.max(0, Math.min(bounds.x, imageWidth));
  const y = Math.max(0, Math.min(bounds.y, imageHeight));
  const right = Math.max(x, Math.min(bounds.x + bounds.width, imageWidth));
  const bottom = Math.max(y, Math.min(bounds.y + bounds.height, imageHeight));
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function readImageDimensions(filePath: string): { width: number; height: number } | undefined {
  const buffer = readFileSync(filePath);
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer.toString("ascii", 1, 4) === "PNG"
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  return undefined;
}

function buildCropSvg(
  imageHref: string,
  bounds: NonNullable<FailureVisualEvidence["bounds"]>,
  dimensions?: { width: number; height: number },
): string {
  const imageWidth = dimensions?.width ?? bounds.x + bounds.width;
  const imageHeight = dimensions?.height ?? bounds.y + bounds.height;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">`,
    `  <image href="${escapeXml(imageHref)}" x="${-bounds.x}" y="${-bounds.y}" width="${imageWidth}" height="${imageHeight}" />`,
    "</svg>",
    "",
  ].join("\n");
}

function toRelativeHref(fromDir: string, targetPath: string): string {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
}

function toRunRelativeLink(runDir: string, targetPath: string): string {
  return path.relative(runDir, targetPath).split(path.sep).join("/");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "element";
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
  logSignals?: ExplorerLogSignals,
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
  if (logSignals && logSignals.backtrackWarnings.total > 0) {
    actions.push(
      "Use the Log Signals section to separate selector-back failures from successful fallback recovery before changing traversal rules.",
    );
  }
  if ((logSignals?.backtrackSuccesses.byMethod.tap_point_band_back ?? 0) > 0) {
    actions.push(
      "tap_point_band_back recovered at least one backtrack; prioritize selector/back-affordance diagnostics before changing the coordinate fallback.",
    );
  }
  if ((logSignals?.reasonCodes.NO_MATCH ?? 0) > 0 || (logSignals?.reasonCodes.AMBIGUOUS_MATCH ?? 0) > 0) {
    actions.push(
      "Back selector resolution produced NO_MATCH or AMBIGUOUS_MATCH; inspect the captured UI tree for stable iOS back-button identifiers.",
    );
  }
  if (logSignals && sumValues(logSignals.deviceConnectivity) > 0) {
    actions.push(
      "Device connectivity signals were found in log.txt; verify usbmux/libimobiledevice/CoreDevice readiness before treating this as an Explorer traversal failure.",
    );
  }

  return actions;
}

function extractLogField(line: string, field: string): string | undefined {
  const match = new RegExp(`\\b${field}=([^,\\s]+)`).exec(line);
  return match?.[1]?.replace(/^"|"$/g, "");
}

function isBacktrackSuccessLine(line: string): boolean {
  return /\bstatus=success\b/.test(line) || line.includes("=> success");
}

function classifyDeviceConnectivityLine(
  line: string,
): keyof ExplorerLogSignals["deviceConnectivity"] | undefined {
  const normalized = line.toLowerCase();
  if (normalized.includes("no connected/matching device found")) {
    return "usbmuxNotFound";
  }
  if (normalized.includes("coredeviceerror") && normalized.includes("no provider was found")) {
    return "coreDeviceProviderMissing";
  }
  if (normalized.includes("connection refused") || normalized.includes("failed to connect")) {
    return "connectionRefused";
  }
  if (normalized.includes("exiting due to ide disconnection")) {
    return "ideDisconnected";
  }
  if (normalized.includes("502 bad gateway")) {
    return "proxyBadGateway";
  }
  return undefined;
}

function pushLogExample(
  signals: ExplorerLogSignals,
  example: ExplorerLogSignalExample,
): void {
  if (signals.examples.length < MAX_LOG_EXAMPLES) {
    signals.examples.push(example);
  }
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
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

function escapeMarkdownLink(text: string): string {
  return text.replace(/\)/g, "%29").replace(/\(/g, "%28");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
