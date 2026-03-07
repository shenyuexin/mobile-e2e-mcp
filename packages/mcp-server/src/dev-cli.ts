import process from "node:process";
import type { Platform, RunFlowInput, RunnerProfile, StartSessionInput } from "@mobile-e2e-mcp/contracts";
import { createServer } from "./index.js";

interface CliOptions {
  platform: Platform;
  dryRun: boolean;
  runCount: number;
  runnerProfile?: RunnerProfile;
  flowPath?: string;
  harnessConfigPath?: string;
  sessionId?: string;
}

const RUNNER_PROFILES: RunnerProfile[] = ["phase1", "native_android", "native_ios", "flutter_android"];

function isRunnerProfile(value: string | undefined): value is RunnerProfile {
  return typeof value === "string" && RUNNER_PROFILES.includes(value as RunnerProfile);
}

function parseCliArgs(argv: string[]): CliOptions {
  let platform: Platform = "android";
  let dryRun = false;
  let runCount = 1;
  let runnerProfile: RunnerProfile | undefined;
  let flowPath: string | undefined;
  let harnessConfigPath: string | undefined;
  let sessionId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--platform" && (nextValue === "android" || nextValue === "ios")) {
      platform = nextValue;
      index += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--run-count" && nextValue) {
      const parsed = Number(nextValue);
      if (Number.isFinite(parsed) && parsed > 0) {
        runCount = parsed;
      }
      index += 1;
    } else if (arg === "--runner-profile" && isRunnerProfile(nextValue)) {
      runnerProfile = nextValue;
      index += 1;
    } else if (arg === "--flow-path" && nextValue) {
      flowPath = nextValue;
      index += 1;
    } else if (arg === "--harness-config-path" && nextValue) {
      harnessConfigPath = nextValue;
      index += 1;
    } else if (arg === "--session-id" && nextValue) {
      sessionId = nextValue;
      index += 1;
    }
  }

  return { platform, dryRun, runCount, runnerProfile, flowPath, harnessConfigPath, sessionId };
}

async function main(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const server = createServer();

  const startInput: StartSessionInput = {
    platform: cliOptions.platform,
    profile: cliOptions.runnerProfile ?? null,
    sessionId: cliOptions.sessionId,
  };

  const startResult = await server.invoke("start_session", startInput);

  const runInput: RunFlowInput = {
    sessionId: startResult.data.sessionId,
    platform: cliOptions.platform,
    runnerProfile: cliOptions.runnerProfile,
    runCount: cliOptions.runCount,
    dryRun: cliOptions.dryRun,
    flowPath: cliOptions.flowPath,
    harnessConfigPath: cliOptions.harnessConfigPath,
  };

  const runResult = await server.invoke("run_flow", runInput);
  const endResult = await server.invoke("end_session", {
    sessionId: startResult.data.sessionId,
    artifacts: runResult.artifacts,
  });

  const output = {
    tools: server.listTools(),
    startResult,
    runResult,
    endResult,
  };

  console.log(JSON.stringify(output, null, 2));

  if (runResult.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
