import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REASON_CODES,
  type Platform,
  type ReasonCode,
  type RunFlowInput,
  type RunnerProfile,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { parse } from "yaml";

interface ArtifactDirectory {
  absolutePath: string;
  relativePath: string;
}

interface HarnessSelection {
  runnerProfile: RunnerProfile;
  runnerScript: string;
  deviceId?: string;
  appId: string;
  launchUrl?: string;
  runCountDefault: number;
  configuredFlows: string[];
}

interface CommandExecution {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface BasicRunData {
  dryRun: boolean;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  artifactsDir: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  command: string[];
  exitCode: number | null;
  summaryLine?: string;
}

const DEFAULT_HARNESS_CONFIG_PATH = "configs/harness/sample-harness.yaml";
const DEFAULT_RUNNER_PROFILE: RunnerProfile = "phase1";
const DEFAULT_FLOWS: Record<Platform, string> = {
  android: "flows/samples/react-native/android-login-smoke.yaml",
  ios: "flows/samples/react-native/ios-login-smoke.yaml",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function toRelativePath(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function ensureRunnerProfilePlatform(platform: Platform, runnerProfile: RunnerProfile): void {
  if (runnerProfile === "native_ios" && platform !== "ios") {
    throw new Error(`Runner profile ${runnerProfile} requires platform ios.`);
  }

  if ((runnerProfile === "native_android" || runnerProfile === "flutter_android") && platform !== "android") {
    throw new Error(`Runner profile ${runnerProfile} requires platform android.`);
  }
}

async function listArtifacts(rootPath: string, repoRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listArtifacts(entryPath, repoRoot)));
      } else {
        files.push(toRelativePath(repoRoot, entryPath));
      }
    }

    return files.sort();
  } catch {
    return [];
  }
}

async function parseHarnessConfig(repoRoot: string, harnessConfigPath: string): Promise<Record<string, unknown>> {
  const absoluteConfigPath = path.resolve(repoRoot, harnessConfigPath);
  const rawConfig = await readFile(absoluteConfigPath, "utf8");
  const parsedConfig: unknown = parse(rawConfig);

  if (!isRecord(parsedConfig)) {
    throw new Error(`Invalid harness config structure: ${harnessConfigPath}`);
  }

  return parsedConfig;
}

function loadPlatformDefaults(parsedConfig: Record<string, unknown>, platform: Platform, harnessConfigPath: string): Record<string, unknown> {
  const platforms = parsedConfig.platforms;
  if (!isRecord(platforms)) {
    throw new Error(`Missing platforms section in harness config: ${harnessConfigPath}`);
  }

  const platformConfig = platforms[platform];
  if (!isRecord(platformConfig)) {
    throw new Error(`Missing platform config for ${platform} in ${harnessConfigPath}`);
  }

  return platformConfig;
}

async function loadHarnessSelection(
  repoRoot: string,
  platform: Platform,
  runnerProfile: RunnerProfile,
  harnessConfigPath: string,
): Promise<HarnessSelection> {
  ensureRunnerProfilePlatform(platform, runnerProfile);
  const parsedConfig = await parseHarnessConfig(repoRoot, harnessConfigPath);
  const platformDefaults = loadPlatformDefaults(parsedConfig, platform, harnessConfigPath);

  if (runnerProfile === "phase1") {
    const runnerScript = readNonEmptyString(platformDefaults, "runner_script");
    const deviceId = readNonEmptyString(platformDefaults, "device_udid");
    const appId = readNonEmptyString(platformDefaults, "app_id");
    const launchUrl = readNonEmptyString(platformDefaults, "launch_url");
    const runCountDefault = readPositiveNumber(platformDefaults, "run_count_default") ?? 1;

    if (!runnerScript || !deviceId || !appId) {
      throw new Error(`Incomplete phase1 config for ${platform} in ${harnessConfigPath}`);
    }

    return {
      runnerProfile,
      runnerScript,
      deviceId,
      appId,
      launchUrl,
      runCountDefault,
      configuredFlows: [DEFAULT_FLOWS[platform]],
    };
  }

  const phase3Validations = parsedConfig.phase3_validations;
  if (!isRecord(phase3Validations)) {
    throw new Error(`Missing phase3_validations section in harness config: ${harnessConfigPath}`);
  }

  const profileConfig = phase3Validations[runnerProfile];
  if (!isRecord(profileConfig)) {
    throw new Error(`Missing runner profile ${runnerProfile} in ${harnessConfigPath}`);
  }

  const runnerScript = readNonEmptyString(profileConfig, "runner_script");
  const appId = readNonEmptyString(profileConfig, "app_id");
  const runCountDefault = readPositiveNumber(profileConfig, "run_count_default") ?? 1;
  const configuredFlows = readStringArray(profileConfig, "flows");
  const deviceId = readNonEmptyString(platformDefaults, "device_udid");

  if (!runnerScript || !appId || configuredFlows.length === 0) {
    throw new Error(`Incomplete runner profile ${runnerProfile} in ${harnessConfigPath}`);
  }

  return {
    runnerProfile,
    runnerScript,
    deviceId,
    appId,
    runCountDefault,
    configuredFlows,
  };
}

