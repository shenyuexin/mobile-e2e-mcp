import type {
  InstallAppData,
  InstallAppInput,
  LaunchAppData,
  LaunchAppInput,
  Platform,
  ResetAppStateData,
  ResetAppStateInput,
  ResetAppStateStrategy,
  RunnerProfile,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { existsSync } from "node:fs";
import {
  buildDefaultDeviceId,
  DEFAULT_ANDROID_APP_ID,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_IOS_APP_ID,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  buildLaunchProcessEnvWithRuntime,
  buildResetPlanWithRuntime,
  buildInstallCommandWithRuntime,
  buildLaunchCommandWithRuntime,
  getInstallArtifactSpec,
  resolveInstallArtifactPath,
} from "./device-runtime.js";
import { buildFailureReason, executeRunner } from "./runtime-shared.js";

const DEFAULT_NATIVE_PROFILE_BY_PLATFORM: Record<Platform, RunnerProfile> = {
  android: "native_android",
  ios: "native_ios",
};

const POSIX_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateLaunchEnv(launchEnv: unknown): string | undefined {
  if (launchEnv === undefined) {
    return undefined;
  }
  if (typeof launchEnv !== "object" || launchEnv === null || Array.isArray(launchEnv)) {
    return "launchEnv must be a plain object mapping environment variable names to string values.";
  }
  for (const [key, value] of Object.entries(launchEnv)) {
    if (!POSIX_ENV_KEY_PATTERN.test(key)) {
      return `Invalid launchEnv key "${key}". Keys must match /^[A-Za-z_][A-Za-z0-9_]*$/.`;
    }
    if (typeof value !== "string") {
      return `Invalid launchEnv value for "${key}". All environment variable values must be strings.`;
    }
  }
  return undefined;
}

export async function launchAppWithRuntime(input: LaunchAppInput): Promise<ToolResult<LaunchAppData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: Boolean(input.dryRun), runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE, appId: input.appId ?? "", launchUrl: input.launchUrl, launchCommand: [], exitCode: null },
      nextSuggestions: ["Provide platform explicitly, or call launch_app with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const launchEnvError = validateLaunchEnv(input.launchEnv);
  if (launchEnvError) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        appId: input.appId ?? "",
        launchUrl: input.launchUrl,
        launchCommand: [],
        exitCode: null,
      },
      nextSuggestions: [
        launchEnvError,
        "Provide launchEnv as a map of valid POSIX environment variable names (/^[A-Za-z_][A-Za-z0-9_]*$/) to string values.",
      ],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const shouldInferNativeProfile =
    !input.runnerProfile &&
    !input.launchUrl &&
    Boolean(input.appId) &&
    input.appId !== DEFAULT_IOS_APP_ID &&
    input.appId !== DEFAULT_ANDROID_APP_ID;
  const runnerProfile = input.runnerProfile
    ?? (shouldInferNativeProfile ? DEFAULT_NATIVE_PROFILE_BY_PLATFORM[platform] : DEFAULT_RUNNER_PROFILE);
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const appId = input.appId ?? selection.appId;
  const launchUrl = input.launchUrl ?? selection.launchUrl;
  const launchArgs = input.launchArgs?.filter((arg) => arg.length > 0);
  const launchEnvKeys = input.launchEnv ? Object.keys(input.launchEnv).sort() : [];
  const hasLaunchEnv = launchEnvKeys.length > 0;

  const launchCommand = buildLaunchCommandWithRuntime(platform, {
    runnerProfile,
    deviceId,
    appId,
    launchUrl,
    launchArgs,
    terminateRunning: input.terminateRunning,
    hasLaunchEnv,
  });
  const launchEnvPlan = buildLaunchProcessEnvWithRuntime(platform, {
    deviceId,
    launchEnv: input.launchEnv,
    baseEnv: process.env,
  });
  const launchDataBase: Omit<LaunchAppData, "dryRun" | "exitCode"> = {
    runnerProfile,
    appId,
    launchUrl,
    launchEnvKeys: launchEnvPlan.appliedKeys.length > 0 ? launchEnvPlan.appliedKeys : undefined,
    launchArgs: launchArgs && launchArgs.length > 0 ? launchArgs : undefined,
    launchCommand,
  };

  if (runnerProfile === "phase1" && !launchUrl) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { ...launchDataBase, dryRun: Boolean(input.dryRun), exitCode: null },
      nextSuggestions: ["Provide launchUrl or ensure the harness config includes a phase1 launch_url before calling launch_app."],
    };
  }

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { ...launchDataBase, dryRun: true, exitCode: 0 },
      nextSuggestions: [
        "Run launch_app without dryRun to perform the actual launch.",
        ...(launchEnvPlan.ignoredReason ? [launchEnvPlan.ignoredReason] : []),
      ],
    };
  }

  const execution = await executeRunner(launchCommand, repoRoot, launchEnvPlan.env);
  return {
    status: execution.exitCode === 0 ? "success" : "failed",
    reasonCode: execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: { ...launchDataBase, dryRun: false, exitCode: execution.exitCode },
    nextSuggestions: [
      ...(execution.exitCode === 0 ? [] : ["Check device/simulator state and launchUrl/appId values before retrying launch_app."]),
      ...(launchEnvPlan.ignoredReason ? [launchEnvPlan.ignoredReason] : []),
    ],
  };
}

