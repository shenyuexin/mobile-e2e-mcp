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
  buildVerifyFailurePacket,
  formatVerifyHtml,
  formatVerifyMarkdown,
  type VerifyAuditSummary,
  type VerifyExplorerSummary,
  type VerifyFlowEntry,
  type VerifySuiteSummary,
} from "./verify-report.js";
import {
  loadMatrixConfig,
  parseInlineTargetFlag,
  type VerifyMatrixTargetSpec,
  type VerifyMatrixTargetSummary,
} from "./verify-matrix.js";
import {
  executeVerifyProbes,
  loadProbeConfig,
  type FetchProbeFn,
  type VerifyProbeConfigFile,
  type VerifyProbesSummary,
} from "./verify-probes.js";

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
  probeConfig?: string;
  updateProbeBaseline?: boolean;
  targets: VerifyMatrixTargetSpec[];
  matrixConfig?: string;
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
  fetchProbe?: FetchProbeFn;
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
  --probe-config <path>         Custom HTTP telemetry probe & ratchet JSON path
  --update-probe-baseline       Write/refresh probe baseline when all probes pass
  --target <label:plat[:udid]>  Multi-device matrix target override (repeatable)
  --matrix-config <path>        Multi-device matrix JSON config path
  --record-on-failure           Record failure-only video per flow (default from config)
  --no-record-on-failure        Disable per-flow video recording
  --suggest-heal                Emit proposal-only heal diffs when a flow fails
  --no-suggest-heal             Disable selector heal proposals
  --fail-fast                   Stop remaining flows on first failure
  --fail-on-regression          Fail acceptance if UI audit reports a regression
  --output <dir>                Output directory (default: ./output/e2e-verify/<runId>)
  --dry-run                     Validate flows & audit without device mutations; skip Explorer & live probes
  --json                        Print full structured VerifySuiteSummary JSON
  --help, -h                    Show this help message`);
}

export function parseVerifyArgs(argv: string[]): VerifyCommandOptions {
  const options: VerifyCommandOptions = {
    flows: [],
    targets: [],
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
    } else if (arg === "--probe-config") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.probeConfig = next;
      i += 1;
    } else if (arg === "--update-probe-baseline") {
      options.updateProbeBaseline = true;
    } else if (arg === "--target") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      const parsedTarget = parseInlineTargetFlag(next!);
      if (parsedTarget.error || !parsedTarget.target) {
        options.error = parsedTarget.error ?? `Invalid --target "${next}".`;
        return options;
      }
      if (options.targets.some((t) => t.label === parsedTarget.target!.label)) {
        options.error = `Duplicate --target label "${parsedTarget.target.label}".`;
        return options;
      }
      options.targets.push(parsedTarget.target);
      i += 1;
    } else if (arg === "--matrix-config") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.matrixConfig = next;
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

async function executeSingleTargetVerify(params: {
  server: MobileE2EMcpServer;
  cwd: string;
  runId: string;
  startedAt: string;
  startedAtMs: number;
  outputDirAbs: string;
  platform: Platform;
  deviceId?: string;
  appId?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  harnessConfigPath?: string;
  expandedFlows: string[];
  auditEnabled: boolean;
  exploreEnabled: boolean;
  exploreMode?: "smoke" | "scoped" | "full";
  exploreMaxDepth?: number;
  exploreTimeoutMs?: number;
  launchEnv?: Record<string, string>;
  baselinePath?: string;
  baselineMode?: UiAuditBaselineMode;
  probeConfig?: VerifyProbeConfigFile;
  updateProbeBaseline?: boolean;
  recordOnFailure: boolean;
  suggestHeal: boolean;
  failFast: boolean;
  failOnRegression: boolean;
  dryRun: boolean;
  deps: VerifyCommandDependencies;
}): Promise<VerifySuiteSummary> {
  const {
    server,
    cwd,
    runId,
    startedAt,
    startedAtMs,
    outputDirAbs,
    platform,
    deviceId,
    appId,
    runnerProfile,
    policyProfile,
    harnessConfigPath,
    expandedFlows,
    auditEnabled,
    exploreEnabled,
    baselinePath,
    baselineMode,
    probeConfig,
    updateProbeBaseline,
    recordOnFailure,
    suggestHeal,
    failFast,
    failOnRegression,
    dryRun,
    deps,
  } = params;

  mkdirSync(outputDirAbs, { recursive: true });

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
      dryRun,
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
      const auditInput: AuditUiSurfaceInput = {
        sessionId,
        platform,
        ...(deviceId ? { deviceId } : {}),
        ...(appId ? { appId } : {}),
        outputPath: auditJsonPath,
        ...(baselinePath ? { baselinePath, baselineMode: baselineMode ?? "compare" } : {}),
        dryRun,
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
  let explorerSummary: VerifyExplorerSummary = {
    enabled: exploreEnabled,
    status: "skipped",
  };
  let explorerHtmlAbsPath: string | undefined;
  if (exploreEnabled) {
    if (dryRun) {
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
      const expResult = await deps.runExplore(server as unknown as InvokableServer, {
        appId,
        platform: platform === "ios" ? "ios-simulator" : "android-emulator",
        deviceId,
        mode: params.exploreMode ?? "smoke",
        maxDepth: params.exploreMaxDepth,
        timeoutMs: params.exploreTimeoutMs,
        launchEnv: params.launchEnv,
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

  // Stage 4: Custom HTTP Telemetry Probes & Performance Ratchets
  let probesSummary: VerifyProbesSummary | undefined;
  if (probeConfig) {
    probesSummary = await executeVerifyProbes({
      config: probeConfig,
      cwd,
      outputDirAbs,
      dryRun,
      updateBaseline: updateProbeBaseline,
      fetchProbe: deps.fetchProbe,
    });
  }

  const completedAtMs = Date.now();
  const passedFlows = flowEntries.filter((e) => e.status === "passed").length;
  const failedFlows = flowEntries.length - passedFlows;
  const anyFlowFailed = failedFlows > 0;
  const anyAuditFailed = auditSummary.status === "failed";
  const anyExplorerFailed = explorerSummary.status === "failed";
  const anyProbeFailed = probesSummary?.status === "failed";
  const overallStatus =
    anyFlowFailed || anyAuditFailed || anyExplorerFailed || anyProbeFailed ? "failed" : "passed";

  const nextSuggestions = Array.from(
    new Set([
      ...flowEntries.flatMap((e) => e.nextSuggestions),
      ...auditSummary.nextSuggestions,
      ...(explorerSummary.error ? [explorerSummary.error] : []),
      ...(probesSummary?.entries.flatMap((e) => e.failures) ?? []),
    ]),
  );

  const summaryJsonPath = path.join(outputDirAbs, "summary.json");
  const reportMdPath = path.join(outputDirAbs, "report.md");
  const reportHtmlPath = path.join(outputDirAbs, "report.html");
  const failurePacketPath = overallStatus === "failed" ? path.join(outputDirAbs, "failure-packet.json") : undefined;

  const summary: VerifySuiteSummary = {
    schemaVersion: "e2e-verify-summary/v1",
    runId,
    overallStatus,
    dryRun,
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
    ...(probesSummary ? { probes: probesSummary } : {}),
    artifacts: {
      summaryJsonPath,
      reportMdPath,
      reportHtmlPath,
      ...(auditJsonPath ? { auditJsonPath } : {}),
      ...(explorerHtmlAbsPath ? { explorerHtmlReportPath: explorerHtmlAbsPath } : {}),
      ...(failurePacketPath ? { failurePacketPath } : {}),
    },
    nextSuggestions,
  };

  if (failurePacketPath) {
    writeFileSync(failurePacketPath, JSON.stringify(buildVerifyFailurePacket(summary), null, 2), "utf-8");
  }
  writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf-8");
  writeFileSync(reportMdPath, formatVerifyMarkdown(summary), "utf-8");
  writeFileSync(reportHtmlPath, formatVerifyHtml(summary), "utf-8");

  return summary;
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

  const defaultProbeConfigPath = options.probeConfig ?? verifyCfg?.probeConfig;
  let defaultProbeConfig: VerifyProbeConfigFile | undefined;
  if (defaultProbeConfigPath) {
    try {
      defaultProbeConfig = loadProbeConfig(defaultProbeConfigPath, cwd);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  let matrixTargets: VerifyMatrixTargetSpec[] = [];
  const matrixConfigPath = options.matrixConfig ?? verifyCfg?.matrixConfig;
  if (options.targets.length > 0) {
    matrixTargets = options.targets;
  } else if (matrixConfigPath) {
    try {
      matrixTargets = loadMatrixConfig(matrixConfigPath, cwd).targets;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  // Preload & validate per-target probe configs upfront so errors fail fast with exit code 2
  const probeConfigByTarget = new Map<string, VerifyProbeConfigFile | undefined>();
  for (const target of matrixTargets) {
    if (target.probeConfig) {
      try {
        probeConfigByTarget.set(target.label, loadProbeConfig(target.probeConfig, cwd));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 2;
      }
    } else {
      probeConfigByTarget.set(target.label, defaultProbeConfig);
    }
  }

  const hasAnyProbe = Boolean(defaultProbeConfig) || Array.from(probeConfigByTarget.values()).some(Boolean);
  if (configuredFlowInputs.length === 0 && !auditEnabled && !exploreEnabled && !hasAnyProbe) {
    console.error("Nothing enabled for verify: configure verify.flows / --flows, --audit, --explore, or --probe-config.");
    return 2;
  }

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

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const runId = defaultVerifyRunId();
  const outputRelOrRaw = options.output ?? verifyCfg?.output ?? path.join("output", "e2e-verify", runId);
  const outputDirAbs = resolve(cwd, outputRelOrRaw);
  const resolvedDeps: VerifyCommandDependencies = { ...defaultDeps, ...deps };

  let summary: VerifySuiteSummary;
  if (matrixTargets.length === 0) {
    summary = await executeSingleTargetVerify({
      server,
      cwd,
      runId,
      startedAt,
      startedAtMs,
      outputDirAbs,
      platform,
      deviceId,
      appId,
      runnerProfile,
      policyProfile,
      harnessConfigPath,
      expandedFlows,
      auditEnabled,
      exploreEnabled,
      exploreMode: projectConfig?.explorer?.mode,
      exploreMaxDepth: projectConfig?.explorer?.maxDepth,
      exploreTimeoutMs: options.exploreTimeoutMs,
      launchEnv: projectConfig?.launchEnv,
      baselinePath: options.baselinePath ?? projectConfig?.audit?.baselinePath,
      baselineMode: options.baselineMode ?? projectConfig?.audit?.baselineMode,
      probeConfig: defaultProbeConfig,
      updateProbeBaseline: options.updateProbeBaseline,
      recordOnFailure,
      suggestHeal,
      failFast,
      failOnRegression,
      dryRun: options.dryRun,
      deps: resolvedDeps,
    });
  } else {
    mkdirSync(outputDirAbs, { recursive: true });
    const targetSummaries: VerifyMatrixTargetSummary[] = [];
    const targetSuiteResults: VerifySuiteSummary[] = [];
    for (const target of matrixTargets) {
      const targetStartMs = Date.now();
      const targetOutAbs = path.join(outputDirAbs, "targets", target.label);
      const targetSuite = await executeSingleTargetVerify({
        server,
        cwd,
        runId: `${runId}-${target.label}`,
        startedAt: new Date(targetStartMs).toISOString(),
        startedAtMs: targetStartMs,
        outputDirAbs: targetOutAbs,
        platform: target.platform,
        deviceId: target.deviceId ?? deviceId,
        appId: target.appId ?? appId,
        runnerProfile: target.runnerProfile ?? runnerProfile,
        policyProfile,
        harnessConfigPath,
        expandedFlows,
        auditEnabled,
        exploreEnabled,
        exploreMode: projectConfig?.explorer?.mode,
        exploreMaxDepth: projectConfig?.explorer?.maxDepth,
        exploreTimeoutMs: options.exploreTimeoutMs,
        launchEnv: projectConfig?.launchEnv,
        baselinePath: target.baselinePath ?? options.baselinePath ?? projectConfig?.audit?.baselinePath,
        baselineMode: options.baselineMode ?? projectConfig?.audit?.baselineMode,
        probeConfig: probeConfigByTarget.get(target.label),
        updateProbeBaseline: options.updateProbeBaseline,
        recordOnFailure,
        suggestHeal,
        failFast,
        failOnRegression,
        dryRun: options.dryRun,
        deps: resolvedDeps,
      });
      targetSuiteResults.push(targetSuite);
      targetSummaries.push({
        label: target.label,
        platform: target.platform,
        ...(targetSuite.deviceId ? { deviceId: targetSuite.deviceId } : {}),
        overallStatus: targetSuite.overallStatus,
        durationMs: targetSuite.durationMs,
        flowsPassed: targetSuite.flows.passed,
        flowsTotal: targetSuite.flows.total,
        auditStatus: targetSuite.audit.status,
        probeStatus: targetSuite.probes?.enabled ? targetSuite.probes.status : "skipped",
        explorerStatus: targetSuite.explorer.status,
        summaryJsonRelPath: toRelOrPosix(outputDirAbs, targetSuite.artifacts.summaryJsonPath),
        reportHtmlRelPath: toRelOrPosix(outputDirAbs, targetSuite.artifacts.reportHtmlPath),
        ...(targetSuite.artifacts.failurePacketPath
          ? { failurePacketRelPath: toRelOrPosix(outputDirAbs, targetSuite.artifacts.failurePacketPath) }
          : {}),
      });
    }

    const completedAtMs = Date.now();
    const totalFlows = targetSuiteResults.reduce((acc, s) => acc + s.flows.total, 0);
    const passedFlows = targetSuiteResults.reduce((acc, s) => acc + s.flows.passed, 0);
    const failedFlows = totalFlows - passedFlows;
    const anyTargetFailed = targetSummaries.some((t) => t.overallStatus === "failed");
    const passedTargets = targetSummaries.filter((t) => t.overallStatus === "passed").length;
    const allFlowEntries = targetSuiteResults.flatMap((s) => s.flows.entries);
    const summaryJsonPath = path.join(outputDirAbs, "summary.json");
    const reportMdPath = path.join(outputDirAbs, "report.md");
    const reportHtmlPath = path.join(outputDirAbs, "report.html");
    const failurePacketPath = anyTargetFailed ? path.join(outputDirAbs, "failure-packet.json") : undefined;

    const aggregatedAuditFailed = targetSuiteResults.some((s) => s.audit.status === "failed");
    const aggregatedExplorerFailed = targetSuiteResults.some((s) => s.explorer.status === "failed");
    const nextSuggestions = Array.from(new Set(targetSuiteResults.flatMap((s) => s.nextSuggestions)));

    summary = {
      schemaVersion: "e2e-verify-summary/v1",
      runId,
      overallStatus: anyTargetFailed ? "failed" : "passed",
      dryRun: options.dryRun,
      platform: matrixTargets[0]!.platform,
      ...(appId ? { appId } : {}),
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
      outputDir: outputDirAbs,
      flows: {
        enabled: expandedFlows.length > 0,
        total: totalFlows,
        passed: passedFlows,
        failed: failedFlows,
        entries: allFlowEntries,
      },
      audit: {
        enabled: auditEnabled,
        status: !auditEnabled ? "skipped" : aggregatedAuditFailed ? "failed" : "passed",
        nextSuggestions: [],
      },
      explorer: {
        enabled: exploreEnabled,
        status: !exploreEnabled
          ? "skipped"
          : options.dryRun
            ? "skipped_dry_run"
            : aggregatedExplorerFailed
              ? "failed"
              : "passed",
      },
      matrix: {
        enabled: true,
        total: targetSummaries.length,
        passed: passedTargets,
        failed: targetSummaries.length - passedTargets,
        targets: targetSummaries,
      },
      artifacts: {
        summaryJsonPath,
        reportMdPath,
        reportHtmlPath,
        ...(failurePacketPath ? { failurePacketPath } : {}),
      },
      nextSuggestions,
    };

    if (failurePacketPath) {
      writeFileSync(failurePacketPath, JSON.stringify(buildVerifyFailurePacket(summary), null, 2), "utf-8");
    }
    writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf-8");
    writeFileSync(reportMdPath, formatVerifyMarkdown(summary), "utf-8");
    writeFileSync(reportHtmlPath, formatVerifyHtml(summary), "utf-8");
  }

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
    if (summary.probes?.enabled) {
      console.log(`  probes:   ${summary.probes.passed}/${summary.probes.total} passed (${summary.probes.status})`);
    }
    if (summary.matrix?.enabled) {
      console.log(`  matrix:   ${summary.matrix.passed}/${summary.matrix.total} targets passed`);
    }
    if (summary.artifacts.failurePacketPath) {
      console.log(`  failure:  ${summary.artifacts.failurePacketPath}`);
    }
    console.log(`  summary:  ${summary.artifacts.summaryJsonPath}`);
    console.log(`  markdown: ${summary.artifacts.reportMdPath}`);
    console.log(`  html:     ${summary.artifacts.reportHtmlPath}`);
  }

  return summary.overallStatus === "passed" ? 0 : 1;
}
