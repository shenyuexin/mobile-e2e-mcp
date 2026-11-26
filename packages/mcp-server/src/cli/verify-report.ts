import { escapeHtml } from "@mobile-e2e-mcp/explorer";
import type { Platform } from "@mobile-e2e-mcp/contracts";
import type { SelectorHealProposal } from "./selector-heal.js";
import type { VerifyMatrixSummary, VerifyMatrixTargetSummary } from "./verify-matrix.js";
import type { VerifyProbesSummary } from "./verify-probes.js";

export interface VerifyFlowEntry {
  flowPath: string;
  status: "passed" | "failed";
  reasonCode: string;
  durationMs: number;
  sessionId?: string;
  recordingPath?: string | null;
  recordingDiscarded?: boolean;
  healProposal?: SelectorHealProposal;
  nextSuggestions: string[];
}

export interface VerifyAuditSummary {
  enabled: boolean;
  status: "passed" | "failed" | "skipped";
  reasonCode?: string;
  surfaceName?: string;
  totalNodes?: number;
  totalIssues?: number;
  regressionDetected?: boolean;
  outputPath?: string;
  nextSuggestions: string[];
}

export interface VerifyExplorerSummary {
  enabled: boolean;
  status: "passed" | "failed" | "skipped_dry_run" | "skipped";
  runId?: string;
  visitedPages?: number;
  failedCount?: number;
  durationMs?: number;
  htmlReportRelPath?: string;
  summaryJsonRelPath?: string;
  error?: string;
}

export interface VerifySuiteSummary {
  schemaVersion: "e2e-verify-summary/v1";
  runId: string;
  overallStatus: "passed" | "failed";
  dryRun: boolean;
  platform: Platform;
  appId?: string;
  deviceId?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  outputDir: string;
  flows: {
    enabled: boolean;
    total: number;
    passed: number;
    failed: number;
    entries: VerifyFlowEntry[];
  };
  audit: VerifyAuditSummary;
  explorer: VerifyExplorerSummary;
  probes?: VerifyProbesSummary;
  matrix?: VerifyMatrixSummary;
  artifacts: {
    summaryJsonPath: string;
    reportMdPath: string;
    reportHtmlPath: string;
    auditJsonPath?: string;
    explorerHtmlReportPath?: string;
    failurePacketPath?: string;
  };
  nextSuggestions: string[];
}

export interface VerifyFailurePacket {
  schemaVersion: "e2e-failure-packet/v1";
  runId: string;
  generatedAt: string;
  platform: Platform;
  appId?: string;
  deviceId?: string;
  failedStages: string[];
  failedFlows: Array<{
    flowPath: string;
    reasonCode: string;
    sessionId?: string;
    recordingPath?: string | null;
    healProposalDiff?: string;
    nextSuggestions: string[];
  }>;
  auditFailure?: {
    reasonCode?: string;
    surfaceName?: string;
    totalIssues?: number;
    regressionDetected?: boolean;
    outputPath?: string;
    nextSuggestions: string[];
  };
  explorerFailure?: {
    runId?: string;
    failedCount?: number;
    htmlReportRelPath?: string;
    summaryJsonRelPath?: string;
    error?: string;
  };
  failedProbes: Array<{
    name: string;
    url: string;
    httpStatus?: number;
    rawJsonRelPath?: string;
    failures: string[];
  }>;
  failedTargets: VerifyMatrixTargetSummary[];
  recommendedRerunCommand: string;
  nextSuggestions: string[];
}

