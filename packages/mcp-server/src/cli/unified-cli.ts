import process from "node:process";
import { CORE_TOOL_NAMES, TOOL_NAMES } from "@mobile-e2e-mcp/contracts";
import type { InvokableServer } from "@mobile-e2e-mcp/explorer";
import { resolveMcpServerVersion } from "../constants/version.js";
import { main as runDevCli } from "../dev-cli.js";
import { buildToolListMetadata, createServer } from "../index.js";
import { startMcpStdioServer } from "../mcp-stdio-server.js";
import { parseToolsetFlag } from "../toolsets.js";
import { executeAudit } from "./audit-command.js";
import { executeDiff } from "./diff-command.js";
import { executeDoctor } from "./doctor-command.js";
import { executeInit } from "./init-command.js";
import { loadProjectConfig, type ProjectE2EConfig } from "./project-config.js";
import { executeRun } from "./run-command.js";
import { executeSetupAgent } from "./setup-agent-command.js";
import { executeVerify } from "./verify-command.js";

export function printUnifiedHelp(): void {
  const coreCount = CORE_TOOL_NAMES.length;
  const fullCount = buildToolListMetadata().length;
  console.log(`mobile-e2e-mcp v${resolveMcpServerVersion()}

Usage:
  mobile-e2e-mcp [stdio] [--toolset core|full]    Start MCP stdio server (default: core, ${coreCount} tools)
  mobile-e2e-mcp doctor [--json]                  Check local Android/iOS tools and devices
  mobile-e2e-mcp init [options]                   Generate .e2e/config.yaml in current project
  mobile-e2e-mcp explore [options]                Run automatic page exploration
  mobile-e2e-mcp run [flowPath] [options]         Run a deterministic flow or directory with session governance
  mobile-e2e-mcp audit [options]                  Run a governed UI-surface audit with baseline gating
  mobile-e2e-mcp diff <baseDir> <headDir> [opts]  Diff two Explorer runs (Markdown + self-contained HTML)
  mobile-e2e-mcp verify [options]                 Run flows + UI audit + bounded Explorer with unified report
  mobile-e2e-mcp setup-agent [options]            Install MCP config + workflow guide for an AI client

Toolsets:
  --toolset core    Expose ${coreCount} high-frequency core tools (default; lowest context overhead)
  --toolset full    Expose all ${fullCount} registered MCP tools
  Env override:     MOBILE_E2E_TOOLSET=core|full (--toolset flag takes precedence)

Examples:
  mobile-e2e-mcp                                  Start MCP stdio server with core toolset
  mobile-e2e-mcp --toolset full                   Start MCP stdio server with all ${fullCount} tools
  mobile-e2e-mcp doctor                           Check host environment & booted devices
  mobile-e2e-mcp init --platform ios --app-id com.example.app --no-prompt
  mobile-e2e-mcp explore --app-id com.example.app --platform android --output ./explore-report --export-flows ./flows/generated
  mobile-e2e-mcp run flows/smoke.yaml --dry-run
  mobile-e2e-mcp audit --baseline-path .e2e/ui-baseline.json --fail-on-regression
  mobile-e2e-mcp diff ./explore-report/base ./explore-report/head --markdown diff.md --html diff.html
  mobile-e2e-mcp setup-agent --target claude --toolset core --dry-run`);
}

function printStdioHelp(): void {
  console.log(`Usage: mobile-e2e-mcp stdio [--toolset core|full]

Start the JSON-RPC MCP stdio server.

Options:
  --toolset <core|full>   Select exposed toolset (default: core, or MOBILE_E2E_TOOLSET)
  --help, -h              Show this help message`);
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function normalizeExploreArgs(
  argv: string[],
  projectConfig?: ProjectE2EConfig,
): string[] {
  const normalized: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];
    if (arg === "--platform" && next) {
      const mapped = next === "ios"
        ? "ios-simulator"
        : next === "android"
          ? "android-emulator"
          : next;
      normalized.push("--platform", mapped);
      i += 1;
      continue;
    }
    if (arg.startsWith("--platform=")) {
      const val = arg.slice("--platform=".length);
      const mapped = val === "ios"
        ? "ios-simulator"
        : val === "android"
          ? "android-emulator"
          : val;
      normalized.push("--platform", mapped);
      continue;
    }
    normalized.push(arg);
  }

  if (normalized.includes("--help") || normalized.includes("-h") || !projectConfig) {
    return normalized;
  }

  if (projectConfig.appId && !hasFlag(normalized, "--app-id")) {
    normalized.push("--app-id", projectConfig.appId);
  }
  if (projectConfig.platform && !hasFlag(normalized, "--platform")) {
    normalized.push(
      "--platform",
      projectConfig.platform === "ios" ? "ios-simulator" : "android-emulator",
    );
  }
  if (projectConfig.deviceId && !hasFlag(normalized, "--device-id")) {
    normalized.push("--device-id", projectConfig.deviceId);
  }
  if (projectConfig.explorer?.mode && !hasFlag(normalized, "--mode")) {
    normalized.push("--mode", projectConfig.explorer.mode);
  }
  if (projectConfig.explorer?.maxDepth !== undefined && !hasFlag(normalized, "--max-depth")) {
    normalized.push("--max-depth", String(projectConfig.explorer.maxDepth));
  }
  if (projectConfig.explorer?.output && !hasFlag(normalized, "--output")) {
    normalized.push("--output", projectConfig.explorer.output);
  }
  if (projectConfig.launchEnv && !hasFlag(normalized, "--launch-env")) {
    for (const [key, value] of Object.entries(projectConfig.launchEnv)) {
      normalized.push("--launch-env", `${key}=${value}`);
    }
  }

  return normalized;
}