export async function installAppWithRuntime(input: InstallAppInput): Promise<ToolResult<InstallAppData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        artifactPath: input.artifactPath,
        installCommand: [],
        exitCode: null,
      },
      nextSuggestions: ["Provide platform explicitly, or call install_app with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;

  if (runnerProfile === "phase1") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        installCommand: [],
        exitCode: null,
      },
      nextSuggestions: ["phase1 relies on Expo Go already being installed. Use doctor to verify launch URL/device readiness instead of install_app."],
    };
  }

  const artifactPath = resolveInstallArtifactPath(repoRoot, runnerProfile, input.artifactPath);
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const installCommand = buildInstallCommandWithRuntime(platform, {
    deviceId: input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform),
    artifactPath: artifactPath ?? "",
  });

  const spec = getInstallArtifactSpec(runnerProfile);
  const exists = artifactPath ? existsSync(artifactPath) : false;
  const artifactMissing = !artifactPath || !spec || !exists;
  if (artifactMissing) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        artifactPath,
        installCommand,
        exitCode: null,
      },
      nextSuggestions: ["Provide a valid artifactPath or set the runner-specific artifact environment variable before calling install_app."],
    };
  }

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        artifactPath,
        installCommand,
        exitCode: 0,
      },
      nextSuggestions: ["Run install_app without dryRun to perform the actual installation."],
    };
  }

  const execution = await executeRunner(installCommand, repoRoot, process.env);
  const status = execution.exitCode === 0 ? "success" : "failed";
  const reasonCode = execution.exitCode === 0 ? REASON_CODES.ok : buildFailureReason(execution.stderr, execution.exitCode);
  const nextSuggestions = execution.exitCode === 0
    ? []
    : [
      "Review the install stderr for downgrade or signature conflicts before retrying.",
      "If the conflict is caused by a differently signed build, manually uninstall the existing app before reinstalling.",
    ];

  return {
    status,
    reasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      artifactPath,
      installCommand,
      exitCode: execution.exitCode,
    },
    nextSuggestions,
  };
}

export async function resetAppStateWithRuntime(input: ResetAppStateInput): Promise<ToolResult<ResetAppStateData>> {
  const startTime = Date.now();
  if (!input.platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile: input.runnerProfile ?? DEFAULT_RUNNER_PROFILE,
        strategy: input.strategy ?? "clear_data",
        appId: input.appId,
        artifactPath: input.artifactPath,
        commandLabels: [],
        commands: [],
        exitCode: null,
        supportLevel: "full",
      },
      nextSuggestions: ["Provide platform explicitly, or call reset_app_state with an active sessionId so MCP can resolve platform from session context."],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(repoRoot, platform, runnerProfile, input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH);
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const appId = input.appId ?? selection.appId;
  const strategy: ResetAppStateStrategy = input.strategy ?? "clear_data";
  const artifactPath = resolveInstallArtifactPath(repoRoot, runnerProfile, input.artifactPath);
  const targetAppId = appId ?? "";
  const resetPlan = buildResetPlanWithRuntime(platform, {
    strategy,
    deviceId,
    appId: targetAppId,
    artifactPath,
  });
  const commandLabels = [...resetPlan.commandLabels];
  const commands = [...resetPlan.commands];

  if (resetPlan.unsupportedReason) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        strategy,
        appId,
        artifactPath,
        commandLabels,
        commands,
        exitCode: null,
        supportLevel: resetPlan.supportLevel,
      },
      nextSuggestions: [resetPlan.unsupportedReason],
    };
  }

  if (!appId && strategy !== "keychain_reset") {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        strategy,
        appId,
        artifactPath,
        commandLabels,
        commands,
        exitCode: null,
        supportLevel: "full",
      },
      nextSuggestions: ["Provide appId or configure app_id in harness config before calling reset_app_state."],
    };
  }
  if (strategy === "uninstall_reinstall") {
    if (!artifactPath || !existsSync(artifactPath)) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: Boolean(input.dryRun),
          runnerProfile,
          strategy,
          appId,
          artifactPath,
          commandLabels,
          commands,
          exitCode: null,
          supportLevel: "full",
        },
        nextSuggestions: ["Provide a valid artifactPath or set runner-specific artifact environment variable before uninstall_reinstall."],
      };
    }
  }

  const supportLevel: "full" | "partial" = resetPlan.supportLevel;

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        strategy,
        appId,
        artifactPath,
        commandLabels,
        commands,
        exitCode: 0,
        supportLevel,
      },
      nextSuggestions: ["Run reset_app_state without dryRun to execute the reset strategy on the target device/simulator."],
    };
  }

  for (const command of commands) {
    const execution = await executeRunner(command, repoRoot, process.env);
    if (execution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(execution.stderr, execution.exitCode),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          strategy,
          appId,
          artifactPath,
          commandLabels,
          commands,
          exitCode: execution.exitCode,
          supportLevel,
        },
        nextSuggestions: ["Reset command failed. Verify device availability, appId/artifactPath, and simulator/device state before retrying reset_app_state."],
      };
    }
  }

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      strategy,
      appId,
      artifactPath,
      commandLabels,
      commands,
      exitCode: 0,
      supportLevel,
    },
    nextSuggestions: [],
  };
}