export function buildVerifyFailurePacket(
  summary: VerifySuiteSummary,
  options: { rerunCommand?: string } = {},
): VerifyFailurePacket {
  const failedStages: string[] = [];
  const failedFlows = summary.flows.entries
    .filter((entry) => entry.status === "failed")
    .map((entry) => ({
      flowPath: entry.flowPath,
      reasonCode: entry.reasonCode,
      ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
      ...(entry.recordingPath && !entry.recordingDiscarded ? { recordingPath: entry.recordingPath } : {}),
      ...(entry.healProposal?.unifiedDiff ? { healProposalDiff: entry.healProposal.unifiedDiff } : {}),
      nextSuggestions: entry.nextSuggestions,
    }));
  if (failedFlows.length > 0) failedStages.push("flows");

  const auditFailure =
    summary.audit.enabled && summary.audit.status === "failed"
      ? {
          ...(summary.audit.reasonCode ? { reasonCode: summary.audit.reasonCode } : {}),
          ...(summary.audit.surfaceName ? { surfaceName: summary.audit.surfaceName } : {}),
          ...(summary.audit.totalIssues !== undefined ? { totalIssues: summary.audit.totalIssues } : {}),
          ...(summary.audit.regressionDetected !== undefined
            ? { regressionDetected: summary.audit.regressionDetected }
            : {}),
          ...(summary.audit.outputPath ? { outputPath: summary.audit.outputPath } : {}),
          nextSuggestions: summary.audit.nextSuggestions,
        }
      : undefined;
  if (auditFailure) failedStages.push("audit");

  const explorerFailure =
    summary.explorer.enabled && summary.explorer.status === "failed"
      ? {
          ...(summary.explorer.runId ? { runId: summary.explorer.runId } : {}),
          ...(summary.explorer.failedCount !== undefined ? { failedCount: summary.explorer.failedCount } : {}),
          ...(summary.explorer.htmlReportRelPath ? { htmlReportRelPath: summary.explorer.htmlReportRelPath } : {}),
          ...(summary.explorer.summaryJsonRelPath ? { summaryJsonRelPath: summary.explorer.summaryJsonRelPath } : {}),
          ...(summary.explorer.error ? { error: summary.explorer.error } : {}),
        }
      : undefined;
  if (explorerFailure) failedStages.push("explorer");

  const failedProbes = (summary.probes?.entries ?? [])
    .filter((entry) => entry.status === "failed")
    .map((entry) => ({
      name: entry.name,
      url: entry.url,
      ...(entry.httpStatus !== undefined ? { httpStatus: entry.httpStatus } : {}),
      ...(entry.rawJsonRelPath ? { rawJsonRelPath: entry.rawJsonRelPath } : {}),
      failures: entry.failures,
    }));
  if (failedProbes.length > 0) failedStages.push("probes");

  const failedTargets = (summary.matrix?.targets ?? []).filter((t) => t.overallStatus === "failed");
  if (failedTargets.length > 0) failedStages.push("matrix");

  const defaultRerunParts = ["mobile-e2e-mcp verify", "--platform", summary.platform];
  if (summary.appId) defaultRerunParts.push("--app-id", summary.appId);
  if (summary.deviceId) defaultRerunParts.push("--device-id", summary.deviceId);
  if (failedFlows.length > 0) {
    defaultRerunParts.push("--flows", failedFlows[0]!.flowPath);
  }

  return {
    schemaVersion: "e2e-failure-packet/v1",
    runId: summary.runId,
    generatedAt: summary.completedAt,
    platform: summary.platform,
    ...(summary.appId ? { appId: summary.appId } : {}),
    ...(summary.deviceId ? { deviceId: summary.deviceId } : {}),
    failedStages,
    failedFlows,
    ...(auditFailure ? { auditFailure } : {}),
    ...(explorerFailure ? { explorerFailure } : {}),
    failedProbes,
    failedTargets,
    recommendedRerunCommand: options.rerunCommand ?? defaultRerunParts.join(" "),
    nextSuggestions: summary.nextSuggestions,
  };
}

