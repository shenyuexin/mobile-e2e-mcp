/**
 * Deterministic Maestro-compatible smoke flow exporter.
 *
 * Turns discovered Explorer navigation paths into reviewable YAML flows. Only
 * reachable, non-failed, non-blocked paths are exported. Every UI-affecting
 * step is followed by an explicit settle delay per
 * `docs/guides/ui-stabilization-timing.md`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunSummary } from './summary.js';

/** Minimum structural shape of a page needed for export. */
export interface FlowExportPage {
  id: string;
  screenTitle?: string;
  viaElement?: string | null;
  path: string[];
  hasFailure?: boolean;
  stoppedByPolicy?: string;
  explorationStatus?: string;
  ruleDecision?: { action?: string } | null;
}

/** Options controlling deterministic flow export. */
export interface FlowExportOptions {
  /** Number of top paths to export (default: 3). */
  maxFlows?: number;
  /** Maximum tap steps per exported flow (default: 8). */
  maxSteps?: number;
  /** Settle delay after a tap in ms (default: 1500). */
  tapSettleMs?: number;
  /** Settle delay after launch in ms (default: 3000). */
  launchSettleMs?: number;
}

/** One generated flow, including the exact YAML written to disk. */
export interface ExportedFlow {
  fileName: string;
  filePath: string;
  appId: string;
  yaml: string;
  pathIds: string[];
  steps: string[];
}

export const DEFAULT_TAP_SETTLE_MS = 1500;
export const DEFAULT_LAUNCH_SETTLE_MS = 3000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A page is exportable when it neither failed nor was blocked by policy/rules. */
export function isExportablePage(page: FlowExportPage): boolean {
  if (page.hasFailure === true || page.stoppedByPolicy) return false;
  const ruleAction = asRecord(page.ruleDecision)?.action;
  if (typeof ruleAction === 'string' && /^(skip|block|deny)$/i.test(ruleAction)) return false;
  return true;
}

function labelFor(page: FlowExportPage): string {
  return (
    page.viaElement?.trim() ||
    page.screenTitle?.trim() ||
    page.id
  );
}

/** Select the deepest reachable, non-failed, non-blocked paths deterministically. */
export function selectExportPaths(
  pages: readonly FlowExportPage[],
  options: FlowExportOptions = {},
): FlowExportPage[][] {
  const maxFlows = Math.max(1, options.maxFlows ?? 3);
  const byId = new Map(pages.map((page) => [page.id, page]));
  const candidates = pages
    .filter((page) => page.path.length > 0 && isExportablePage(page))
    .sort((a, b) => b.path.length - a.path.length || a.id.localeCompare(b.id));

  const selected: FlowExportPage[][] = [];
  const seen = new Set<string>();
  for (const endPage of candidates) {
    const chain: FlowExportPage[] = [];
    for (const id of endPage.path) {
      const page = byId.get(id);
      if (!page || !isExportablePage(page)) break;
      chain.push(page);
    }
    if (chain.length === 0) continue;
    if (chain[chain.length - 1]?.id !== endPage.id) chain.push(endPage);
    if (!chain.every(isExportablePage)) continue;

    const key = chain.map((page) => page.id).join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(chain);
    if (selected.length >= maxFlows) break;
  }
  return selected;
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'path';
}

/** Render a Maestro-compatible YAML smoke flow for a selected path. */
export function formatFlowYaml(input: {
  appId: string;
  steps: string[];
  tapSettleMs?: number;
  launchSettleMs?: number;
}): string {
  const tapSettle = Math.max(0, input.tapSettleMs ?? DEFAULT_TAP_SETTLE_MS);
  const launchSettle = Math.max(0, input.launchSettleMs ?? DEFAULT_LAUNCH_SETTLE_MS);
  const lines = [
    `appId: ${yamlString(input.appId)}`,
    '---',
    '- launchApp:',
    `    appId: ${yamlString(input.appId)}`,
    '    clearState: false',
    '- waitForAnimationToEnd:',
    `    timeout: ${launchSettle}`,
    `  # launch settle ${launchSettle}ms (ui-stabilization-timing.md)`,
  ];
  for (const step of input.steps) {
    lines.push(
      `- tapOn: ${yamlString(step)}`,
      '- waitForAnimationToEnd:',
      `    timeout: ${tapSettle}`,
      `  # tap settle ${tapSettle}ms before the next UI action`,
    );
  }
  const lastStep = input.steps.at(-1);
  if (lastStep) lines.push(`- assertVisible: ${yamlString(lastStep)}`);
  return `${lines.join('\n')}\n`;
}

/** Build flow objects (without writing files) from discovered pages. */
export function buildFlows(
  pages: readonly FlowExportPage[],
  appId: string,
  options: FlowExportOptions = {},
): Array<Omit<ExportedFlow, 'filePath'>> {
  const maxSteps = Math.max(1, options.maxSteps ?? 8);
  return selectExportPaths(pages, options).map((chain, index) => {
    const steps = chain.slice(1).map(labelFor).slice(0, maxSteps);
    const fileName = `smoke-${String(index + 1).padStart(2, '0')}-${slugify(steps.at(-1) ?? chain[0]?.id ?? 'path')}.yaml`;
    return {
      fileName,
      appId,
      yaml: formatFlowYaml({
        appId,
        steps,
        tapSettleMs: options.tapSettleMs,
        launchSettleMs: options.launchSettleMs,
      }),
      pathIds: chain.map((page) => page.id),
      steps,
    };
  });
}

/** Write deterministic smoke flows to a directory and return their metadata. */
export function exportFlows(
  pages: readonly FlowExportPage[],
  appId: string,
  outputDir: string,
  options: FlowExportOptions = {},
): ExportedFlow[] {
  mkdirSync(outputDir, { recursive: true });
  return buildFlows(pages, appId, options).map((flow) => {
    const filePath = join(outputDir, flow.fileName);
    writeFileSync(filePath, flow.yaml, 'utf-8');
    return { ...flow, filePath };
  });
}

/** Convenience overload that reads pages from a written summary.json model. */
export function exportFlowsFromSummary(
  summary: RunSummary,
  appId: string,
  outputDir: string,
  options: FlowExportOptions = {},
): ExportedFlow[] {
  return exportFlows(summary.pages, appId, outputDir, options);
}