export interface UnifiedCliDependencies {
  startMcpStdioServer: typeof startMcpStdioServer;
  executeDoctor: typeof executeDoctor;
  executeInit: typeof executeInit;
  executeRun: typeof executeRun;
  executeAudit: typeof executeAudit;
  executeDiff: typeof executeDiff;
  executeVerify: typeof executeVerify;
  executeSetupAgent: typeof executeSetupAgent;
  runDevCli: typeof runDevCli;
  createServer: typeof createServer;
  loadProjectConfig: typeof loadProjectConfig;
  runExplore: (args: string[], server: InvokableServer) => Promise<void>;
}

const defaultDeps: UnifiedCliDependencies = {
  startMcpStdioServer,
  executeDoctor,
  executeInit,
  executeRun,
  executeAudit,
  executeDiff,
  executeVerify,
  executeSetupAgent,
  runDevCli,
  createServer,
  loadProjectConfig,
  runExplore: async (args, server) => {
    const { explore } = await import("@mobile-e2e-mcp/explorer");
    await explore(args, server);
  },
};

export async function runUnifiedCli(
  argv: string[] = process.argv.slice(2),
  deps: Partial<UnifiedCliDependencies> = {},
  cwd: string = process.cwd(),
): Promise<number> {
  const resolvedDeps: UnifiedCliDependencies = { ...defaultDeps, ...deps };

  if (argv.length === 0) {
    await resolvedDeps.startMcpStdioServer({ argv: [] });
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }

  const first = argv[0] ?? "";
  const rest = argv.slice(1);

  if (first === "--help" || first === "-h" || first === "help") {
    printUnifiedHelp();
    return 0;
  }

  if (first === "--version" || first === "-v") {
    console.log(resolveMcpServerVersion());
    return 0;
  }

  if (first === "stdio") {
    if (rest.includes("--help") || rest.includes("-h")) {
      printStdioHelp();
      return 0;
    }
    await resolvedDeps.startMcpStdioServer({ argv: rest });
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }

  const toolsetParse = parseToolsetFlag(argv);
  if (toolsetParse.error && (first === "--toolset" || first.startsWith("--toolset="))) {
    console.error(toolsetParse.error);
    return 2;
  }
  if (toolsetParse.toolset && toolsetParse.remainingArgs.length === 0) {
    await resolvedDeps.startMcpStdioServer({ argv });
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }

  if (first === TOOL_NAMES.doctor) {
    return resolvedDeps.executeDoctor(resolvedDeps.createServer(), rest);
  }

  if (first === "init") {
    const result = await resolvedDeps.executeInit(rest, { cwd });
    return result.exitCode;
  }

  if (first === "explore") {
    const wantsHelp = rest.includes("--help") || rest.includes("-h");
    const loadedConfig = wantsHelp ? undefined : await resolvedDeps.loadProjectConfig(cwd);
    const normalizedArgs = normalizeExploreArgs(rest, loadedConfig?.config);
    await resolvedDeps.runExplore(
      normalizedArgs,
      resolvedDeps.createServer() as unknown as InvokableServer,
    );
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }

  if (first === "run") {
    return resolvedDeps.executeRun(resolvedDeps.createServer(), rest, cwd);
  }

  if (first === "audit") {
    return resolvedDeps.executeAudit(resolvedDeps.createServer(), rest, cwd);
  }

  if (first === "diff") {
    return resolvedDeps.executeDiff(rest, {}, cwd);
  }

  if (first === "verify") {
    return resolvedDeps.executeVerify(resolvedDeps.createServer(), rest, {}, cwd);
  }

  if (first === "setup-agent") {
    return resolvedDeps.executeSetupAgent(rest, cwd);
  }

  if (first.startsWith("-")) {
    await resolvedDeps.runDevCli(argv);
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }

  console.error(`Unknown command: "${first}". Run "mobile-e2e-mcp --help" for usage.`);
  return 2;
}