export function resolveRepoPath(startPath?: string): string {
  let currentPath = startPath ?? path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const hasRepoMarkers = [
      path.join(currentPath, "scripts", "dev"),
      path.join(currentPath, "flows"),
      path.join(currentPath, "configs"),
    ].every((candidate) => existsSync(candidate));

    if (hasRepoMarkers) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error("Unable to resolve repository root from adapter-maestro.");
    }
    currentPath = parentPath;
  }
}

export function buildArtifactsDir(
  repoRoot: string,
  sessionId: string,
  platform: Platform,
  runnerProfile: RunnerProfile,
  artifactRoot?: string,
): ArtifactDirectory {
  if (artifactRoot && path.isAbsolute(artifactRoot)) {
    throw new Error("artifactRoot must be relative to the repository root.");
  }

  const relativePath = artifactRoot ?? path.posix.join("artifacts", "mcp-server", sessionId, platform, runnerProfile);
  return {
    absolutePath: path.resolve(repoRoot, relativePath),
    relativePath,
  };
}

function buildFailureReason(stderr: string, exitCode: number | null): ReasonCode {
  const combined = stderr.toLowerCase();
  if (combined.includes("install_failed_version_downgrade") || combined.includes("failed to install")) {
    return REASON_CODES.configurationError;
  }
  if (combined.includes("maestro") && combined.includes("not found")) {
    return REASON_CODES.adapterError;
  }
  if (combined.includes("adb") || combined.includes("simctl") || combined.includes("device")) {
    return REASON_CODES.deviceUnavailable;
  }
  if (exitCode === 0) {
    return REASON_CODES.flowFailed;
  }
  return REASON_CODES.adapterError;
}

async function executeRunner(command: string[], repoRoot: string, env: NodeJS.ProcessEnv): Promise<CommandExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function readRunCounts(artifactsDir: string): Promise<{ totalRuns: number; passedRuns: number; failedRuns: number }> {
  try {
    const entries = await readdir(artifactsDir, { withFileTypes: true });
    let totalRuns = 0;
    let passedRuns = 0;
    let failedRuns = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("run-")) {
        continue;
      }

      totalRuns += 1;
      const resultPath = path.join(artifactsDir, entry.name, "result.txt");
      try {
        const result = (await readFile(resultPath, "utf8")).trim();
        if (result === "PASS") {
          passedRuns += 1;
        } else {
          failedRuns += 1;
        }
      } catch {
        failedRuns += 1;
      }
    }

    return { totalRuns, passedRuns, failedRuns };
  } catch {
    return { totalRuns: 0, passedRuns: 0, failedRuns: 0 };
  }
}

