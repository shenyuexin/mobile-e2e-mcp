import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import type { Platform, RunnerProfile } from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_PROJECT_CONFIG_PATH,
  serializeProjectConfigYaml,
  type ProjectE2EConfig,
} from "./project-config.js";
import { detectProject, type DetectedProject } from "./project-detector.js";

export interface InitCommandOptions {
  appId?: string;
  platform?: Platform;
  deviceId?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  flowPath?: string;
  outputPath?: string;
  noPrompt: boolean;
  force: boolean;
  json: boolean;
  help: boolean;
  /** undefined = not specified; true/false = explicit smoke-flow choice. */
  smokeFlow?: boolean;
  error?: string;
}

const VALID_RUNNER_PROFILES: readonly RunnerProfile[] = [
  "phase1",
  "native_android",
  "native_ios",
  "flutter_android",
];

function printInitHelp(): void {
  console.log(`Usage: mobile-e2e-mcp init [options]

Scaffold a lightweight .e2e/config.yaml in the current workspace.
Project files are auto-detected (Android / iOS / React Native / Expo / Flutter) to prefill defaults.

Options:
  --app-id <id>             Application bundle ID / package name
  --platform <ios|android>  Default target platform (default: android)
  --device-id <id>          Default simulator UDID or Android serial
  --runner-profile <name>   phase1 | native_android | native_ios | flutter_android
  --policy-profile <name>   Default policy profile (e.g. interactive, read-only)
  --flow-path <path>        Default flow YAML path for "mobile-e2e-mcp run"
  --with-smoke-flow         Scaffold a starter smoke flow and set flowPath
  --no-smoke-flow           Explicitly skip smoke flow scaffolding
  --output <path>           Output file path (default: ${DEFAULT_PROJECT_CONFIG_PATH})
  --no-prompt               Do not prompt interactively; use flags and defaults
  --force                   Overwrite existing config file
  --json                    Print JSON output
  --help, -h                Show this help message`);
}

export function parseInitArgs(argv: string[]): InitCommandOptions {
  const options: InitCommandOptions = {
    noPrompt: false,
    force: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--no-prompt") {
      options.noPrompt = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--with-smoke-flow") {
      options.smokeFlow = true;
    } else if (arg === "--no-smoke-flow") {
      options.smokeFlow = false;
    } else if (arg === "--app-id") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      options.appId = next;
      i += 1;
    } else if (arg === "--platform") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      if (next !== "ios" && next !== "android") {
        options.error = `Invalid --platform "${next}". Expected "ios" or "android".`;
        return options;
      }
      options.platform = next;
      i += 1;
    } else if (arg === "--device-id") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      options.deviceId = next;
      i += 1;
    } else if (arg === "--runner-profile") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      if (!VALID_RUNNER_PROFILES.includes(next as RunnerProfile)) {
        options.error = `Invalid --runner-profile "${next}". Expected one of: ${VALID_RUNNER_PROFILES.join(", ")}.`;
        return options;
      }
      options.runnerProfile = next as RunnerProfile;
      i += 1;
    } else if (arg === "--policy-profile") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      options.policyProfile = next;
      i += 1;
    } else if (arg === "--flow-path") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      options.flowPath = next;
      i += 1;
    } else if (arg === "--output") {
      if (!next || next.startsWith("-")) {
        options.error = `Missing value for ${arg}.`;
        return options;
      }
      options.outputPath = next;
      i += 1;
    } else {
      options.error = `Unknown argument "${arg}". Run "mobile-e2e-mcp init --help" for usage.`;
      return options;
    }
  }

  return options;
}

function defaultRunnerProfileForPlatform(platform: Platform): RunnerProfile {
  return platform === "ios" ? "native_ios" : "native_android";
}

function defaultAppIdForPlatform(platform: Platform): string {
  return platform === "ios" ? "com.example.app" : "com.example.app";
}

/** Minimal Maestro smoke flow: launch + explicit settle delay before any UI action. */
function buildSmokeFlowYaml(appId: string): string {
  return [
    `appId: "${appId}"`,
    "---",
    "- launchApp:",
    `    appId: "${appId}"`,
    "    clearState: false",
    "- waitForAnimationToEnd:",
    "    timeout: 3000",
    "  # launch settle 3000ms (ui-stabilization-timing.md)",
    "",
  ].join("\n");
}

