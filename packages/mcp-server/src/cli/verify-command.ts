import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import path, { resolve } from "node:path";
import {
  TOOL_NAMES,
  type AuditUiSurfaceData,
  type AuditUiSurfaceInput,
  type Platform,
  type RunnerProfile,
  type StartSessionInput,
  type ToolResult,
  type UiAuditBaselineMode,
} from "@mobile-e2e-mcp/contracts";
import type { ExplorerResult, InvokableServer, RunnerInput } from "@mobile-e2e-mcp/explorer";
import type { MobileE2EMcpServer } from "../server.js";
import { hasUiAuditRegression } from "./audit-command.js";
import { requireCliFlagValue } from "./cli-args.js";
import { loadProjectConfig } from "./project-config.js";
import { discoverFlowFiles, executeSingleFlow } from "./run-command.js";
import {
  formatVerifyHtml,
  formatVerifyMarkdown,
  type VerifyAuditSummary,
  type VerifyExplorerSummary,
  type VerifyFlowEntry,
  type VerifySuiteSummary,
} from "./verify-report.js";

export interface VerifyCommandOptions {
  configPath?: string;
  platform?: Platform;
  deviceId?: string;
  appId?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  harnessConfigPath?: string;
  flows: string[];
  audit?: boolean;
  explore?: boolean;
  exploreTimeoutMs?: number;
  baselinePath?: string;
  baselineMode?: UiAuditBaselineMode;
  recordOnFailure?: boolean;
  suggestHeal?: boolean;
  failFast: boolean;
  failOnRegression: boolean;
  output?: string;
  dryRun: boolean;
  json: boolean;
  help: boolean;
  error?: string;
}

export interface VerifyCommandDependencies {
  runExplore: (server: InvokableServer, input: RunnerInput) => Promise<ExplorerResult>;
}

const VALID_RUNNER_PROFILES: readonly RunnerProfile[] = [
  "phase1",
  "native_android",
  "native_ios",
  "flutter_android",
];

function printVerifyHelp(): void {
  console.log(`Usage: mobile-e2e-mcp verify [options]

Run an end-to-end project acceptance suite:
  1. Deterministic Maestro flows (files or directories)
  2. Governed UI surface & accessibility audit
  3. Bounded Explorer traversal (skipped under --dry-run)
  4. Unified summary.json, report.md, and self-contained report.html

Reads defaults from .e2e/config.yaml (verify, audit, explorer sections).

Options:
  --config <path>               Project config path (default: .e2e/config.yaml)
  --platform <ios|android>      Target platform override
  --device-id <id>              Target device or simulator UDID
  --app-id <id>                 Target app bundle ID / package name
  --runner-profile <profile>    phase1 | native_android | native_ios | flutter_android
  --policy-profile <profile>    Policy profile override
  --flows <path>                Flow YAML file or directory (repeatable)
  --audit / --no-audit          Enable or disable audit_ui_surface stage
  --explore / --no-explore      Enable or disable bounded Explorer stage
  --explore-timeout-ms <ms>     Explorer timeout override in ms (>= 1000)
  --baseline-path <path>        UI audit baseline JSON path override
  --baseline-mode <compare|update>  UI audit baseline mode override
  --record-on-failure           Record failure-only video per flow (default from config)
  --no-record-on-failure        Disable per-flow video recording
  --suggest-heal                Emit proposal-only heal diffs when a flow fails
  --no-suggest-heal             Disable selector heal proposals
  --fail-fast                   Stop remaining flows on first failure
  --fail-on-regression          Fail acceptance if UI audit reports a regression
  --output <dir>                Output directory (default: ./output/e2e-verify/<runId>)
  --dry-run                     Validate flows & audit without device mutations; skip Explorer
  --json                        Print full structured VerifySuiteSummary JSON
  --help, -h                    Show this help message`);
}