export async function collectBasicRunResult(params: {
  repoRoot: string;
  sessionId: string;
  durationMs: number;
  attempts: number;
  artifactsDir: ArtifactDirectory;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  command: string[];
  dryRun: boolean;
  execution?: CommandExecution;
  unsupportedCustomFlow?: boolean;
}): Promise<ToolResult<BasicRunData>> {
  const { totalRuns, passedRuns, failedRuns } = await readRunCounts(params.artifactsDir.absolutePath);
  const artifacts = await listArtifacts(params.artifactsDir.absolutePath, params.repoRoot);

  let status: ToolResult<BasicRunData>["status"] = "success";
  let reasonCode: ReasonCode = REASON_CODES.ok;
  const nextSuggestions: string[] = [];

  if (params.unsupportedCustomFlow) {
    status = "partial";
    reasonCode = REASON_CODES.unsupportedOperation;
    nextSuggestions.push("The selected runner profile bundles predefined flows. Omit flowPath or pass a custom runnerScript if you need exact single-flow control.");
  } else if (params.dryRun) {
    nextSuggestions.push("Run the same command without --dry-run to execute the underlying sample runner.");
  } else if (params.execution && params.execution.exitCode !== 0) {
    status = "failed";
    reasonCode = buildFailureReason(params.execution.stderr, params.execution.exitCode);
    nextSuggestions.push("Check command.stderr.log and command.stdout.log under the artifacts directory for the runner failure details.");
    if (reasonCode === REASON_CODES.configurationError) {
      nextSuggestions.push("The current app install failed. Remove the installed app or provide a newer build artifact before retrying.");
    }
  } else if (totalRuns === 0) {
    status = "partial";
    reasonCode = REASON_CODES.adapterError;
    nextSuggestions.push("The runner completed without producing run-* results. Verify the selected script still writes artifacts in the expected layout.");
  } else if (failedRuns > 0) {
    status = "failed";
    reasonCode = REASON_CODES.flowFailed;
    nextSuggestions.push("Inspect per-run result.txt and maestro.out artifacts to determine why the sample flow failed.");
  }

  if (params.configuredFlows.length > 1) {
    nextSuggestions.push("This runner profile executes a bundled validation set defined in configs/harness/sample-harness.yaml.");
  }

  return {
    status,
    reasonCode,
    sessionId: params.sessionId,
    durationMs: params.durationMs,
    attempts: params.attempts,
    artifacts,
    data: {
      dryRun: params.dryRun,
      harnessConfigPath: params.harnessConfigPath,
      runnerProfile: params.runnerProfile,
      runnerScript: params.runnerScript,
      flowPath: params.flowPath,
      requestedFlowPath: params.requestedFlowPath,
      configuredFlows: params.configuredFlows,
      artifactsDir: params.artifactsDir.relativePath,
      totalRuns,
      passedRuns,
      failedRuns,
      command: params.command,
      exitCode: params.execution?.exitCode ?? 0,
      summaryLine: params.execution?.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1),
    },
    nextSuggestions,
  };
}

export async function runFlowWithMaestro(input: RunFlowInput): Promise<ToolResult<BasicRunData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const harnessConfigPath = input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, input.platform, runnerProfile, harnessConfigPath);
  const requestedFlowPath = input.flowPath;
  const unsupportedCustomFlow = Boolean(
    !input.runnerScript && requestedFlowPath && (selection.configuredFlows.length > 1 || !selection.configuredFlows.includes(requestedFlowPath)),
  );
  const effectiveFlowPath = requestedFlowPath ?? selection.configuredFlows[0];
  const runnerScript = input.runnerScript ?? selection.runnerScript;
  const artifactsDir = buildArtifactsDir(repoRoot, input.sessionId, input.platform, runnerProfile, input.artifactRoot);
  const absoluteRunnerScript = path.resolve(repoRoot, runnerScript);
  const runCount = input.runCount ?? selection.runCountDefault;
  const command = ["bash", toRelativePath(repoRoot, absoluteRunnerScript), String(runCount)];

  await mkdir(artifactsDir.absolutePath, { recursive: true });

  if (unsupportedCustomFlow || input.dryRun) {
    return collectBasicRunResult({
      repoRoot,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifactsDir,
      harnessConfigPath,
      runnerProfile,
      runnerScript,
      flowPath: effectiveFlowPath,
      requestedFlowPath,
      configuredFlows: selection.configuredFlows,
      command,
      dryRun: Boolean(input.dryRun),
      unsupportedCustomFlow,
    });
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(input.env ?? {}),
    OUT_DIR: artifactsDir.absolutePath,
    APP_ID: input.appId ?? selection.appId,
    FLOW: path.resolve(repoRoot, effectiveFlowPath),
  };

  if (input.platform === "android") {
    env.DEVICE_ID = input.deviceId ?? selection.deviceId ?? "emulator-5554";
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  } else {
    env.SIM_UDID = input.deviceId ?? selection.deviceId ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
    if (selection.launchUrl || input.launchUrl) {
      env.EXPO_URL = input.launchUrl ?? selection.launchUrl;
    }
  }

  const execution = await executeRunner(["bash", absoluteRunnerScript, String(runCount)], repoRoot, env);

  await writeFile(path.join(artifactsDir.absolutePath, "command.stdout.log"), execution.stdout, "utf8");
  await writeFile(path.join(artifactsDir.absolutePath, "command.stderr.log"), execution.stderr, "utf8");

  return collectBasicRunResult({
    repoRoot,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifactsDir,
    harnessConfigPath,
    runnerProfile,
    runnerScript,
    flowPath: effectiveFlowPath,
    requestedFlowPath,
    configuredFlows: selection.configuredFlows,
    command,
    dryRun: false,
    execution,
  });
}
