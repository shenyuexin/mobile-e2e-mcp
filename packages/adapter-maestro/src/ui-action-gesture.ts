import type {
  InspectUiNode,
  PerformGestureData,
  PerformGestureInput,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import { detectScreenBounds } from "./ui-model.js";
import {
  captureIosUiSnapshot,
  executeUiActionCommand,
  isIosUiSnapshotFailure,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { buildMissingPlatformSuggestion } from "./ui-tool-shared.js";
import {
  DEFAULT_GESTURE_SETTLE_DELAY_MS,
  extractFallbackGestureKind,
  gestureRequiresViewportBounds,
  normalizePerformGesture,
  resolveGestureCoordinates,
} from "./ui-gesture-model.js";

const AXE_INPUT_STOPPED_RETRY_DELAY_MS = 250;
const MAX_FAILED_STDERR_SUMMARY_CHARS = 240;

function isTransientAxeInputStopped(
  command: string[],
  execution: { exitCode: number | null; stderr?: string; stdout?: string } | undefined,
): boolean {
  if (command[0] !== "axe" || !execution || execution.exitCode === 0) {
    return false;
  }
  const combined = `${execution.stderr ?? ""}\n${execution.stdout ?? ""}`;
  if (/quarantined|rejectedBeforeInput/i.test(combined)) {
    return false;
  }
  return /input stopped/i.test(combined);
}

function formatGestureSubcommandLabel(command: string[]): string {
  if (command[0] === "axe") {
    if (command[1] === "gesture" && command[2]) {
      return `axe gesture ${command[2]}`;
    }
    return command[1] ? `axe ${command[1]}` : "axe";
  }
  if (command[0] === "adb" && command[1] === "-s") {
    return command.slice(3, 6).join(" ") || "adb";
  }
  return command.slice(0, 3).join(" ");
}

function summarizeCommandFailureOutput(
  stderr: string,
  stdout: string,
  maxChars: number = MAX_FAILED_STDERR_SUMMARY_CHARS,
): string | undefined {
  const raw = stderr.trim() || stdout.trim();
  if (!raw) {
    return undefined;
  }
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return undefined;
  }
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(1, maxChars - 3))}...`;
}

/**
 * Executes canvas polyline draw, drag, pinch, double-tap, or two-finger tap gestures.
 * Full simulator support on iOS via AXe v2.2+; partial support on Android via adb.
 */
export async function performGestureWithMaestroTool(
  input: PerformGestureInput,
): Promise<ToolResult<PerformGestureData>> {
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const normalized = normalizePerformGesture(input.gesture);

  if (typeof normalized === "string") {
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
        gestureType: extractFallbackGestureKind(input),
        coordinateMode: input.gesture?.coordinateMode ?? "absolute",
        coordinateScope: input.gesture?.containerBounds ? "container" : "viewport",
        ...(input.gesture?.containerBounds ? { containerBoundsApplied: input.gesture.containerBounds } : {}),
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: [`Invalid gesture configuration: ${normalized}`],
    };
  }

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
        runnerProfile,
        gestureType: normalized.type,
        coordinateMode: normalized.coordinateMode,
        coordinateScope: normalized.containerBounds ? "container" : "viewport",
        ...(normalized.containerBounds ? { containerBoundsApplied: normalized.containerBounds } : {}),
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("perform_gesture")],
    };
  }

  const platform = input.platform;
  const repoRoot = resolveRepoPath();
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const settleDelayMs =
    typeof input.settleDelayMs === "number" && input.settleDelayMs >= 0
      ? Math.floor(input.settleDelayMs)
      : DEFAULT_GESTURE_SETTLE_DELAY_MS;

  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);

  if (!deviceId) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.deviceUnavailable,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        gestureType: normalized.type,
        coordinateMode: normalized.coordinateMode,
        coordinateScope: normalized.containerBounds ? "container" : "viewport",
        ...(normalized.containerBounds ? { containerBoundsApplied: normalized.containerBounds } : {}),
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: ["Provide a deviceId or update the harness configuration."],
    };
  }

  let viewportBounds: { width: number; height: number } | undefined;
  if (
    gestureRequiresViewportBounds(normalized) &&
    !input.dryRun &&
    platform === "ios"
  ) {
    let viewportNodes: InspectUiNode[] = [];
    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      undefined,
      { sessionId: input.sessionId, platform, runnerProfile, deviceId, text: "" },
    );
    if (!isIosUiSnapshotFailure(snapshot)) {
      viewportNodes = snapshot.nodes;
    }
    if (viewportNodes.length > 0) {
      const detected = detectScreenBounds(viewportNodes);
      if (detected.width > 0 && detected.height > 0) {
        viewportBounds = { width: detected.width, height: detected.height };
      }
    }
  }

  const { resolved, resolvedPoints, coordinateScope } = resolveGestureCoordinates(normalized, viewportBounds);
  const plan = runtimeHooks.buildGestureCommands
    ? runtimeHooks.buildGestureCommands(deviceId, resolved)
    : {
        supported: false as const,
        reason: `Platform '${platform}' runtime does not implement gesture command building.`,
        suggestion: "Use an iOS simulator with AXe v2.2+ or supported Android adb drag/double_tap.",
      };

  const durationMsField = "durationMs" in resolved ? resolved.durationMs : undefined;
  const stepCountField = resolved.type === "sequence" ? resolved.steps.length : undefined;

  if (!plan.supported) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        gestureType: resolved.type,
        coordinateMode: resolved.coordinateMode,
        coordinateScope,
        ...(resolved.containerBounds ? { containerBoundsApplied: resolved.containerBounds } : {}),
        resolvedPoints,
        ...(durationMsField !== undefined ? { durationMs: durationMsField } : {}),
        ...(stepCountField !== undefined ? { stepCount: stepCountField } : {}),
        commandHistory: [],
        exitCode: null,
        supportLevel: "partial",
        ...(plan.backendId ? { backendId: plan.backendId } : {}),
      },
      nextSuggestions: [plan.reason, plan.suggestion],
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
        gestureType: resolved.type,
        coordinateMode: resolved.coordinateMode,
        coordinateScope,
        ...(resolved.containerBounds ? { containerBoundsApplied: resolved.containerBounds } : {}),
        resolvedPoints,
        ...(durationMsField !== undefined ? { durationMs: durationMsField } : {}),
        ...(stepCountField !== undefined ? { stepCount: stepCountField } : {}),
        commandHistory: plan.commands,
        exitCode: 0,
        supportLevel: plan.supportLevel,
        ...(plan.backendId ? { backendId: plan.backendId } : {}),
      },
      nextSuggestions: [
        `Dry-run preview for perform_gesture (${resolved.type}, ${coordinateScope}, ${resolvedPoints.length} resolved point(s)). Run without dryRun to execute.`,
      ],
    };
  }

  const commandHistory: string[][] = [];
  let lastExitCode: number | null = plan.commands.length === 0 ? 0 : null;
  let retryCount = 0;
  let failedCommandIndex: number | undefined;
  let failedSubcommand: string | undefined;
  let stderrSummary: string | undefined;

  for (let i = 0; i < plan.commands.length; i += 1) {
    const command = plan.commands[i];
    if (!command) continue;

    let execution = await executeUiActionCommand({
      repoRoot,
      command,
      requiresProbe: false,
      timeoutMs: plan.commandTimeoutMs,
    });
    commandHistory.push([...command]);

    if (isTransientAxeInputStopped(command, execution.execution)) {
      retryCount += 1;
      await new Promise((r) => setTimeout(r, AXE_INPUT_STOPPED_RETRY_DELAY_MS));
      execution = await executeUiActionCommand({
        repoRoot,
        command,
        requiresProbe: false,
        timeoutMs: plan.commandTimeoutMs,
      });
      commandHistory.push([...command]);
    }

    lastExitCode = execution.execution?.exitCode ?? null;
    if (lastExitCode !== 0) {
      failedCommandIndex = i;
      failedSubcommand = formatGestureSubcommandLabel(command);
      stderrSummary = summarizeCommandFailureOutput(
        execution.execution?.stderr ?? "",
        execution.execution?.stdout ?? "",
      );
      break;
    }
    const stepDelay = plan.stepDelaysMs?.[i] ?? plan.interCommandDelayMs ?? 0;
    if (stepDelay > 0 && i < plan.commands.length - 1) {
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }

  if (lastExitCode === 0 && settleDelayMs > 0) {
    await new Promise((r) => setTimeout(r, settleDelayMs));
  }

  const failedReasonCode =
    resolved.type === "double_tap" || resolved.type === "two_finger_tap"
      ? REASON_CODES.actionTapFailed
      : REASON_CODES.actionScrollFailed;

  const failureLocation =
    failedCommandIndex !== undefined
      ? ` at command ${String(failedCommandIndex + 1)}/${String(plan.commands.length)}${failedSubcommand ? ` (${failedSubcommand})` : ""}`
      : "";
  const failureDetail = stderrSummary ? `: ${stderrSummary}` : "";

  return {
    status: lastExitCode === 0 ? "success" : "failed",
    reasonCode: lastExitCode === 0 ? REASON_CODES.ok : failedReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1 + retryCount,
    artifacts: [],
    data: {
      dryRun: false,
      runnerProfile,
      gestureType: resolved.type,
      coordinateMode: resolved.coordinateMode,
      coordinateScope,
      ...(resolved.containerBounds ? { containerBoundsApplied: resolved.containerBounds } : {}),
      resolvedPoints,
      ...(durationMsField !== undefined ? { durationMs: durationMsField } : {}),
      ...(stepCountField !== undefined ? { stepCount: stepCountField } : {}),
      commandHistory,
      exitCode: lastExitCode,
      supportLevel: plan.supportLevel,
      ...(plan.backendId ? { backendId: plan.backendId } : {}),
      ...(lastExitCode !== 0 && failedCommandIndex !== undefined ? { failedCommandIndex } : {}),
      ...(lastExitCode !== 0 && stderrSummary ? { stderrSummary } : {}),
    },
    nextSuggestions:
      lastExitCode === 0
        ? [
            `Performed ${resolved.type} gesture (${coordinateScope}). Inspect UI or app debug probe to verify state change.`,
            ...(plan.caveat ? [plan.caveat] : []),
          ]
        : [
            `Gesture ${resolved.type} failed${failureLocation} (exitCode=${String(lastExitCode)})${failureDetail}. Check screen bounds, device orientation, and backend readiness.`,
          ],
  };
}
