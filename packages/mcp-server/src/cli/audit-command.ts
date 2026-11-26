import process from "node:process";
import {
  TOOL_NAMES,
  type AuditUiSurfaceData,
  type AuditUiSurfaceInput,
  type Platform,
  type StartSessionInput,
  type ToolResult,
  type UiAuditBaselineMode,
} from "@mobile-e2e-mcp/contracts";
import type { MobileE2EMcpServer } from "../server.js";
import { loadProjectConfig } from "./project-config.js";

export interface AuditCommandOptions {
  platform?: Platform;
  deviceId?: string;
  appId?: string;
  baselinePath?: string;
  baselineMode?: UiAuditBaselineMode;
  output?: string;
  configPath?: string;
  dryRun: boolean;
  json: boolean;
  failOnRegression: boolean;
  help: boolean;
  error?: string;
}

function printAuditHelp(): void {
  console.log(`Usage: mobile-e2e-mcp audit [options]

Run audit_ui_surface inside a governed session and report UI/accessibility issues.
Reads defaults from .e2e/config.yaml when present (including an \`audit\` section).

Options:
  --platform <ios|android>     Target platform
  --device-id <id>              Target device ID or simulator UDID
  --app-id <id>                 Target app bundle ID / package name
  --baseline-path <path>        UI audit baseline JSON path
  --baseline-mode <compare|update>  Baseline behavior (default: compare)
  --output <path>               Output path for audit artifacts
  --config <path>               Project config path (default: .e2e/config.yaml)
  --dry-run                     Validate and build the audit command without device side effects
  --json                        Print full structured JSON payload
  --fail-on-regression          Exit non-zero when a UI audit regression is detected
  --help, -h                    Show this help message`);
}

export function parseAuditArgs(argv: string[]): AuditCommandOptions {
  const options: AuditCommandOptions = {
    dryRun: false,
    json: false,
    failOnRegression: false,
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
    } else if (arg === "--fail-on-regression") {
      options.failOnRegression = true;
    } else if (arg === "--platform" && next) {
      if (next !== "ios" && next !== "android") {
        options.error = `Invalid --platform "${next}". Expected "ios" or "android".`;
        return options;
      }
      options.platform = next;
      i += 1;
    } else if (arg === "--baseline-mode" && next) {
      if (next !== "compare" && next !== "update") {
        options.error = `Invalid --baseline-mode "${next}". Expected "compare" or "update".`;
        return options;
      }
      options.baselineMode = next;
      i += 1;
    } else if (arg === "--device-id" && next) {
      options.deviceId = next;
      i += 1;
    } else if (arg === "--app-id" && next) {
      options.appId = next;
      i += 1;
    } else if (arg === "--baseline-path" && next) {
      options.baselinePath = next;
      i += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      i += 1;
    } else if (arg === "--config" && next) {
      options.configPath = next;
      i += 1;
    }
  }

  return options;
}

/** Determine whether an audit result represents a baseline/UI regression. */
export function hasUiAuditRegression(result: ToolResult<AuditUiSurfaceData>): boolean {
  if (result.status === "failed") return true;
  const diff = result.data?.baselineDiff;
  if (!diff) return false;
  return diff.baselineFound
    ? (diff.newRegressions?.length ?? 0) > 0 || (diff.newIssueCounts?.total ?? 0) > 0
    : (result.data?.issueCounts?.total ?? 0) > 0;
}

function formatAuditReport(result: ToolResult<AuditUiSurfaceData>, regressionDetected: boolean): string {
  const data = result.data;
  const lines: string[] = [
    `mobile-e2e-mcp audit — status: ${result.status} (${result.reasonCode})`,
    `  sessionId: ${result.sessionId}`,
    `  surface:   ${data?.surfaceName ?? "—"}`,
    `  dryRun:    ${data?.dryRun === true ? "yes" : "no"}`,
    `  nodes:     ${data?.totalNodes ?? 0}`,
    `  issues:    ${data?.issueCounts?.total ?? 0}`,
  ];
  const diff = data?.baselineDiff;
  if (diff) {
    lines.push(
      `  baseline:  ${diff.baselineFound ? "found" : "not found"} (mode=${diff.mode})`,
      `  new regressions: ${diff.newRegressions?.length ?? 0}`,
      `  new issues:      ${diff.newIssueCounts?.total ?? 0}`,
    );
  }
  lines.push(`  regression gate: ${regressionDetected ? "FAILED" : "passed"}`);
  for (const suggestion of result.nextSuggestions ?? []) {
    lines.push(`  - ${suggestion}`);
  }
  return lines.join("\n");
}

export async function executeAudit(
  server: MobileE2EMcpServer,
  argv: string[],
  cwd: string = process.cwd(),
): Promise<number> {
  const options = parseAuditArgs(argv);
  if (options.help) {
    printAuditHelp();
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

  const platform: Platform = options.platform ?? projectConfig?.platform ?? "android";
  const deviceId = options.deviceId ?? projectConfig?.deviceId;
  const appId = options.appId ?? projectConfig?.appId;
  const baselinePath = options.baselinePath ?? projectConfig?.audit?.baselinePath;
  const baselineMode: UiAuditBaselineMode | undefined =
    options.baselineMode ?? projectConfig?.audit?.baselineMode;
  const output = options.output ?? projectConfig?.audit?.output;
  const failOnRegression = options.failOnRegression || projectConfig?.audit?.failOnRegression === true;

  const startInput: StartSessionInput = {
    platform,
    profile: projectConfig?.runnerProfile ?? null,
    policyProfile: projectConfig?.policyProfile,
    harnessConfigPath: projectConfig?.harnessConfigPath,
    ...(deviceId ? { deviceId } : {}),
    ...(appId ? { appId } : {}),
  };

  const startResult = await server.invoke(TOOL_NAMES.startSession, startInput);
  if (startResult.status !== "success") {
    if (options.json) {
      console.log(JSON.stringify({ startResult }, null, 2));
    } else {
      console.error(`Failed to start session (${startResult.reasonCode}): ${startResult.nextSuggestions.join(" | ")}`);
    }
    return 1;
  }

  const sessionId = startResult.data.sessionId;
  const auditInput: AuditUiSurfaceInput = {
    sessionId,
    platform,
    ...(deviceId ? { deviceId } : {}),
    ...(appId ? { appId } : {}),
    ...(output ? { outputPath: output } : {}),
    ...(baselinePath
      ? { baselinePath, baselineMode: baselineMode ?? "compare" }
      : {}),
    dryRun: options.dryRun,
  };

  const auditResult = await server.invoke(TOOL_NAMES.auditUiSurface, auditInput);
  const endResult = await server.invoke(TOOL_NAMES.endSession, {
    sessionId,
    artifacts: auditResult.artifacts,
  });

  const regressionDetected = hasUiAuditRegression(auditResult);
  const exitCode =
    auditResult.status === "failed" || endResult.status === "failed"
      ? 1
      : failOnRegression && regressionDetected
        ? 1
        : 0;

  if (options.json) {
    console.log(JSON.stringify({ startResult, auditResult, endResult, regressionDetected, exitCode }, null, 2));
  } else {
    console.log(formatAuditReport(auditResult, regressionDetected));
  }

  return exitCode;
}
