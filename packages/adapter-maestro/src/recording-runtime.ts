import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRecordEventsRelativePath,
  buildRecordedStepsRelativePath,
  buildRecordSessionRelativePath,
  listRawRecordedEvents,
  loadRecordedSteps,
  loadRecordSession,
  persistRawRecordedEvents,
  persistRecordedSteps,
  persistRecordSessionState,
  persistStartedRecordSession,
} from "@mobile-e2e-mcp/core";
import {
  REASON_CODES,
  type CancelRecordSessionData,
  type CancelRecordSessionInput,
  type EndRecordSessionData,
  type EndRecordSessionInput,
  type GetRecordSessionStatusInput,
  type RawRecordedEvent,
  type RecordSessionStatusData,
  type StartRecordSessionData,
  type StartRecordSessionInput,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { buildDefaultAppId, buildDefaultDeviceId, resolveRepoPath } from "./harness-config.js";
import { mapRawEventsToRecordedSteps, renderRecordedStepsAsFlow } from "./recording-mapper.js";
import { executeRunner, shellEscape } from "./runtime-shared.js";

interface ParsedRawEvent {
  type: "tap" | "type" | "back" | "home" | "app_switch";
  x?: number;
  y?: number;
  textDelta?: string;
  rawLine: string;
}

function mapAndroidKeyTokenToText(token: string): string | undefined {
  if (/^[A-Z]$/.test(token)) {
    return token.toLowerCase();
  }
  if (/^[0-9]$/.test(token)) {
    return token;
  }
  if (token === "SPACE") {
    return " ";
  }
  if (token === "DOT") {
    return ".";
  }
  if (token === "AT") {
    return "@";
  }
  if (token === "MINUS") {
    return "-";
  }
  if (token === "UNDERSCORE") {
    return "_";
  }
  return undefined;
}

async function captureAndroidContextSnapshot(params: {
  repoRoot: string;
  recordSessionId: string;
  deviceId: string;
  dryRun?: boolean;
}): Promise<{ uiSnapshotRef?: string; foregroundApp?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const snapshotRelativePath = path.posix.join("artifacts", "record-snapshots", `${params.recordSessionId}-end.xml`);
  const snapshotAbsolutePath = path.resolve(params.repoRoot, snapshotRelativePath);

  if (params.dryRun) {
    return {
      uiSnapshotRef: snapshotRelativePath,
      foregroundApp: "com.example.app",
      warnings,
    };
  }

  await mkdir(path.dirname(snapshotAbsolutePath), { recursive: true });
  const remoteDumpPath = `/sdcard/${params.recordSessionId}-end.xml`;

  const dumpResult = await executeRunner(
    ["adb", "-s", params.deviceId, "shell", "uiautomator", "dump", remoteDumpPath],
    params.repoRoot,
    process.env,
  );
  if (dumpResult.exitCode !== 0) {
    warnings.push("Failed to capture UI snapshot via uiautomator dump.");
  }

  const pullResult = await executeRunner(
    ["adb", "-s", params.deviceId, "pull", remoteDumpPath, snapshotAbsolutePath],
    params.repoRoot,
    process.env,
  );
  if (pullResult.exitCode !== 0) {
    warnings.push("Failed to pull UI snapshot XML artifact.");
  }

  const appContextResult = await executeRunner(
    ["adb", "-s", params.deviceId, "shell", "dumpsys", "window", "windows"],
    params.repoRoot,
    process.env,
  );
  let foregroundApp: string | undefined;
  if (appContextResult.exitCode === 0) {
    const match = appContextResult.stdout.match(/mCurrentFocus=Window\{[^\s]+\s([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+\}/);
    foregroundApp = match?.[1];
  } else {
    warnings.push("Failed to collect foreground app context from dumpsys window.");
  }

  return {
    uiSnapshotRef: pullResult.exitCode === 0 ? snapshotRelativePath : undefined,
    foregroundApp,
    warnings,
  };
}

function parseHexMaybe(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRawInputEvents(rawContent: string): ParsedRawEvent[] {
  const lines = rawContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let currentX: number | undefined;
  let currentY: number | undefined;
  const events: ParsedRawEvent[] = [];

  for (const line of lines) {
    const positionX = line.match(/(?:ABS_MT_POSITION_X|ABS_X)\s+([0-9a-fA-F]+)/);
    if (positionX) {
      currentX = parseHexMaybe(positionX[1]);
    }
    const positionY = line.match(/(?:ABS_MT_POSITION_Y|ABS_Y)\s+([0-9a-fA-F]+)/);
    if (positionY) {
      currentY = parseHexMaybe(positionY[1]);
    }

    if (/BTN_TOUCH\s+DOWN/.test(line)) {
      events.push({ type: "tap", x: currentX, y: currentY, rawLine: line });
      continue;
    }
    if (/KEY_BACK\s+DOWN/.test(line)) {
      events.push({ type: "back", rawLine: line });
      continue;
    }
    if (/KEY_HOME\s+DOWN/.test(line)) {
      events.push({ type: "home", rawLine: line });
      continue;
    }
    if (/KEY_APPSELECT\s+DOWN/.test(line)) {
      events.push({ type: "app_switch", rawLine: line });
      continue;
    }

    const keyDown = line.match(/KEY_([A-Z0-9_]+)\s+DOWN/);
    if (keyDown) {
      const token = keyDown[1];
      if (token === "BACK" || token === "HOME" || token === "APPSELECT") {
        continue;
      }
      const mapped = mapAndroidKeyTokenToText(token);
      if (mapped !== undefined) {
        events.push({ type: "type", textDelta: mapped, rawLine: line });
      }
    }
  }

  return events;
}

export async function startRecordSessionWithMaestro(input: StartRecordSessionInput): Promise<ToolResult<StartRecordSessionData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSessionId = `rec-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const platform = input.platform ?? "android";
  if (platform !== "android") {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId,
        sessionId: input.sessionId,
        platform,
        deviceId: input.deviceId ?? buildDefaultDeviceId(platform),
        appId: input.appId ?? buildDefaultAppId(platform),
        recordingProfile: input.recordingProfile ?? "default",
        status: "running",
        startedAt,
        captureChannels: ["input_events", "ui_snapshots", "app_context"],
        rawEventsPath: buildRecordEventsRelativePath(recordSessionId),
      },
      nextSuggestions: ["Android-first MVP currently supports passive capture only on Android."],
    };
  }

  const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
  const appId = input.appId ?? buildDefaultAppId(platform);
  const rawEventsRelativePath = buildRecordEventsRelativePath(recordSessionId);
  const rawEventsAbsolutePath = path.resolve(repoRoot, rawEventsRelativePath);
  await mkdir(path.dirname(rawEventsAbsolutePath), { recursive: true });

  let pid: number | undefined;
  if (!input.dryRun) {
    const shellCommand = `adb -s ${shellEscape(deviceId)} shell getevent -lt > ${shellEscape(rawEventsAbsolutePath)} 2>&1 & echo $!`;
    const execution = await executeRunner(["bash", "-lc", shellCommand], repoRoot, process.env);
    if (execution.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          recordSessionId,
          sessionId: input.sessionId,
          platform,
          deviceId,
          appId,
          recordingProfile: input.recordingProfile ?? "default",
          status: "cancelled",
          startedAt,
          captureChannels: ["input_events", "ui_snapshots", "app_context"],
          rawEventsPath: rawEventsRelativePath,
        },
        nextSuggestions: ["Failed to start adb getevent capture. Verify adb/device connectivity and retry."],
      };
    }
    const parsedPid = Number.parseInt(execution.stdout.trim(), 10);
    if (Number.isFinite(parsedPid)) {
      pid = parsedPid;
    }
  }

  const persisted = await persistStartedRecordSession(repoRoot, {
    recordSessionId,
    sessionId: input.sessionId,
    platform,
    deviceId,
    appId,
    recordingProfile: input.recordingProfile ?? "default",
    startedAt,
    captureChannels: ["input_events", "ui_snapshots", "app_context"],
    rawEventsPath: rawEventsRelativePath,
    pid,
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [persisted.relativePath, rawEventsRelativePath],
    data: {
      recordSessionId,
      sessionId: input.sessionId,
      platform,
      deviceId,
      appId,
      recordingProfile: input.recordingProfile ?? "default",
      status: "running",
      startedAt,
      captureChannels: ["input_events", "ui_snapshots", "app_context"],
      rawEventsPath: rawEventsRelativePath,
      pid,
    },
    nextSuggestions: [
      "Perform manual interactions on device/emulator, then call end_record_session with the returned recordSessionId.",
    ],
  };
}

export async function getRecordSessionStatusWithMaestro(input: GetRecordSessionStatusInput): Promise<ToolResult<RecordSessionStatusData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSession = await loadRecordSession(repoRoot, input.recordSessionId);
  if (!recordSession) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.recordSessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId: input.recordSessionId,
        sessionId: "unknown",
        platform: "android",
        deviceId: "unknown",
        status: "cancelled",
        startedAt: new Date(0).toISOString(),
        rawEventCount: 0,
        recordedStepCount: 0,
        rawEventsPath: buildRecordEventsRelativePath(input.recordSessionId),
        warnings: ["Record session does not exist."],
      },
      nextSuggestions: ["Start a new record session before querying status."],
    };
  }

  const [events, steps] = await Promise.all([
    listRawRecordedEvents(repoRoot, input.recordSessionId),
    loadRecordedSteps(repoRoot, input.recordSessionId),
  ]);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: recordSession.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [buildRecordSessionRelativePath(input.recordSessionId), recordSession.rawEventsPath],
    data: {
      recordSessionId: recordSession.recordSessionId,
      sessionId: recordSession.sessionId,
      platform: recordSession.platform,
      deviceId: recordSession.deviceId,
      appId: recordSession.appId,
      status: recordSession.status,
      startedAt: recordSession.startedAt,
      endedAt: recordSession.endedAt,
      rawEventCount: events.length,
      recordedStepCount: steps.length,
      rawEventsPath: recordSession.rawEventsPath,
      flowPath: recordSession.flowPath,
      warnings: recordSession.warnings,
    },
    nextSuggestions: recordSession.status === "running"
      ? ["Continue manual interaction, then call end_record_session to export flow."]
      : [],
  };
}

export async function endRecordSessionWithMaestro(input: EndRecordSessionInput): Promise<ToolResult<EndRecordSessionData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSession = await loadRecordSession(repoRoot, input.recordSessionId);
  if (!recordSession) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.recordSessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId: input.recordSessionId,
        status: "cancelled",
        endedAt: new Date().toISOString(),
        report: {
          stepCount: 0,
          warnings: ["Record session does not exist."],
          confidenceSummary: { high: 0, medium: 0, low: 0 },
          reviewRequired: true,
        },
      },
      nextSuggestions: ["Start a new record session and retry end_record_session."],
    };
  }

  if (recordSession.pid && recordSession.status === "running" && !input.dryRun) {
    try {
      process.kill(recordSession.pid, "SIGTERM");
    } catch (error) {
      void error;
    }
  }

  let capturedEvents = await listRawRecordedEvents(repoRoot, input.recordSessionId);
  const contextSnapshot = await captureAndroidContextSnapshot({
    repoRoot,
    recordSessionId: input.recordSessionId,
    deviceId: recordSession.deviceId,
    dryRun: input.dryRun,
  });
  if (!input.dryRun && capturedEvents.length === 0) {
    const absolutePath = path.resolve(repoRoot, recordSession.rawEventsPath);
    const rawContent = await readFile(absolutePath, "utf8").catch(() => "");
    const parsed = parseRawInputEvents(rawContent);
    const normalized: RawRecordedEvent[] = parsed.map((event, index) => ({
      eventId: `${input.recordSessionId}-${index + 1}`,
      recordSessionId: input.recordSessionId,
      timestamp: new Date().toISOString(),
      eventType: event.type,
      x: event.x,
      y: event.y,
      textDelta: event.textDelta,
      rawLine: event.rawLine,
      foregroundApp: contextSnapshot.foregroundApp ?? recordSession.appId,
      uiSnapshotRef: contextSnapshot.uiSnapshotRef,
    }));
    if (normalized.length > 0) {
      await persistRawRecordedEvents(repoRoot, input.recordSessionId, normalized);
      capturedEvents = normalized;
    }
  }

  const mapped = mapRawEventsToRecordedSteps(input.recordSessionId, capturedEvents, {
    defaultAppId: recordSession.appId,
    includeAutoWaitStep: true,
  });
  await persistRecordedSteps(repoRoot, input.recordSessionId, mapped.steps);

  let flowPath: string | undefined;
  let replayDryRun: EndRecordSessionData["report"]["replayDryRun"];
  const warnings = [...mapped.warnings, ...contextSnapshot.warnings];
  if (input.autoExport !== false) {
    const targetFlowPath = input.outputPath ?? path.posix.join("flows", "samples", "generated", `${input.recordSessionId}-${Date.now()}.yaml`);
    const absoluteFlowPath = path.resolve(repoRoot, targetFlowPath);
    await mkdir(path.dirname(absoluteFlowPath), { recursive: true });
    const rendered = renderRecordedStepsAsFlow({
      appId: recordSession.appId ?? "com.example.app",
      includeLaunchStep: input.includeLaunchStep !== false,
      steps: mapped.steps,
    });
    warnings.push(...rendered.warnings);
    await writeFile(absoluteFlowPath, rendered.yaml, "utf8");
    flowPath = targetFlowPath;

    if (input.runReplayDryRun) {
      const { runFlowWithMaestro } = await import("./index.js");
      const replayResult = await runFlowWithMaestro({
        sessionId: recordSession.sessionId,
        platform: recordSession.platform,
        flowPath,
        dryRun: true,
        deviceId: recordSession.deviceId,
        appId: recordSession.appId,
      });
      replayDryRun = {
        status: replayResult.status,
        reasonCode: replayResult.reasonCode,
      };
    }
  }

  const confidenceSummary = mapped.steps.reduce(
    (acc, step) => {
      acc[step.confidence] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const endedAt = new Date().toISOString();
  await persistRecordSessionState(repoRoot, input.recordSessionId, {
    status: "ended",
    endedAt,
    flowPath,
    warnings,
    pid: undefined,
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: recordSession.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [
      buildRecordSessionRelativePath(input.recordSessionId),
      recordSession.rawEventsPath,
      buildRecordedStepsRelativePath(input.recordSessionId),
      ...(flowPath ? [flowPath] : []),
    ],
    data: {
      recordSessionId: input.recordSessionId,
      status: "ended",
      endedAt,
      report: {
        flowPath,
        stepCount: mapped.steps.length,
        warnings,
        confidenceSummary,
        reviewRequired: confidenceSummary.low > 0 || warnings.length > 0,
        replayDryRun,
      },
    },
    nextSuggestions: flowPath
      ? [`Replay with run_flow and flowPath='${flowPath}'.`]
      : ["No flow was exported. Ensure meaningful user interaction happened during recording."],
  };
}

export async function cancelRecordSessionWithMaestro(input: CancelRecordSessionInput): Promise<ToolResult<CancelRecordSessionData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const recordSession = await loadRecordSession(repoRoot, input.recordSessionId);
  if (!recordSession) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.recordSessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        recordSessionId: input.recordSessionId,
        cancelled: false,
        status: "cancelled",
      },
      nextSuggestions: ["Record session not found."],
    };
  }

  if (recordSession.pid && recordSession.status === "running") {
    try {
      process.kill(recordSession.pid, "SIGTERM");
    } catch (error) {
      void error;
    }
  }

  const endedAt = new Date().toISOString();
  await persistRecordSessionState(repoRoot, input.recordSessionId, {
    status: "cancelled",
    endedAt,
    warnings: [...recordSession.warnings, "Recording was cancelled by user."],
    pid: undefined,
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: recordSession.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [buildRecordSessionRelativePath(input.recordSessionId), recordSession.rawEventsPath],
    data: {
      recordSessionId: input.recordSessionId,
      cancelled: true,
      status: "cancelled",
      endedAt,
    },
    nextSuggestions: ["Start a new record session when you are ready to capture another flow."],
  };
}
