/**
 * Self-contained, single-file HTML report for an Explorer run comparison.
 *
 * Everything needed to render the report is inlined (CSS + a tiny filter
 * script); there are no external stylesheets, scripts, fonts, or CDN URLs.
 * Local image evidence is embedded as base64 data URIs, and local video files
 * are linked with relative paths, so the report can be attached to a PR or
 * opened from the artifact directory without a web server.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { RunComparison } from './diff-report.js';

/** Options controlling artifact resolution for a generated HTML report. */
export interface HtmlReportOptions {
  /** Run directory used to resolve relative image/video artifact paths. */
  artifactDir?: string;
  /** Intended output path, used to compute relative video links. */
  outputPath?: string;
  /** Report title override. */
  title?: string;
  /** Maximum number of embedded thumbnails (default 12). */
  maxThumbnails?: number;
}

interface Thumbnail {
  label: string;
  dataUri: string;
}

const MAX_THUMBNAIL_BYTES = 512 * 1024;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Escape text for safe interpolation into HTML markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveWithin(root: string | undefined, candidate: string): string | undefined {
  if (!root) return undefined;
  const rootPath = resolve(root);
  const target = resolve(rootPath, candidate);
  if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) return undefined;
  return target;
}

function collectThumbnails(
  comparison: RunComparison,
  options: HtmlReportOptions,
): Thumbnail[] {
  if (!options.artifactDir) return [];
  const limit = options.maxThumbnails ?? 12;
  const thumbnails: Thumbnail[] = [];
  const seen = new Set<string>();

  for (const example of comparison.failureExamples) {
    const candidates = [example.elementCropPath, example.diffPath, example.screenshotPath];
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      const mime = IMAGE_MIME[extname(candidate).toLowerCase()];
      if (!mime) continue;
      const filePath = resolveWithin(options.artifactDir, candidate);
      if (!filePath || !existsSync(filePath)) continue;
      try {
        if (statSync(filePath).size > MAX_THUMBNAIL_BYTES) continue;
        const base64 = readFileSync(filePath).toString('base64');
        thumbnails.push({
          label: `${example.elementLabel || example.pageScreenId}${candidate === example.diffPath ? ' (diff)' : ''}`,
          dataUri: `data:${mime};base64,${base64}`,
        });
      } catch {
        // Unreadable evidence must not break report generation.
      }
      if (thumbnails.length >= limit) return thumbnails;
    }
  }
  return thumbnails;
}

function collectVideoLinks(comparison: RunComparison, options: HtmlReportOptions): string[] {
  if (!options.artifactDir) return [];
  const root = resolve(options.artifactDir);
  const searchDirs = [root, join(root, 'videos'), join(root, 'video')];
  const files: string[] = [];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const name of readdirSync(dir)) {
        if (!VIDEO_EXTENSIONS.has(extname(name).toLowerCase())) continue;
        const fullPath = join(dir, name);
        if (statSync(fullPath).isFile()) files.push(fullPath);
      }
    } catch {
      // Ignore unreadable directories.
    }
  }

  const outputDir = options.outputPath ? dirname(resolve(options.outputPath)) : root;
  return Array.from(new Set(files))
    .sort()
    .slice(0, 20)
    .map((filePath) => {
      const rel = relative(outputDir, filePath).split(sep).map(encodeURIComponent).join('/');
      return rel.startsWith('.') ? rel : `./${rel}`;
    });
}

function renderKpi(label: string, value: string | number, tone: 'good' | 'warn' | 'neutral'): string {
  return `<div class="kpi ${tone}"><span class="kpi-label">${escapeHtml(label)}</span><span class="kpi-value">${escapeHtml(value)}</span></div>`;
}

