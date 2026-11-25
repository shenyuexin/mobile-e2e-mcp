import process from "node:process";
import {
  TOOL_NAMES,
  type Platform,
  type RunFlowInput,
  type RunnerProfile,
  type StartSessionInput,
} from "@mobile-e2e-mcp/contracts";
import type { MobileE2EMcpServer } from "../server.js";
import { loadProjectConfig } from "./project-config.js";

export interface RunCommandOptions {
  flowPath?: string;
  platform?: Platform;
  deviceId?: string;
  appId?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  harnessConfigPath?: string;
  configPath?: string;
  sessionId?: string;
  runCount: number;
  dryRun: boolean;
  json: boolean;
  help: boolean;
  error?: string;
}

const VALID_RUNNER_PROFILES: readonly RunnerProfile[] = [
  "phase1",
  "native_android",
  "native_ios",
  "flutter_android",
];

function printRunHelp(): void {
  console.log(`Usage: mobile-e2e-mcp run [flowPath] [options]

Execute a deterministic Maestro flow inside a governed mobile-e2e-mcp session.
Reads defaults from .e2e/config.yaml when present.

Options:
  --flow-path <path>            Flow YAML path (or pass as first positional arg)
  --platform <ios|android>      Target platform
  --device-id <id>              Target device ID or simulator UDID
  --app-id <id>                 Target app bundle ID / package name
  --runner-profile <profile>    phase1 | native_android | native_ios | flutter_android
  --policy-profile <profile>    Policy profile (e.g. interactive)
  --harness-config-path <path>  Override harness YAML path
  --config <path>               Project config path (default: .e2e/config.yaml)
  --run-count <n>               Number of runs (default: 1)
  --session-id <id>             Explicit session ID
  --dry-run                     Validate & build flow command without device side effects
  --json                        Print full structured JSON payload
  --help, -h                    Show this help message`);
}

export function parseRunArgs(argv: string[]): RunCommandOptions {
  const options: RunCommandOptions = {
    runCount: 1,
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
    } else if (arg === "--flow-path" && next) {
      options.flowPath = next;
      i += 1;
    } else if (arg === "--platform" && next) {
      if (next !== "ios" && next !== "android") {
        options.error = `Invalid --platform "${next}". Expected "ios" or "android".`;
        return options;
      }
      options.platform = next;
      i += 1;
    } else if (arg === "--device-id" && next) {
      options.deviceId = next;
      i += 1;
    } else if (arg === "--app-id" && next) {
      options.appId = next;
      i += 1;
    } else if (arg === "--runner-profile" && next) {
      if (!VALID_RUNNER_PROFILES.includes(next as RunnerProfile)) {
        options.error = `Invalid --runner-profile "${next}". Expected one of: ${VALID_RUNNER_PROFILES.join(", ")}.`;
        return options;
      }
      options.runnerProfile = next as RunnerProfile;
      i += 1;
    } else if (arg === "--policy-profile" && next) {
      options.policyProfile = next;
      i += 1;
    } else if (arg === "--harness-config-path" && next) {
      options.harnessConfigPath = next;
      i += 1;
    } else if (arg === "--config" && next) {
      options.configPath = next;
      i += 1;
    } else if (arg === "--session-id" && next) {
      options.sessionId = next;
      i += 1;
    } else if (arg === "--run-count" && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 1) {
        options.error = `Invalid --run-count "${next}". Expected a positive integer.`;
        return options;
      }
      options.runCount = Math.floor(parsed);
      i += 1;
    } else if (!arg.startsWith("-") && !options.flowPath) {
      options.flowPath = arg;
    }
  }

  return options;
}

export async function executeRun(
  server: MobileE2EMcpServer,
  argv: string[],
  cwd: string = process.cwd(),
): Promise<number> {
  const options = parseRunArgs(argv);
  if (options.help) {
    printRunHelp();
    return 0;
  }
  if (options.error) {
    console.error(options.error);
    return 2;
  }

  const loadedConfig = await loadProjectConfig(cwd, options.configPath);
  const projectConfig = loadedConfig?.config;

  const platform: Platform = options.platform ?? projectConfig?.platform ?? "android";
  const flowPath = options.flowPath ?? projectConfig?.flowPath;
  const runnerProfile = options.runnerProfile ?? projectConfig?.runnerProfile;
  const policyProfile = options.policyProfile ?? projectConfig?.policyProfile;
  const deviceId = options.deviceId ?? projectConfig?.deviceId;
  const appId = options.appId ?? projectConfig?.appId;
  const harnessConfigPath = options.harnessConfigPath ?? projectConfig?.harnessConfigPath;

  const startInput: StartSessionInput = {
    platform,
    profile: runnerProfile ?? null,
    policyProfile,
    harnessConfigPath,
    sessionId: options.sessionId,
    deviceId,
    appId,
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
  const runInput: RunFlowInput = {
    sessionId,
    platform,
    runnerProfile,
    runCount: options.runCount,
    dryRun: options.dryRun,
    flowPath,
    harnessConfigPath,
  };

  const runResult = await server.invoke(TOOL_NAMES.runFlow, runInput);
  const endResult = await server.invoke(TOOL_NAMES.endSession, {
    sessionId,
    artifacts: runResult.artifacts,
  });

  if (options.json) {
    console.log(JSON.stringify({ startResult, runResult, endResult }, null, 2));
  } else {
    console.log(`mobile-e2e-mcp run — status: ${runResult.status} (${runResult.reasonCode})`);
    console.log(`  sessionId: ${sessionId}`);
    console.log(`  platform:  ${platform}`);
    if (flowPath) {
      console.log(`  flowPath:  ${flowPath}`);
    }
    console.log(`  duration:  ${runResult.durationMs}ms`);
    if (runResult.artifacts.length > 0) {
      console.log(`  artifacts: ${runResult.artifacts.join(", ")}`);
    }
    if (runResult.nextSuggestions.length > 0) {
      console.log("  nextSuggestions:");
      for (const suggestion of runResult.nextSuggestions) {
        console.log(`    - ${suggestion}`);
      }
    }
  }

  return runResult.status === "failed" ? 1 : 0;
}
