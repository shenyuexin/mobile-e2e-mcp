/**
 * CLI entry point for the explorer.
 *
 * Parses process.argv, optionally runs the interview, then delegates to the runner.
 * Exported as `explore()` for wiring through the mcp-server CLI.
 */

import type { ExplorerConfig, ExplorerPlatform, ExplorationMode, FailureStrategy, DestructiveActionPolicy, AuthConfig } from "./types.js";
import type { InvokableServer } from "./mcp-adapter.js";
import { runExplore, type ExplorerResult } from "./runner.js";
import { runInterview } from "./interview.js";
import { ConfigStore } from "./config-store.js";
import { loadConfig, buildDefaultConfig } from "./config.js";

// ---------------------------------------------------------------------------
// CLI flag
// ---------------------------------------------------------------------------

export interface ExploreFlags {
  mode?: ExplorationMode;
  appId?: string;
  platform?: ExplorerPlatform;
  noPrompt: boolean;
  configPath?: string;
  output?: string;
  compare?: string;
  maxDepth?: number;
  timeoutMs?: number;
  help: boolean;
  json: boolean;
  runId?: string;
  failureStrategy?: FailureStrategy;
  destructiveActionPolicy?: DestructiveActionPolicy;
  deviceId?: string;
  launchEnv?: Record<string, string>;
  exportFlows?: string;
  error?: string;
}

const VALID_MODES: ExplorationMode[] = ["smoke", "scoped", "full"];
const VALID_PLATFORMS: ExplorerPlatform[] = ["ios-simulator", "ios-device", "android-emulator", "android-device"];

function printHelp(): void {
  console.log(`
Usage: mobile-e2e-mcp explore [options]

Options:
  --mode <mode>             Exploration mode: smoke, scoped (default), full
  --app-id <id>             Application Bundle ID / Package Name
  --platform <platform>     Target platform: ios-simulator, ios-device, android-emulator, android-device
  --device-id <udid>        Target device or simulator UDID
  --launch-env <KEY=VAL>    Inject app launch env var (repeatable, iOS SIMCTL_CHILD_*)
  --max-depth <n>           Maximum exploration depth (default: mode-based: 5/8/∞)
  --timeout-ms <ms>         Total timeout in milliseconds (default: 300000)
  --no-prompt               Skip interactive interview, use defaults or args
  --config <path>           Path to config file (default: .explorer-config.json)
  --output <dir>            Output directory for reports (default: ./explorer-reports)
  --run-id <id>             Explicit single-segment run ID subdirectory under --output
  --compare <runId>         Run ID to compare against
  --export-flows <dir>      Export deterministic Maestro smoke flows for reachable paths
  --json                    Print structured JSON result summary
  --help, -h                Show this help message

Examples:
  mobile-e2e-mcp explore --no-prompt
  mobile-e2e-mcp explore --mode smoke --app-id com.apple.Preferences
  mobile-e2e-mcp explore --platform android-emulator --app-id com.example.app
  mobile-e2e-mcp explore --config ./my-config.json
  mobile-e2e-mcp explore --no-prompt --app-id com.example.app --export-flows ./flows/generated
`);
}

function requireFlagValue(flag: string, next: string | undefined, allowDashValue = false): string | undefined {
  if (next === undefined || (!allowDashValue && next.startsWith("-"))) {
    return `Error: Missing value for ${flag}.`;
  }
  return undefined;
}

export function parseExploreFlags(argv: string[]): ExploreFlags {
  const flags: ExploreFlags = {
    noPrompt: false,
    help: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--no-prompt") {
      flags.noPrompt = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--mode") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      if (!VALID_MODES.includes(next as ExplorationMode)) {
        flags.error = `Error: Invalid mode "${next}". Valid: ${VALID_MODES.join(", ")}`;
        return flags;
      }
      flags.mode = next as ExplorationMode;
      i++;
    } else if (arg === "--app-id") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      flags.appId = next;
      i++;
    } else if (arg === "--platform") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      if (!VALID_PLATFORMS.includes(next as ExplorerPlatform)) {
        flags.error = `Error: Invalid platform "${next}". Valid: ${VALID_PLATFORMS.join(", ")}`;
        return flags;
      }
      flags.platform = next as ExplorerPlatform;
      i++;
    } else if (arg === "--max-depth") {
      const missing = requireFlagValue(arg, next, true);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      const val = parseInt(next!, 10);
      if (isNaN(val) || val < 1) {
        flags.error = "Error: --max-depth must be a positive integer";
        return flags;
      }
      flags.maxDepth = val;
      i++;
    } else if (arg === "--timeout-ms") {
      const missing = requireFlagValue(arg, next, true);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      const val = parseInt(next!, 10);
      if (isNaN(val) || val < 1000) {
        flags.error = "Error: --timeout-ms must be at least 1000";
        return flags;
      }
      flags.timeoutMs = val;
      i++;
    } else if (arg === "--config") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      flags.configPath = next;
      i++;
    } else if (arg === "--output") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      flags.output = next;
      i++;
    } else if (arg === "--run-id") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      const trimmed = next!.trim();
      if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
        flags.error = `Error: Invalid --run-id "${next}": must be a single path-safe segment.`;
        return flags;
      }
      flags.runId = trimmed;
      i++;
    } else if (arg === "--compare") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      flags.compare = next;
      i++;
    } else if (arg === "--export-flows") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      flags.exportFlows = next;
      i++;
    } else if (arg === "--device-id") {
      const missing = requireFlagValue(arg, next);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      flags.deviceId = next;
      i++;
    } else if (arg === "--launch-env") {
      const missing = requireFlagValue(arg, next, true);
      if (missing) {
        flags.error = missing;
        return flags;
      }
      const eqIdx = next!.indexOf("=");
      if (eqIdx <= 0) {
        flags.error = "Error: --launch-env must be in KEY=VALUE format";
        return flags;
      }
      const key = next!.slice(0, eqIdx);
      const value = next!.slice(eqIdx + 1);
      flags.launchEnv = { ...(flags.launchEnv ?? {}), [key]: value };
      i++;
    } else if (arg.startsWith("-")) {
      flags.error = `Error: Unknown option "${arg}". Use --help for usage.`;
      return flags;
    } else {
      flags.error = `Error: Unexpected positional argument "${arg}". Use --help for usage.`;
      return flags;
    }
  }

  return flags;
}