function renderPageTable(
  title: string,
  rows: Array<{ id: string; from?: string; to?: string }>,
  pageTitles: Record<string, string>,
): string {
  const body = rows.length === 0
    ? '<tr><td colspan="4" class="empty">None</td></tr>'
    : rows
        .slice(0, 200)
        .map(
          (row) =>
            `<tr><td><code>${escapeHtml(row.id)}</code></td><td>${escapeHtml(pageTitles[row.id] ?? '—')}</td><td>${escapeHtml(row.from ?? '—')}</td><td>${escapeHtml(row.to ?? '—')}</td></tr>`,
        )
        .join('');
  return `<section><h2>${escapeHtml(title)} <span class="count">${rows.length}</span></h2><table><thead><tr><th>Page</th><th>Title</th><th>From</th><th>To</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderFailureDetails(comparison: RunComparison, thumbnails: Thumbnail[]): string {
  if (comparison.failureExamples.length === 0 && thumbnails.length === 0) {
    return '<section><h2>Failure details</h2><p class="empty">No failure details recorded for this run.</p></section>';
  }
  const rows = comparison.failureExamples
    .slice(0, 50)
    .map((example) => {
      const path = (example.path ?? []).join(' / ');
      return `<li><strong>${escapeHtml(example.elementLabel || example.pageScreenId)}</strong> <span class="muted">(${escapeHtml(example.failureType)})</span><div class="muted">${escapeHtml(example.errorMessage)}</div><div class="muted">path: ${escapeHtml(path || '—')}</div></li>`;
    })
    .join('');
  const images = thumbnails
    .map(
      (thumb) =>
        `<figure><img src="${escapeHtml(thumb.dataUri)}" alt="${escapeHtml(thumb.label)}" loading="lazy"/><figcaption>${escapeHtml(thumb.label)}</figcaption></figure>`,
    )
    .join('');
  return `<section><h2>Failure details</h2><ul>${rows}</ul><div class="thumbs">${images}</div></section>`;
}

function renderStyle(): string {
  return `
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0 auto; padding: 24px; max-width: 1100px; line-height: 1.5; }
h1 { margin-bottom: 4px; }
h2 { margin-top: 32px; border-bottom: 1px solid #8884; padding-bottom: 6px; }
.count { font-size: 0.7em; color: #888; }
.muted, .empty { color: #888; }
.gate { padding: 10px 14px; border-radius: 8px; margin: 16px 0; font-weight: 600; }
.gate.fail { background: #d32f2f22; color: #d32f2f; }
.gate.pass { background: #2e7d3222; color: #2e7d32; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi { border: 1px solid #8884; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.kpi.warn { border-color: #d32f2f88; }
.kpi.good { border-color: #2e7d3288; }
.kpi-label { font-size: 0.78em; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 1.6em; font-weight: 700; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid #8883; vertical-align: top; }
th { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.03em; }
code { font-size: 0.9em; }
.thumbs { display: flex; flex-wrap: wrap; gap: 12px; }
.thumbs figure { margin: 0; max-width: 260px; }
.thumbs img { max-width: 100%; max-height: 220px; border: 1px solid #8884; border-radius: 6px; }
.thumbs figcaption { font-size: 0.78em; color: #888; word-break: break-word; }
.videos a { color: #1a73e8; }
.toolbar { display: flex; gap: 8px; align-items: center; margin: 16px 0; }
footer { margin-top: 40px; font-size: 0.8em; color: #888; }
`.trim();
}

function renderScript(): string {
  // Plain inline JS: no modules, no network, no external dependencies.
  return `
(function () {
  var input = document.getElementById('page-filter');
  if (!input) return;
  input.addEventListener('input', function () {
    var needle = input.value.toLowerCase();
    var rows = document.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i += 1) {
      rows[i].hidden = needle.length > 0 && rows[i].textContent.toLowerCase().indexOf(needle) === -1;
    }
  });
})();
`.trim();
}

/**
 * Render a complete self-contained HTML document for a run comparison.
 */
export function formatHtmlReport(
  comparison: RunComparison,
  options: HtmlReportOptions = {},
): string {
  const title = options.title ?? `Explorer report — ${comparison.headRunId}`;
  const thumbnails = collectThumbnails(comparison, options);
  const videos = collectVideoLinks(comparison, options);
  const audit = comparison.uiAudit;
  const gateClass = comparison.hasRegressions ? 'fail' : 'pass';
  const gateText = comparison.hasRegressions
    ? 'Regression gate: FAILED — new regressions detected'
    : 'Regression gate: passed — no new regressions detected';

  const addedRows = comparison.newPages.map((id) => ({ id }));
  const removedRows = comparison.removedPages.map((id) => ({ id }));
  const regressedRows = comparison.regressedPages.map((item) => ({
    id: item.pageId,
    from: item.from,
    to: item.to,
  }));
  const patternRows = comparison.failurePatterns.delta.map((item) => ({
    id: item.category,
    from: String(item.base),
    to: `${item.head} (${item.delta > 0 ? '+' : ''}${item.delta})`,
  }));

  const videoHtml = videos.length
    ? `<section class="videos"><h2>Recordings</h2><ul>${videos
        .map((href) => `<li><a href="${escapeHtml(href)}">${escapeHtml(decodeURIComponent(href))}</a></li>`)
        .join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>${renderStyle()}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="muted">Baseline: <code>${escapeHtml(comparison.baseRunId)}</code> · Head: <code>${escapeHtml(comparison.headRunId)}</code></p>
<div class="gate ${gateClass}">${escapeHtml(gateText)}</div>
<div class="kpis">
${renderKpi('Pages added', comparison.summary.totalNew, comparison.summary.totalNew > 0 ? 'neutral' : 'good')}
${renderKpi('Pages removed', comparison.summary.totalRemoved, 'neutral')}
${renderKpi('Regressed pages', comparison.summary.totalRegressedPages, comparison.summary.totalRegressedPages > 0 ? 'warn' : 'good')}
${renderKpi('Failure delta', `${comparison.summary.totalFailureDelta > 0 ? '+' : ''}${comparison.summary.totalFailureDelta}`, comparison.summary.totalFailureDelta > 0 ? 'warn' : 'good')}
${renderKpi('UI audit regressions', audit?.headNewRegressions ?? 0, audit?.hasRegressions ? 'warn' : 'good')}
</div>
<div class="toolbar"><label for="page-filter">Filter tables:</label><input id="page-filter" type="search" placeholder="page id or title"/></div>
${renderPageTable('Added pages', addedRows, comparison.pageTitles)}
${renderPageTable('Removed pages', removedRows, comparison.pageTitles)}
${renderPageTable('Regressed pages', regressedRows, comparison.pageTitles)}
${renderPageTable('Failure pattern delta', patternRows, comparison.pageTitles)}
${audit ? `<section><h2>UI audit delta</h2><p>Surface: ${escapeHtml(audit.surfaceName ?? '—')} · baseline regressions ${audit.baseNewRegressions} → head regressions ${audit.headNewRegressions} · new issues ${audit.headNewIssueCount}</p><p class="muted">Baseline: ${escapeHtml(audit.baselinePath ?? '—')}</p></section>` : ''}
${renderFailureDetails(comparison, thumbnails)}
${videoHtml}
<footer>Generated by @mobile-e2e-mcp/explorer · single-file report (no external assets)</footer>
<script>${renderScript()}</script>
</body>
</html>
`;
}

/**
 * Generate the self-contained HTML document. Alias of `formatHtmlReport`,
 * retained as the canonical API name used by callers and the diff CLI.
 */
export function generateHtmlReport(
  comparison: RunComparison,
  options: HtmlReportOptions = {},
): string {
  return formatHtmlReport(comparison, options);
}