export function formatVerifyMarkdown(summary: VerifySuiteSummary): string {
  const lines: string[] = [
    `# Mobile E2E Verification Report — ${summary.runId}`,
    "",
    `- **Overall Status**: ${summary.overallStatus.toUpperCase()}${summary.dryRun ? " (dry-run)" : ""}`,
    `- **Platform**: ${summary.platform}`,
    `- **App ID**: ${summary.appId ?? "—"}`,
    `- **Device**: ${summary.deviceId ?? "—"}`,
    `- **Duration**: ${(summary.durationMs / 1000).toFixed(2)}s`,
    "",
    "## 1. Deterministic Flows",
    "",
  ];

  if (!summary.flows.enabled) {
    lines.push("_No deterministic flows configured or passed._", "");
  } else {
    lines.push(
      `Passed **${summary.flows.passed}/${summary.flows.total}** flow(s).`,
      "",
      "| Flow | Status | Reason | Duration | Video |",
      "|---|---|---|---|---|",
    );
    for (const entry of summary.flows.entries) {
      const videoCell = entry.recordingPath && !entry.recordingDiscarded ? `\`${entry.recordingPath}\`` : "—";
      lines.push(
        `| \`${entry.flowPath}\` | ${entry.status} | \`${entry.reasonCode}\` | ${entry.durationMs}ms | ${videoCell} |`,
      );
    }
    lines.push("");
    for (const entry of summary.flows.entries) {
      if (entry.healProposal) {
        lines.push(`### Selector Heal Proposal — \`${entry.flowPath}\``, "", "```diff", entry.healProposal.unifiedDiff, "```", "");
      }
    }
  }

  lines.push("## 2. UI Surface Audit", "");
  if (!summary.audit.enabled) {
    lines.push("_UI Surface Audit disabled._", "");
  } else {
    lines.push(
      `- **Status**: ${summary.audit.status}${summary.audit.reasonCode ? ` (\`${summary.audit.reasonCode}\`)` : ""}`,
      `- **Surface**: ${summary.audit.surfaceName ?? "—"}`,
      `- **Nodes / Issues**: ${summary.audit.totalNodes ?? 0} / ${summary.audit.totalIssues ?? 0}`,
      `- **Regression Detected**: ${summary.audit.regressionDetected ? "YES" : "no"}`,
      "",
    );
  }

  lines.push("## 3. Bounded Explorer", "");
  if (!summary.explorer.enabled) {
    lines.push("_Bounded Explorer disabled._", "");
  } else if (summary.explorer.status === "skipped_dry_run") {
    lines.push("_Skipped under `--dry-run` (Explorer requires a live simulator/device session)._", "");
  } else {
    lines.push(
      `- **Status**: ${summary.explorer.status}`,
      `- **Visited Pages**: ${summary.explorer.visitedPages ?? 0}`,
      `- **Failures**: ${summary.explorer.failedCount ?? 0}`,
      `- **HTML Report**: ${summary.explorer.htmlReportRelPath ? `[\`${summary.explorer.htmlReportRelPath}\`](${summary.explorer.htmlReportRelPath})` : "—"}`,
      ...(summary.explorer.error ? [`- **Error**: ${summary.explorer.error}`] : []),
      "",
    );
  }

  if (summary.probes?.enabled) {
    lines.push("## 4. Custom Probes & Performance Ratchets", "");
    lines.push(`Passed **${summary.probes.passed}/${summary.probes.total}** probe(s) (status: \`${summary.probes.status}\`).`, "");
    lines.push("| Probe | Status | HTTP | Duration | Details |", "|---|---|---|---|---|");
    for (const entry of summary.probes.entries) {
      const detail = entry.failures.length > 0 ? entry.failures.join("; ") : Object.entries(entry.metrics).map(([k, v]) => `${k}=${String(v)}`).join(", ") || "ok";
      lines.push(`| \`${entry.name}\` | ${entry.status} | ${entry.httpStatus ?? "—"} | ${entry.durationMs}ms | ${detail} |`);
    }
    lines.push("");
  }

  if (summary.matrix?.enabled) {
    lines.push("## 5. Device Matrix", "");
    lines.push(`Passed **${summary.matrix.passed}/${summary.matrix.total}** target(s).`, "");
    lines.push("| Target | Platform | Status | Flows | Audit | Probes | Explorer | Report |", "|---|---|---|---|---|---|---|---|");
    for (const target of summary.matrix.targets) {
      lines.push(
        `| \`${target.label}\` | ${target.platform} | ${target.overallStatus} | ${target.flowsPassed}/${target.flowsTotal} | ${target.auditStatus} | ${target.probeStatus} | ${target.explorerStatus} | [\`${target.reportHtmlRelPath}\`](${target.reportHtmlRelPath}) |`,
      );
    }
    lines.push("");
  }

  if (summary.artifacts.failurePacketPath) {
    lines.push("## Failure Packet", "", `- JSON diagnostics: \`${summary.artifacts.failurePacketPath}\``, "");
  }

  if (summary.nextSuggestions.length > 0) {
    lines.push("## Next Actions", "");
    for (const item of summary.nextSuggestions) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatVerifyHtml(summary: VerifySuiteSummary): string {
  const gateClass = summary.overallStatus === "passed" ? "pass" : "fail";
  const flowRows = summary.flows.entries.length === 0
    ? '<tr><td colspan="5" class="muted">No flows executed.</td></tr>'
    : summary.flows.entries
        .map((entry) => {
          const badge = entry.status === "passed" ? "good" : "warn";
          const video = entry.recordingPath && !entry.recordingDiscarded
            ? `<a href="${escapeHtml(entry.recordingPath)}">${escapeHtml(entry.recordingPath)}</a>`
            : "—";
          return `<tr><td><code>${escapeHtml(entry.flowPath)}</code></td><td class="${badge}">${escapeHtml(entry.status)}</td><td><code>${escapeHtml(entry.reasonCode)}</code></td><td>${entry.durationMs}ms</td><td>${video}</td></tr>`;
        })
        .join("");

  const healBlocks = summary.flows.entries
    .filter((entry) => Boolean(entry.healProposal))
    .map(
      (entry) =>
        `<details open><summary>Proposal-only heal diff: <code>${escapeHtml(entry.flowPath)}</code></summary><pre>${escapeHtml(entry.healProposal?.unifiedDiff ?? "")}</pre></details>`,
    )
    .join("");

  const explorerLink = summary.explorer.htmlReportRelPath
    ? `<a href="${escapeHtml(summary.explorer.htmlReportRelPath)}">${escapeHtml(summary.explorer.htmlReportRelPath)}</a>`
    : "—";

  const probesSection = summary.probes?.enabled
    ? `<section><h2>Custom Probes &amp; Performance Ratchets</h2><p>Status: <strong>${escapeHtml(summary.probes.status)}</strong> (${summary.probes.passed}/${summary.probes.total} passed)</p><table><thead><tr><th>Probe</th><th>Status</th><th>HTTP</th><th>Duration</th><th>Details</th></tr></thead><tbody>${summary.probes.entries
        .map((entry) => {
          const badge = entry.status === "passed" ? "good" : entry.status === "skipped_dry_run" ? "muted" : "warn";
          const details =
            entry.failures.length > 0
              ? entry.failures.join("; ")
              : Object.entries(entry.metrics)
                  .map(([k, v]) => `${k}=${String(v)}`)
                  .join(", ") || "ok";
          return `<tr><td><code>${escapeHtml(entry.name)}</code></td><td class="${badge}">${escapeHtml(entry.status)}</td><td>${entry.httpStatus ?? "—"}</td><td>${entry.durationMs}ms</td><td>${escapeHtml(details)}</td></tr>`;
        })
        .join("")}</tbody></table></section>`
    : "";

  const matrixSection = summary.matrix?.enabled
    ? `<section><h2>Device Matrix</h2><p>Targets passed: <strong>${summary.matrix.passed}/${summary.matrix.total}</strong></p><table><thead><tr><th>Target</th><th>Platform</th><th>Status</th><th>Flows</th><th>Audit</th><th>Probes</th><th>Explorer</th><th>Report</th></tr></thead><tbody>${summary.matrix.targets
        .map((t) => {
          const badge = t.overallStatus === "passed" ? "good" : "warn";
          return `<tr><td><code>${escapeHtml(t.label)}</code></td><td>${escapeHtml(t.platform)}</td><td class="${badge}">${escapeHtml(t.overallStatus)}</td><td>${t.flowsPassed}/${t.flowsTotal}</td><td>${escapeHtml(t.auditStatus)}</td><td>${escapeHtml(t.probeStatus)}</td><td>${escapeHtml(t.explorerStatus)}</td><td><a href="${escapeHtml(t.reportHtmlRelPath)}">${escapeHtml(t.reportHtmlRelPath)}</a></td></tr>`;
        })
        .join("")}</tbody></table></section>`
    : "";

  const failurePacketNotice = summary.artifacts.failurePacketPath
    ? `<p>Failure diagnostics packet: <code>${escapeHtml(summary.artifacts.failurePacketPath)}</code></p>`
    : "";

  const suggestionsList = summary.nextSuggestions.length === 0
    ? '<p class="muted">No follow-up actions required.</p>'
    : `<ul>${summary.nextSuggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Mobile E2E Verify — ${escapeHtml(summary.runId)}</title>
<style>
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0 auto; padding: 24px; max-width: 1080px; line-height: 1.5; }
h2 { margin-top: 28px; border-bottom: 1px solid #8884; padding-bottom: 6px; }
.muted { color: #888; }
.gate { padding: 10px 14px; border-radius: 8px; margin: 16px 0; font-weight: 600; }
.gate.pass { background: #2e7d3222; color: #2e7d32; }
.gate.fail { background: #d32f2f22; color: #d32f2f; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.kpi { border: 1px solid #8884; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: 0.78em; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 1.45em; font-weight: 700; }
.good { color: #2e7d32; font-weight: 600; }
.warn { color: #d32f2f; font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid #8883; vertical-align: top; }
pre { background: #8881; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; }
</style>
</head>
<body>
  <h1>Mobile E2E Verification Report</h1>
  <div class="muted">Run ID: <code>${escapeHtml(summary.runId)}</code> · Platform: <code>${escapeHtml(summary.platform)}</code> · App: <code>${escapeHtml(summary.appId ?? "—")}</code></div>
  <div class="gate ${gateClass}">OVERALL: ${escapeHtml(summary.overallStatus.toUpperCase())}${summary.dryRun ? " (DRY RUN)" : ""}</div>
  ${failurePacketNotice}
  <div class="kpis">
    <div class="kpi"><span class="kpi-label">Flows Passed</span><span class="kpi-value">${summary.flows.passed}/${summary.flows.total}</span></div>
    <div class="kpi"><span class="kpi-label">UI Audit</span><span class="kpi-value">${escapeHtml(summary.audit.status)}</span></div>
    <div class="kpi"><span class="kpi-label">Explorer</span><span class="kpi-value">${escapeHtml(summary.explorer.status)}</span></div>
    <div class="kpi"><span class="kpi-label">Probes</span><span class="kpi-value">${summary.probes?.enabled ? escapeHtml(summary.probes.status) : "off"}</span></div>
    <div class="kpi"><span class="kpi-label">Duration</span><span class="kpi-value">${(summary.durationMs / 1000).toFixed(1)}s</span></div>
  </div>
  <section>
    <h2>Deterministic Flows</h2>
    <table><thead><tr><th>Flow</th><th>Status</th><th>Reason</th><th>Duration</th><th>Video</th></tr></thead><tbody>${flowRows}</tbody></table>
    ${healBlocks}
  </section>
  <section>
    <h2>UI Surface Audit</h2>
    <p>Status: <strong>${escapeHtml(summary.audit.status)}</strong> · Surface: <code>${escapeHtml(summary.audit.surfaceName ?? "—")}</code> · Nodes: ${summary.audit.totalNodes ?? 0} · Issues: ${summary.audit.totalIssues ?? 0} · Regression: ${summary.audit.regressionDetected ? "YES" : "no"}</p>
  </section>
  <section>
    <h2>Bounded Explorer</h2>
    <p>Status: <strong>${escapeHtml(summary.explorer.status)}</strong> · Pages: ${summary.explorer.visitedPages ?? 0} · Failures: ${summary.explorer.failedCount ?? 0} · HTML Report: ${explorerLink}</p>
  </section>
  ${probesSection}
  ${matrixSection}
  <section>
    <h2>Next Actions</h2>
    ${suggestionsList}
  </section>
</body>
</html>
`;
}