/**
 * Main explore entry point called from the mcp-server CLI.
 *
 * @param argv — process.argv slice (after 'explore' subcommand)
 * @param server — the MCP server instance
 */
export async function explore(argv: string[], server: InvokableServer): Promise<void> {
  const flags = parseExploreFlags(argv);

  if (flags.help) {
    printHelp();
    return;
  }

  if (flags.error) {
    console.error(flags.error);
    process.exitCode = 2;
    return;
  }

  // Build overrides from flags
  const overrides: Partial<ExplorerConfig> = {};
  if (flags.mode) overrides.mode = flags.mode;
  if (flags.appId) overrides.appId = flags.appId;
  if (flags.platform) overrides.platform = flags.platform;
  if (flags.maxDepth !== undefined) overrides.maxDepth = flags.maxDepth;
  if (flags.timeoutMs !== undefined) overrides.timeoutMs = flags.timeoutMs;
  if (flags.output) overrides.reportDir = flags.output;
  if (flags.compare !== undefined) overrides.compareWith = flags.compare;
  if (flags.deviceId) overrides.deviceId = flags.deviceId;

  // Try to load saved config
  const savedConfig = loadConfig(flags.configPath);

  // Run interview unless --no-prompt is set
  let finalConfig: ExplorerConfig;
  if (flags.noPrompt) {
    finalConfig = buildDefaultConfig({ ...overrides });
    // Merge with saved config if available
    if (savedConfig) {
      finalConfig = { ...finalConfig, ...savedConfig, ...overrides };
    }
  } else {
    finalConfig = await runInterview(savedConfig, overrides);
  }

  // Validate appId
  if (!finalConfig.appId) {
    console.error("Error: --app-id is required. Use --help for usage.");
    process.exitCode = 2;
    return;
  }

  // Save the config for future reuse only for interactive runs or default local config.
  // Never overwrite an explicitly provided --config file during --no-prompt runs
  // (e.g. checked-in project rule registry configs).
  if (!(flags.noPrompt && flags.configPath)) {
    const { launchEnv: _omitLaunchEnv, ...persistableConfig } = finalConfig;
    const store = new ConfigStore(flags.configPath);
    store.save(persistableConfig);
  }

  // Run the exploration
  const result = await runExplore(server, {
    ...finalConfig,
    deviceId: flags.deviceId ?? finalConfig.deviceId,
    launchEnv: flags.launchEnv,
    configPath: flags.configPath,
    skipInterview: flags.noPrompt,
    exportFlows: flags.exportFlows,
    runId: flags.runId,
    quiet: flags.json,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  process.exitCode = result.exitCode;
}

function printSummary(result: ExplorerResult): void {
  console.log("\n" + "=".repeat(50));
  console.log("  Explorer Session Summary");
  console.log("=".repeat(50));
  console.log(`  Status:       ${result.success ? "COMPLETE" : "INCOMPLETE"}`);
  console.log(`  Stage:        ${result.stage}`);
  if (result.runId) {
    console.log(`  Run ID:       ${result.runId}`);
  }
  console.log(`  Pages:        ${result.visitedPages}`);
  console.log(`  Failures:     ${result.failedCount}`);
  console.log(`  Duration:     ${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.reportHtmlPath) {
    console.log(`  HTML Report:  ${result.reportHtmlPath}`);
  }
  if (result.summaryJsonPath) {
    console.log(`  Summary JSON: ${result.summaryJsonPath}`);
  }
  if (result.latestJsonPath) {
    console.log(`  Latest:       ${result.latestJsonPath}`);
  }
  if (result.reportPath) {
    console.log(`  Report:       ${result.reportPath}`);
  }
  if (result.exportedFlows) {
    console.log(`  Flows:        ${result.exportedFlows.length} exported (${result.exportedFlows.join(", ")})`);
  }
  if (result.error) {
    console.log(`  Error:        ${result.error}`);
  }
  console.log("=".repeat(50));
}