async function promptInteractive(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function executeInit(
  argv: string[],
  runtimeOptions: {
    cwd?: string;
    isInteractive?: boolean;
    promptFn?: (question: string) => Promise<string>;
  } = {},
): Promise<{ exitCode: number; outputPath?: string; config?: ProjectE2EConfig }> {
  const parsed = parseInitArgs(argv);
  if (parsed.help) {
    printInitHelp();
    return { exitCode: 0 };
  }
  if (parsed.error) {
    console.error(parsed.error);
    return { exitCode: 2 };
  }

  const cwd = runtimeOptions.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, parsed.outputPath ?? DEFAULT_PROJECT_CONFIG_PATH);

  if (existsSync(targetPath) && !parsed.force) {
    const message = `Config already exists at ${targetPath}. Re-run with --force to overwrite.`;
    if (parsed.json) {
      console.log(JSON.stringify({ ok: false, error: message, outputPath: targetPath }, null, 2));
    } else {
      console.error(message);
    }
    return { exitCode: 1, outputPath: targetPath };
  }

  const interactive = runtimeOptions.isInteractive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const ask = runtimeOptions.promptFn ?? promptInteractive;

  const detected: DetectedProject = detectProject(cwd);
  let platform: Platform = parsed.platform ?? detected.platform ?? "android";
  let appId = parsed.appId ?? detected.appId;
  let runnerProfile: RunnerProfile | undefined = parsed.runnerProfile ?? detected.runnerProfile;
  let deviceId = parsed.deviceId;

  if (interactive && !parsed.noPrompt) {
    if (!parsed.platform && !detected.platform) {
      const answer = await ask("Target platform [ios/android] (android): ");
      if (answer === "ios" || answer === "android") {
        platform = answer;
      }
    }
    if (!appId) {
      const answer = await ask(`App ID / Bundle ID (${defaultAppIdForPlatform(platform)}): `);
      appId = answer || defaultAppIdForPlatform(platform);
    }
    if (!deviceId) {
      const answer = await ask("Default deviceId / simulator UDID (optional, press Enter to skip): ");
      if (answer) {
        deviceId = answer;
      }
    }
  }

  const resolvedAppId = appId ?? defaultAppIdForPlatform(platform);
  const resolvedRunnerProfile = runnerProfile ?? defaultRunnerProfileForPlatform(platform);

  let flowPath = parsed.flowPath;
  let smokeFlowPath: string | undefined;
  if (parsed.smokeFlow === true) {
    smokeFlowPath = path.join(path.dirname(targetPath), "flows", "smoke.yaml");
    await mkdir(path.dirname(smokeFlowPath), { recursive: true });
    if (!existsSync(smokeFlowPath)) {
      await writeFile(smokeFlowPath, buildSmokeFlowYaml(resolvedAppId), "utf8");
    }
    flowPath = path.relative(cwd, smokeFlowPath).split(path.sep).join("/");
  }

  const config: ProjectE2EConfig = {
    version: 1,
    platform,
    appId: resolvedAppId,
    ...(deviceId ? { deviceId } : {}),
    runnerProfile: resolvedRunnerProfile,
    ...(detected.buildCommand ? { buildCommand: detected.buildCommand } : {}),
    policyProfile: parsed.policyProfile ?? "interactive",
    ...(flowPath ? { flowPath } : {}),
    explorer: {
      mode: "scoped",
      output: "./explorer-reports",
    },
  };

  await mkdir(path.dirname(targetPath), { recursive: true });
  const yamlContent = serializeProjectConfigYaml(config);
  await writeFile(targetPath, yamlContent, "utf8");

  if (parsed.json) {
    console.log(JSON.stringify({
      ok: true,
      outputPath: targetPath,
      config,
      detected,
      ...(smokeFlowPath ? { smokeFlowPath } : {}),
    }, null, 2));
  } else {
    console.log(`Created ${path.relative(cwd, targetPath) || targetPath}`);
    if (detected.kind !== "unknown") {
      console.log(`Detected project: ${detected.kind}${detected.appId ? ` (${detected.appId})` : ""}`);
    }
    if (smokeFlowPath) {
      console.log(`Created smoke flow: ${path.relative(cwd, smokeFlowPath) || smokeFlowPath}`);
    }
    console.log("");
    console.log("Next steps:");
    console.log("  1. Check local tools & devices:  mobile-e2e-mcp doctor");
    console.log("  2. Run automatic exploration:    mobile-e2e-mcp explore --no-prompt");
    console.log("  3. Connect your AI agent via MCP (default slim core toolset):");
    console.log('     { "command": "npx", "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest"] }');
  }

  return { exitCode: 0, outputPath: targetPath, config };
}
