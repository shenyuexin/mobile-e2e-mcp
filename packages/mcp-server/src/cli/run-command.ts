import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import path, { dirname, resolve } from "node:path";
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
import { requireCliFlagValue } from "./cli-args.js";
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
  output?: string;
  runCount: number;
  dryRun: boolean;
  failFast: boolean;
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

export interface SingleFlowRunParams {
  cwd: string;
  flowPath?: string;
  platform: Platform;
  deviceId?: string;
  appId?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  harnessConfigPath?: string;
  sessionId?: string;
  runCount: number;
  dryRun: boolean;
  recordOnFailure: boolean;
  recordOutput?: string;
  suggestHeal: boolean;
}

export interface SingleFlowRunOutcome {
  passed: boolean;
  flowPath?: string;
  sessionId?: string;
  startResult: ToolResult<{ sessionId: string }>;
  runResult?: ToolResult<RunFlowData>;
  recordStartResult?: ToolResult<RecordScreenData>;
  recordStopResult?: ToolResult<RecordScreenData>;
  recording: {
    enabled: boolean;
    dryRunSkipped: boolean;
    recordingId?: string;
    discarded: boolean;
    outputPath: string | null;
    status: string;
  };
  healProposal?: SelectorHealProposal;
  endResult?: ToolResult<unknown>;
}

const VALID_RUNNER_PROFILES: readonly RunnerProfile[] = [
  "phase1",
  "native_android",
  "native_ios",
  "flutter_android",
];

function printRunHelp(): void {
  console.log(`Usage: mobile-e2e-mcp run [flowPathOrDir] [options]

Execute a deterministic Maestro flow (or sorted directory of flows) inside a governed mobile-e2e-mcp session.
Reads defaults from .e2e/config.yaml when present.

Options:
  --flow-path <path>            Flow YAML file or directory (or pass as first positional arg)
  --platform <ios|android>      Target platform
  --device-id <id>              Target device ID or simulator UDID
  --app-id <id>                 Target app bundle ID / package name
  --runner-profile <profile>    phase1 | native_android | native_ios | flutter_android
  --policy-profile <profile>    Policy profile (e.g. interactive)
  --harness-config-path <path>  Override harness YAML path
  --config <path>               Project config path (default: .e2e/config.yaml)
  --output <dir>                Write structured run summary (summary.json) and default failure videos here
  --run-count <n>               Number of runs per flow (default: 1)
  --session-id <id>             Explicit session ID (single-flow only)
  --dry-run                     Validate & build flow command without device side effects
  --fail-fast                   Stop remaining flows in a directory run after the first failure
  --record-on-failure           Record each run; discard on pass, preserve video on failure
  --record-output <path>        Output path passed to record_screen start/stop
  --suggest-heal                On failure, emit proposal-only selector heal diff (never edits flow files)
  --json                        Print full structured JSON payload
  --help, -h                    Show this help message`);
}

export function parseRunArgs(argv: string[]): RunCommandOptions {
  const options: RunCommandOptions = {
    runCount: 1,
    dryRun: false,
    failFast: false,
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
    } else if (arg === "--fail-fast") {
      options.failFast = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--record-on-failure") {
      options.recordOnFailure = true;
    } else if (arg === "--suggest-heal") {
      options.suggestHeal = true;
    } else if (arg === "--record-output") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.recordOutput = next;
      i += 1;
    } else if (arg === "--output") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.output = next;
      i += 1;
    } else if (arg === "--flow-path") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.flowPath = next;
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
    } else if (arg === "--harness-config-path") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.harnessConfigPath = next;
      i += 1;
    } else if (arg === "--config") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.configPath = next;
      i += 1;
    } else if (arg === "--session-id") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.sessionId = next;
      i += 1;
    } else if (arg === "--run-count") {
      const missing = requireCliFlagValue(arg, next, true);
      if (missing) {
        options.error = missing;
        return options;
      }
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 1) {
        options.error = `Invalid --run-count "${next}". Expected a positive integer.`;
        return options;
      }
      options.runCount = Math.floor(parsed);
      i += 1;
    } else if (arg.startsWith("-")) {
      options.error = `Unknown option "${arg}". Run "mobile-e2e-mcp run --help" for usage.`;
      return options;
    } else if (!options.flowPath) {
      options.flowPath = arg;
    } else {
      options.error = `Unexpected argument "${arg}". Run "mobile-e2e-mcp run --help" for usage.`;
      return options;
    }
  }

  return options;
}