export function parseVerifyArgs(argv: string[]): VerifyCommandOptions {
  const options: VerifyCommandOptions = {
    flows: [],
    failFast: false,
    failOnRegression: false,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--fail-fast") {
      options.failFast = true;
    } else if (arg === "--fail-on-regression") {
      options.failOnRegression = true;
    } else if (arg === "--audit") {
      options.audit = true;
    } else if (arg === "--no-audit") {
      options.audit = false;
    } else if (arg === "--explore") {
      options.explore = true;
    } else if (arg === "--no-explore") {
      options.explore = false;
    } else if (arg === "--record-on-failure") {
      options.recordOnFailure = true;
    } else if (arg === "--no-record-on-failure") {
      options.recordOnFailure = false;
    } else if (arg === "--suggest-heal") {
      options.suggestHeal = true;
    } else if (arg === "--no-suggest-heal") {
      options.suggestHeal = false;
    } else if (arg === "--config") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.configPath = next;
      i += 1;
    } else if (arg === "--platform") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      if (next !== "ios" && next !== "android") {
        options.error = `Invalid --platform "${next}". Expected "ios" or "android".`;
        return options;
      }
      options.platform = next;
      i += 1;
    } else if (arg === "--device-id") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.deviceId = next;
      i += 1;
    } else if (arg === "--app-id") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.appId = next;
      i += 1;
    } else if (arg === "--runner-profile") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      if (!VALID_RUNNER_PROFILES.includes(next as RunnerProfile)) {
        options.error = `Invalid --runner-profile "${next}". Expected one of: ${VALID_RUNNER_PROFILES.join(", ")}.`;
        return options;
      }
      options.runnerProfile = next as RunnerProfile;
      i += 1;
    } else if (arg === "--policy-profile") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.policyProfile = next;
      i += 1;
    } else if (arg === "--flows") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.flows.push(next!);
      i += 1;
    } else if (arg === "--explore-timeout-ms") {
      const missing = requireCliFlagValue(arg, next, true);
      if (missing) {
        options.error = missing;
        return options;
      }
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 1000) {
        options.error = `Invalid --explore-timeout-ms "${next}". Expected >= 1000.`;
        return options;
      }
      options.exploreTimeoutMs = Math.floor(parsed);
      i += 1;
    } else if (arg === "--baseline-path") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.baselinePath = next;
      i += 1;
    } else if (arg === "--baseline-mode") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      if (next !== "compare" && next !== "update") {
        options.error = `Invalid --baseline-mode "${next}". Expected "compare" or "update".`;
        return options;
      }
      options.baselineMode = next;
      i += 1;
    } else if (arg === "--output") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.output = next;
      i += 1;
    } else if (arg.startsWith("-")) {
      options.error = `Unknown option "${arg}". Run "mobile-e2e-mcp verify --help" for usage.`;
      return options;
    } else {
      options.error = `Unexpected argument "${arg}". Use --flows <path> to specify flows.`;
      return options;
    }
  }

  return options;
}

const defaultDeps: VerifyCommandDependencies = {
  runExplore: async (server, input) => {
    const { runExplore } = await import("@mobile-e2e-mcp/explorer");
    return runExplore(server, input);
  },
};

function defaultVerifyRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function slugifyPath(p: string): string {
  return path.basename(p).replace(/\.ya?ml$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "flow";
}

function toRelOrPosix(baseDir: string, targetPath: string): string {
  return path.relative(baseDir, targetPath).split(path.sep).join("/");
}

export async function executeVerify(
  server: MobileE2EMcpServer,
  argv: string[],
  deps: Partial<VerifyCommandDependencies> = {},
  cwd: string = process.cwd(),
): Promise<number> {
  const options = parseVerifyArgs(argv);
  if (options.help) {
    printVerifyHelp();
    return 0;
  }
  if (options.error) {
    console.error(options.error);
    return 2;
  }

  let projectConfig;
  try {
    projectConfig = (await loadProjectConfig(cwd, options.configPath))?.config;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const verifyCfg = projectConfig?.verify;
  const platform: Platform = options.platform ?? projectConfig?.platform ?? "android";
  const deviceId = options.deviceId ?? projectConfig?.deviceId;
  const appId = options.appId ?? projectConfig?.appId;
  const runnerProfile = options.runnerProfile ?? projectConfig?.runnerProfile;
  const policyProfile = options.policyProfile ?? projectConfig?.policyProfile;
  const harnessConfigPath = options.harnessConfigPath ?? projectConfig?.harnessConfigPath;

  const configuredFlowInputs = options.flows.length > 0
    ? options.flows
    : verifyCfg?.flows && verifyCfg.flows.length > 0
      ? verifyCfg.flows
      : projectConfig?.flowPath
        ? [projectConfig.flowPath]
        : [];

  const auditEnabled = options.audit ?? verifyCfg?.audit ?? Boolean(projectConfig?.audit);
  const exploreEnabled = options.explore ?? verifyCfg?.explore ?? false;
  const recordOnFailure = options.recordOnFailure ?? verifyCfg?.recordOnFailure ?? true;
  const suggestHeal = options.suggestHeal ?? verifyCfg?.suggestHeal ?? true;
  const failFast = options.failFast || verifyCfg?.failFast === true;
  const failOnRegression = options.failOnRegression || projectConfig?.audit?.failOnRegression === true;

  if (configuredFlowInputs.length === 0 && !auditEnabled && !exploreEnabled) {
    console.error("Nothing enabled for verify: configure verify.flows / --flows, --audit, or --explore.");
    return 2;
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const runId = defaultVerifyRunId();
  const outputRelOrRaw = options.output ?? verifyCfg?.output ?? path.join("output", "e2e-verify", runId);
  const outputDirAbs = resolve(cwd, outputRelOrRaw);
  mkdirSync(outputDirAbs, { recursive: true });

  // Expand flow files & directories
  const expandedFlows: string[] = [];
  for (const flowItem of configuredFlowInputs) {
    const discovered = discoverFlowFiles(flowItem, cwd);
    if (discovered.isDirectory && discovered.files.length === 0) {
      console.error(`No .yaml or .yml flow files found in directory "${flowItem}".`);
      return 2;
    }
    for (const file of discovered.files) {
      if (file && !expandedFlows.includes(file)) {
        expandedFlows.push(file);
      }
    }
  }

  // Stage 1: Flows
  const flowEntries: VerifyFlowEntry[] = [];
  for (let idx = 0; idx < expandedFlows.length; idx += 1) {
    const flowPath = expandedFlows[idx]!;
    const videoAbsPath = path.join(
      outputDirAbs,
      "videos",
      `${String(idx + 1).padStart(2, "0")}-${slugifyPath(flowPath)}.mp4`,
    );
    const outcome = await executeSingleFlow(server, {
      cwd,
      flowPath,
      platform,
      deviceId,
      appId,
      runnerProfile,
      policyProfile,
      harnessConfigPath,
      runCount: 1,
      dryRun: options.dryRun,
      recordOnFailure,
      recordOutput: videoAbsPath,
      suggestHeal,
    });

    const reasonCode = outcome.runResult?.reasonCode ?? outcome.startResult.reasonCode;
    const durationMs = outcome.runResult?.durationMs ?? outcome.startResult.durationMs ?? 0;
    const nextSuggestions = outcome.runResult?.nextSuggestions?.length
      ? outcome.runResult.nextSuggestions
      : outcome.startResult.nextSuggestions ?? [];
    const relRecording = outcome.recording.outputPath
      ? toRelOrPosix(outputDirAbs, resolve(cwd, outcome.recording.outputPath))
      : null;

    flowEntries.push({
      flowPath,
      status: outcome.passed ? "passed" : "failed",
      reasonCode,
      durationMs,
      sessionId: outcome.sessionId,
      recordingPath: relRecording,
      recordingDiscarded: outcome.recording.discarded,
      healProposal: outcome.healProposal,
      nextSuggestions,
    });

    if (!outcome.passed && failFast) {
      break;
    }
  }

  // Stage 2: UI Surface Audit
  let auditSummary: VerifyAuditSummary = {
    enabled: auditEnabled,
    status: "skipped",
    nextSuggestions: [],
  };
  let auditJsonPath: string | undefined;
  if (auditEnabled) {
    const startInput: StartSessionInput = {
      platform,
      profile: runnerProfile ?? null,
      policyProfile,
      harnessConfigPath,
      ...(deviceId ? { deviceId } : {}),
      ...(appId ? { appId } : {}),
    };
    const auditStart = await server.invoke(TOOL_NAMES.startSession, startInput);
    if (auditStart.status !== "success") {
      auditSummary = {
        enabled: true,
        status: "failed",
        reasonCode: auditStart.reasonCode,
        nextSuggestions: auditStart.nextSuggestions,
      };
    } else {
      const sessionId = auditStart.data.sessionId;
      auditJsonPath = path.join(outputDirAbs, "audit.json");
      const baselinePath = options.baselinePath ?? projectConfig?.audit?.baselinePath;
      const baselineMode = options.baselineMode ?? projectConfig?.audit?.baselineMode;
      const auditInput: AuditUiSurfaceInput = {
        sessionId,
        platform,
        ...(deviceId ? { deviceId } : {}),
        ...(appId ? { appId } : {}),
        outputPath: auditJsonPath,
        ...(baselinePath ? { baselinePath, baselineMode: baselineMode ?? "compare" } : {}),
        dryRun: options.dryRun,
      };
      const auditResult = (await server.invoke(
        TOOL_NAMES.auditUiSurface,
        auditInput,
      )) as ToolResult<AuditUiSurfaceData>;
      await server.invoke(TOOL_NAMES.endSession, {
        sessionId,
        artifacts: auditResult.artifacts,
      });

      const regressionDetected = hasUiAuditRegression(auditResult);
      const failed = auditResult.status === "failed" || (failOnRegression && regressionDetected);
      auditSummary = {
        enabled: true,
        status: failed ? "failed" : "passed",
        reasonCode: auditResult.reasonCode,
        surfaceName: auditResult.data?.surfaceName,
        totalNodes: auditResult.data?.totalNodes,
        totalIssues: auditResult.data?.issueCounts?.total,
        regressionDetected,
        outputPath: toRelOrPosix(outputDirAbs, auditJsonPath),
        nextSuggestions: auditResult.nextSuggestions ?? [],
      };
    }
  }

  // Stage 3: Bounded Explorer
  const resolvedDeps: VerifyCommandDependencies = { ...defaultDeps, ...deps };
  let explorerSummary: VerifyExplorerSummary = {
    enabled: exploreEnabled,
    status: "skipped",
  };
  let explorerHtmlAbsPath: string | undefined;
  if (exploreEnabled) {
    if (options.dryRun) {
      explorerSummary = {
        enabled: true,
        status: "skipped_dry_run",
      };
    } else if (!appId) {
      explorerSummary = {
        enabled: true,
        status: "failed",
        error: "Explorer requires --app-id or appId in .e2e/config.yaml.",
      };
    } else {
      const exploreReportDir = path.join(outputDirAbs, "explore");
      const expResult = await resolvedDeps.runExplore(server as unknown as InvokableServer, {
        appId,
        platform: platform === "ios" ? "ios-simulator" : "android-emulator",
        deviceId,
        mode: projectConfig?.explorer?.mode ?? "smoke",
        maxDepth: projectConfig?.explorer?.maxDepth,
        timeoutMs: options.exploreTimeoutMs,
        launchEnv: projectConfig?.launchEnv,
        reportDir: exploreReportDir,
        runId,
        skipInterview: true,
        quiet: true,
      });
      explorerHtmlAbsPath = expResult.reportHtmlPath;
      explorerSummary = {
        enabled: true,
        status: expResult.success && expResult.failedCount === 0 ? "passed" : "failed",
        runId: expResult.runId ?? runId,
        visitedPages: expResult.visitedPages,
        failedCount: expResult.failedCount,
        durationMs: expResult.durationMs,
        ...(expResult.reportHtmlPath
          ? { htmlReportRelPath: toRelOrPosix(outputDirAbs, expResult.reportHtmlPath) }
          : {}),
        ...(expResult.summaryJsonPath
          ? { summaryJsonRelPath: toRelOrPosix(outputDirAbs, expResult.summaryJsonPath) }
          : {}),
        ...(expResult.error ? { error: expResult.error } : {}),
      };
    }
  }

  const completedAtMs = Date.now();
  const passedFlows = flowEntries.filter((e) => e.status === "passed").length;
  const failedFlows = flowEntries.length - passedFlows;
  const anyFlowFailed = failedFlows > 0;
  const anyAuditFailed = auditSummary.status === "failed";
  const anyExplorerFailed = explorerSummary.status === "failed";
  const overallStatus = anyFlowFailed || anyAuditFailed || anyExplorerFailed ? "failed" : "passed";

  const nextSuggestions = Array.from(
    new Set([
      ...flowEntries.flatMap((e) => e.nextSuggestions),
      ...auditSummary.nextSuggestions,
      ...(explorerSummary.error ? [explorerSummary.error] : []),
    ]),
  );

  const summaryJsonPath = path.join(outputDirAbs, "summary.json");
  const reportMdPath = path.join(outputDirAbs, "report.md");
  const reportHtmlPath = path.join(outputDirAbs, "report.html");

  const summary: VerifySuiteSummary = {
    schemaVersion: "e2e-verify-summary/v1",
    runId,
    overallStatus,
    dryRun: options.dryRun,
    platform,
    ...(appId ? { appId } : {}),
    ...(deviceId ? { deviceId } : {}),
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    outputDir: outputDirAbs,
    flows: {
      enabled: expandedFlows.length > 0,
      total: flowEntries.length,
      passed: passedFlows,
      failed: failedFlows,
      entries: flowEntries,
    },
    audit: auditSummary,
    explorer: explorerSummary,
    artifacts: {
      summaryJsonPath,
      reportMdPath,
      reportHtmlPath,
      ...(auditJsonPath ? { auditJsonPath } : {}),
      ...(explorerHtmlAbsPath ? { explorerHtmlReportPath: explorerHtmlAbsPath } : {}),
    },
    nextSuggestions,
  };

  writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf-8");
  writeFileSync(reportMdPath, formatVerifyMarkdown(summary), "utf-8");
  writeFileSync(reportHtmlPath, formatVerifyHtml(summary), "utf-8");

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`mobile-e2e-mcp verify — overall: ${summary.overallStatus.toUpperCase()} (${runId})`);
    if (summary.flows.enabled) {
      console.log(`  flows:    ${summary.flows.passed}/${summary.flows.total} passed`);
    }
    if (summary.audit.enabled) {
      console.log(`  audit:    ${summary.audit.status} (issues=${summary.audit.totalIssues ?? 0})`);
    }
    if (summary.explorer.enabled) {
      console.log(`  explorer: ${summary.explorer.status}${summary.explorer.visitedPages !== undefined ? ` (pages=${summary.explorer.visitedPages}, failures=${summary.explorer.failedCount ?? 0})` : ""}`);
    }
    console.log(`  summary:  ${summaryJsonPath}`);
    console.log(`  markdown: ${reportMdPath}`);
    console.log(`  html:     ${reportHtmlPath}`);
  }

  return overallStatus === "passed" ? 0 : 1;
}
