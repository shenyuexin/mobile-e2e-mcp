import { readFileSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import {
  TOOL_NAMES,
  type ExplainLastFailureData,
  type ExplainLastFailureInput,
  type InspectUiData,
  type Platform,
  type RecordScreenData,
  type RecordScreenInput,
  type RunFlowData,
  type RunFlowInput,
  type RunnerProfile,
  type StartSessionInput,
  type SuggestKnownRemediationData,
  type SuggestKnownRemediationInput,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import type { MobileE2EMcpServer } from "../server.js";
import { loadProjectConfig } from "./project-config.js";
import { buildSelectorHealProposal, type SelectorHealProposal } from "./selector-heal.js";

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
  /** Record the run and discard the video on pass, keep it on failure. */
  recordOnFailure: boolean;
  /** Output path used by record_screen start/stop. */
  recordOutput?: string;
  /** Produce proposal-only selector heal suggestions when run_flow fails. */
  suggestHeal: boolean;
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
  --record-on-failure           Record the run; discard on pass, preserve video on failure
  --record-output <path>        Output path passed to record_screen start/stop
  --suggest-heal                On failure, emit proposal-only selector heal diff (never edits flow files)
  --json                        Print full structured JSON payload
  --help, -h                    Show this help message`);
}

export function parseRunArgs(argv: string[]): RunCommandOptions {
  const options: RunCommandOptions = {
    runCount: 1,
    dryRun: false,
    json: false,
    help: false,
    recordOnFailure: false,
    suggestHeal: false,
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
    } else if (arg === "--record-on-failure") {
      options.recordOnFailure = true;
    } else if (arg === "--record-output" && next) {
      options.recordOutput = next;
      i += 1;
    } else if (arg === "--suggest-heal") {
      options.suggestHeal = true;
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

  // Failure-only recording: start before run_flow, stop in a finally block.
  // A pass discards the video; a failure preserves it as evidence.
  const recordStartResult: ToolResult<RecordScreenData> | undefined =
    options.recordOnFailure && !options.dryRun
      ? await server.invoke(TOOL_NAMES.recordScreen, {
          sessionId,
          platform,
          mode: "start",
          ...(options.recordOutput ? { outputPath: options.recordOutput } : {}),
          ...(deviceId ? { deviceId } : {}),
        } satisfies RecordScreenInput)
      : undefined;
  const recordingId = recordStartResult?.data?.recordingId;

  let recordStopResult: ToolResult<RecordScreenData> | undefined;
  let runResult: ToolResult<RunFlowData> | undefined;
  try {
    runResult = await server.invoke(TOOL_NAMES.runFlow, runInput);
  } finally {
    if (recordStartResult) {
      recordStopResult = await server.invoke(TOOL_NAMES.recordScreen, {
        sessionId,
        platform,
        mode: "stop",
        discardOnStop: runResult?.status !== "failed",
        ...(recordingId ? { recordingId } : {}),
        ...(options.recordOutput ? { outputPath: options.recordOutput } : {}),
      } satisfies RecordScreenInput);
    }
  }

  if (!runResult) {
    // run_flow threw; the recording was stopped in finally and preserved.
    return 1;
  }

  const failed = runResult.status === "failed";
  let healProposal: SelectorHealProposal | undefined;
  if (failed && options.suggestHeal) {
    const explainResult: ToolResult<ExplainLastFailureData> = await server.invoke(
      TOOL_NAMES.explainLastFailure,
      { sessionId } satisfies ExplainLastFailureInput,
    );
    const remediationResult: ToolResult<SuggestKnownRemediationData> = await server.invoke(
      TOOL_NAMES.suggestKnownRemediation,
      {
        sessionId,
        platform,
        ...(explainResult.data?.actionId ? { actionId: explainResult.data.actionId } : {}),
      } satisfies SuggestKnownRemediationInput,
    );
    let originalFlowText: string | undefined;
    if (flowPath) {
      try {
        originalFlowText = readFileSync(resolve(cwd, flowPath), "utf-8");
      } catch {
        // The proposal is still useful when the flow file is unavailable.
      }
    }

    // inspect_ui is a read-only query; failures are tolerated (best-effort evidence).
    let inspectResult: ToolResult<InspectUiData> | undefined;
    try {
      inspectResult = await server.invoke(TOOL_NAMES.inspectUi, {
        sessionId,
        platform,
        ...(deviceId ? { deviceId } : {}),
        ...(appId ? { appId } : {}),
      });
    } catch {
      inspectResult = undefined;
    }

    healProposal = buildSelectorHealProposal({
      flowPath,
      originalFlowText,
      explainResult,
      remediationResult,
      inspectResult,
    });
  }

  const recordingArtifacts = recordStopResult?.artifacts ?? [];
  const endResult = await server.invoke(TOOL_NAMES.endSession, {
    sessionId,
    artifacts: Array.from(new Set([...runResult.artifacts, ...recordingArtifacts])),
  });

  const recording = {
    enabled: Boolean(recordStartResult),
    dryRunSkipped: options.recordOnFailure && options.dryRun,
    recordingId,
    discarded: recordStopResult?.data?.discarded ?? false,
    outputPath: recordStopResult?.data?.outputPath ?? options.recordOutput ?? null,
    status: recordStopResult?.status ?? "not_started",
  };

  if (options.json) {
    console.log(JSON.stringify({
      startResult,
      runResult,
      recordStartResult,
      recordStopResult,
      recording,
      ...(healProposal ? { healProposal } : {}),
      endResult,
    }, null, 2));
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
    if (recordStartResult) {
      console.log(
        `  recording: ${recording.discarded ? "discarded (pass)" : `saved: ${recording.outputPath ?? "unknown"}`}`,
      );
    } else if (recording.dryRunSkipped) {
      console.log("  recording: skipped under --dry-run");
    }
    if (healProposal) {
      console.log("  heal proposal: PROPOSAL ONLY — no flow file was modified");
      console.log(healProposal.unifiedDiff);
    }
    if (runResult.nextSuggestions.length > 0) {
      console.log("  nextSuggestions:");
      for (const suggestion of runResult.nextSuggestions) {
        console.log(`    - ${suggestion}`);
      }
    }
  }

  return failed ? 1 : 0;
}