/** Discover sorted YAML files when `targetPath` is an existing directory. */
export function discoverFlowFiles(
  targetPath: string,
  cwd: string,
): { isDirectory: boolean; files: string[] } {
  const resolved = resolve(cwd, targetPath);
  if (!existsSync(resolved)) {
    return { isDirectory: false, files: [targetPath] };
  }
  if (!statSync(resolved).isDirectory()) {
    return { isDirectory: false, files: [targetPath] };
  }
  const entries = readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => {
      const rel = path.relative(cwd, path.join(resolved, entry.name)).split(path.sep).join("/");
      return rel || entry.name;
    })
    .sort((a, b) => a.localeCompare(b));
  return { isDirectory: true, files: entries };
}

function slugifyFlowPath(flowPath: string): string {
  return path.basename(flowPath).replace(/\.ya?ml$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "flow";
}

/** Execute one Maestro flow inside a governed session lifecycle. */
export async function executeSingleFlow(
  server: MobileE2EMcpServer,
  params: SingleFlowRunParams,
): Promise<SingleFlowRunOutcome> {
  const startInput: StartSessionInput = {
    platform: params.platform,
    profile: params.runnerProfile ?? null,
    policyProfile: params.policyProfile,
    harnessConfigPath: params.harnessConfigPath,
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    appId: params.appId,
  };

  const startResult = await server.invoke(TOOL_NAMES.startSession, startInput);
  if (startResult.status !== "success") {
    return {
      passed: false,
      flowPath: params.flowPath,
      startResult,
      recording: {
        enabled: false,
        dryRunSkipped: params.recordOnFailure && params.dryRun,
        discarded: false,
        outputPath: params.recordOutput ?? null,
        status: "not_started",
      },
    };
  }

  const sessionId = startResult.data.sessionId;
  const runInput: RunFlowInput = {
    sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    runCount: params.runCount,
    dryRun: params.dryRun,
    flowPath: params.flowPath,
    harnessConfigPath: params.harnessConfigPath,
  };

  const recordStartResult: ToolResult<RecordScreenData> | undefined =
    params.recordOnFailure && !params.dryRun
      ? await server.invoke(TOOL_NAMES.recordScreen, {
          sessionId,
          platform: params.platform,
          mode: "start",
          ...(params.recordOutput ? { outputPath: params.recordOutput } : {}),
          ...(params.deviceId ? { deviceId: params.deviceId } : {}),
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
        platform: params.platform,
        mode: "stop",
        discardOnStop: runResult?.status !== "failed",
        ...(recordingId ? { recordingId } : {}),
        ...(params.recordOutput ? { outputPath: params.recordOutput } : {}),
      } satisfies RecordScreenInput);
    }
  }

  const recording = {
    enabled: Boolean(recordStartResult),
    dryRunSkipped: params.recordOnFailure && params.dryRun,
    recordingId,
    discarded: recordStopResult?.data?.discarded ?? false,
    outputPath: recordStopResult?.data?.outputPath ?? params.recordOutput ?? null,
    status: recordStopResult?.status ?? "not_started",
  };

  if (!runResult) {
    return {
      passed: false,
      flowPath: params.flowPath,
      sessionId,
      startResult,
      recordStartResult,
      recordStopResult,
      recording,
    };
  }

  const failed = runResult.status === "failed";
  let healProposal: SelectorHealProposal | undefined;
  if (failed && params.suggestHeal) {
    const explainResult: ToolResult<ExplainLastFailureData> = await server.invoke(
      TOOL_NAMES.explainLastFailure,
      { sessionId } satisfies ExplainLastFailureInput,
    );
    const remediationResult: ToolResult<SuggestKnownRemediationData> = await server.invoke(
      TOOL_NAMES.suggestKnownRemediation,
      {
        sessionId,
        platform: params.platform,
        ...(explainResult.data?.actionId ? { actionId: explainResult.data.actionId } : {}),
      } satisfies SuggestKnownRemediationInput,
    );
    let originalFlowText: string | undefined;
    if (params.flowPath) {
      try {
        originalFlowText = readFileSync(resolve(params.cwd, params.flowPath), "utf-8");
      } catch {
        // The proposal is still useful when the flow file is unavailable.
      }
    }

    let inspectResult: ToolResult<InspectUiData> | undefined;
    try {
      inspectResult = await server.invoke(TOOL_NAMES.inspectUi, {
        sessionId,
        platform: params.platform,
        ...(params.deviceId ? { deviceId: params.deviceId } : {}),
        ...(params.appId ? { appId: params.appId } : {}),
      });
    } catch {
      inspectResult = undefined;
    }

    healProposal = buildSelectorHealProposal({
      flowPath: params.flowPath,
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

  return {
    passed: !failed,
    flowPath: params.flowPath,
    sessionId,
    startResult,
    runResult,
    recordStartResult,
    recordStopResult,
    recording,
    healProposal,
    endResult,
  };
}

function writeSummaryFile(outputDirAbs: string, payload: unknown): string {
  mkdirSync(outputDirAbs, { recursive: true });
  const summaryPath = path.join(outputDirAbs, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(payload, null, 2), "utf-8");
  return summaryPath;
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

  let projectConfig;
  try {
    projectConfig = (await loadProjectConfig(cwd, options.configPath))?.config;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const platform: Platform = options.platform ?? projectConfig?.platform ?? "android";
  const flowTarget = options.flowPath ?? projectConfig?.flowPath;
  const runnerProfile = options.runnerProfile ?? projectConfig?.runnerProfile;
  const policyProfile = options.policyProfile ?? projectConfig?.policyProfile;
  const deviceId = options.deviceId ?? projectConfig?.deviceId;
  const appId = options.appId ?? projectConfig?.appId;
  const harnessConfigPath = options.harnessConfigPath ?? projectConfig?.harnessConfigPath;
  const outputDirAbs = options.output ? resolve(cwd, options.output) : undefined;

  const discovered = flowTarget
    ? discoverFlowFiles(flowTarget, cwd)
    : { isDirectory: false, files: [undefined] as Array<string | undefined> };

  if (discovered.isDirectory && discovered.files.length === 0) {
    console.error(`No .yaml or .yml flow files found in directory "${flowTarget}".`);
    return 2;
  }

  if (discovered.isDirectory) {
    const outcomes: SingleFlowRunOutcome[] = [];
    let failedCount = 0;

    for (let idx = 0; idx < discovered.files.length; idx += 1) {
      const flowFile = discovered.files[idx] ?? "flow.yaml";
      const derivedVideo = outputDirAbs && options.recordOnFailure && !options.recordOutput
        ? path.relative(
            cwd,
            path.join(outputDirAbs, "videos", `${String(idx + 1).padStart(2, "0")}-${slugifyFlowPath(flowFile)}.mp4`),
          ).split(path.sep).join("/")
        : options.recordOutput;
      const outcome = await executeSingleFlow(server, {
        cwd,
        flowPath: flowFile,
        platform,
        deviceId,
        appId,
        runnerProfile,
        policyProfile,
        harnessConfigPath,
        runCount: options.runCount,
        dryRun: options.dryRun,
        recordOnFailure: options.recordOnFailure,
        recordOutput: derivedVideo,
        suggestHeal: options.suggestHeal,
      });
      outcomes.push(outcome);
      if (!outcome.passed) {
        failedCount += 1;
        if (options.failFast) {
          break;
        }
      }
    }

    const passedCount = outcomes.filter((item) => item.passed).length;
    const summaryPayload = {
      mode: "directory",
      flowDir: flowTarget,
      platform,
      totalFlows: outcomes.length,
      passedFlows: passedCount,
      failedFlows: failedCount,
      overallStatus: failedCount === 0 ? "passed" : "failed",
      flows: outcomes,
    };

    const summaryJsonPath = outputDirAbs ? writeSummaryFile(outputDirAbs, summaryPayload) : undefined;

    if (options.json) {
      console.log(JSON.stringify({ ...summaryPayload, ...(summaryJsonPath ? { summaryJsonPath } : {}) }, null, 2));
    } else {
      console.log(`mobile-e2e-mcp run — ${passedCount}/${outcomes.length} flows passed`);
      for (const item of outcomes) {
        const status = item.runResult?.status ?? item.startResult.status;
        const duration = item.runResult?.durationMs ?? 0;
        console.log(`  [${item.passed ? "PASS" : "FAIL"}] ${item.flowPath} (${status}, ${duration}ms)`);
        if (item.recording.enabled && !item.recording.discarded && item.recording.outputPath) {
          console.log(`    video: ${item.recording.outputPath}`);
        }
      }
      if (summaryJsonPath) {
        console.log(`  summary: ${summaryJsonPath}`);
      }
    }

    return failedCount > 0 ? 1 : 0;
  }

  const singleFlowPath = discovered.files[0];
  const singleVideoPath = options.recordOutput ?? (
    outputDirAbs && options.recordOnFailure
      ? path.relative(
          cwd,
          path.join(outputDirAbs, "videos", `${singleFlowPath ? slugifyFlowPath(singleFlowPath) : "run"}.mp4`),
        ).split(path.sep).join("/")
      : undefined
  );

  const outcome = await executeSingleFlow(server, {
    cwd,
    flowPath: singleFlowPath,
    platform,
    deviceId,
    appId,
    runnerProfile,
    policyProfile,
    harnessConfigPath,
    sessionId: options.sessionId,
    runCount: options.runCount,
    dryRun: options.dryRun,
    recordOnFailure: options.recordOnFailure,
    recordOutput: singleVideoPath,
    suggestHeal: options.suggestHeal,
  });

  if (outcome.startResult.status !== "success") {
    if (options.json) {
      console.log(JSON.stringify({ startResult: outcome.startResult }, null, 2));
    } else {
      console.error(`Failed to start session (${outcome.startResult.reasonCode}): ${outcome.startResult.nextSuggestions.join(" | ")}`);
    }
    return 1;
  }

  if (!outcome.runResult) {
    return 1;
  }

  const singlePayload = {
    startResult: outcome.startResult,
    runResult: outcome.runResult,
    recordStartResult: outcome.recordStartResult,
    recordStopResult: outcome.recordStopResult,
    recording: outcome.recording,
    ...(outcome.healProposal ? { healProposal: outcome.healProposal } : {}),
    endResult: outcome.endResult,
  };
  const summaryJsonPath = outputDirAbs ? writeSummaryFile(outputDirAbs, singlePayload) : undefined;

  if (options.json) {
    console.log(JSON.stringify({
      ...singlePayload,
      ...(summaryJsonPath ? { summaryJsonPath } : {}),
    }, null, 2));
  } else {
    const runResult = outcome.runResult;
    console.log(`mobile-e2e-mcp run — status: ${runResult.status} (${runResult.reasonCode})`);
    console.log(`  sessionId: ${outcome.sessionId}`);
    console.log(`  platform:  ${platform}`);
    if (singleFlowPath) {
      console.log(`  flowPath:  ${singleFlowPath}`);
    }
    console.log(`  duration:  ${runResult.durationMs}ms`);
    if (runResult.artifacts.length > 0) {
      console.log(`  artifacts: ${runResult.artifacts.join(", ")}`);
    }
    if (outcome.recordStartResult) {
      console.log(
        `  recording: ${outcome.recording.discarded ? "discarded (pass)" : `saved: ${outcome.recording.outputPath ?? "unknown"}`}`,
      );
    } else if (outcome.recording.dryRunSkipped) {
      console.log("  recording: skipped under --dry-run");
    }
    if (outcome.healProposal) {
      console.log("  heal proposal: PROPOSAL ONLY — no flow file was modified");
      console.log(outcome.healProposal.unifiedDiff);
    }
    if (summaryJsonPath) {
      console.log(`  summary:   ${summaryJsonPath}`);
    }
    if (runResult.nextSuggestions.length > 0) {
      console.log("  nextSuggestions:");
      for (const suggestion of runResult.nextSuggestions) {
        console.log(`    - ${suggestion}`);
      }
    }
  }

  return outcome.passed ? 0 : 1;
}
