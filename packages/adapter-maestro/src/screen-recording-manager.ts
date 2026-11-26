import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type {
  Platform,
  RecordScreenBackend,
  RecordScreenData,
  RecordScreenInput,
  RunnerProfile,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { closeAxeServeForDevice, forceKillAllAxeServeSessionsSync } from "./axe-serve-pool.js";
import { CLI_COMMANDS } from "./constants/cli-commands.js";
import {
  buildExecutionEvidence,
  buildFailureReason,
  executeRunnerWithTestHooks,
  normalizePositiveInteger,
  unrefTimer,
} from "./runtime-shared.js";

const SIMULATOR_UUID_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;

export const MAX_SCREEN_RECORDING_DURATION_MS = 180_000;
export const DEFAULT_IOS_RECORD_FPS = 10;
export const DEFAULT_IOS_RECORD_SCALE = 0.5;
const DEFAULT_STARTUP_PROBE_MS = 400;
const DEFAULT_STOP_GRACE_MS = 6_000;
const DEFAULT_AXE_FOLLOW_WARMUP_MS = 0;

export type ScreenRecordingSpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["ignore", "pipe", "pipe"] },
) => ChildProcess;

interface ActiveScreenRecording {
  recordingId: string;
  sessionId: string;
  platform: Platform;
  deviceId: string;
  runnerProfile: RunnerProfile;
  repoRoot: string;
  backend: RecordScreenBackend;
  supportLevel: "full" | "partial";
  relativeOutputPath: string;
  absoluteOutputPath: string;
  remoteOutputPath?: string;
  startedAtMs: number;
  maxDurationMs: number;
  bitrateMbps?: number;
  fps?: number;
  scale?: number;
  commands: string[][];
  commandLabels: string[];
  child: ChildProcess;
  stdout: string;
  stderr: string;
  exited: boolean;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  exitPromise: Promise<{ exitCode: number | null; exitSignal: NodeJS.Signals | null }>;
  maxDurationTimer: ReturnType<typeof setTimeout>;
  onAcceptedFrameListeners: Set<() => void>;
}

const activeRecordings = new Map<string, ActiveScreenRecording>();
const stoppingRecordings = new Set<ActiveScreenRecording>();
let recordingSeq = 0;

let _testSpawnFn: ScreenRecordingSpawnFn | null = null;
let _testMinAxeWarmupMs: number | null = null;
let _testStartupProbeMs: number | null = null;

export function setScreenRecordingSpawnForTesting(fn: ScreenRecordingSpawnFn | null): void {
  _testSpawnFn = fn;
}

export function setScreenRecordingTimingsForTesting(options: {
  minAxeWarmupMs?: number | null;
  startupProbeMs?: number | null;
}): void {
  if ("minAxeWarmupMs" in options) {
    _testMinAxeWarmupMs = options.minAxeWarmupMs ?? null;
  }
  if ("startupProbeMs" in options) {
    _testStartupProbeMs = options.startupProbeMs ?? null;
  }
}

export function resetScreenRecordingForTesting(): void {
  _testSpawnFn = null;
  _testMinAxeWarmupMs = null;
  _testStartupProbeMs = null;
}

export function listActiveRecordingsForTesting(): Array<{
  recordingId: string;
  sessionId: string;
  platform: Platform;
  deviceId: string;
  backend: RecordScreenBackend;
  outputPath: string;
}> {
  return [...activeRecordings.values()].map((rec) => ({
    recordingId: rec.recordingId,
    sessionId: rec.sessionId,
    platform: rec.platform,
    deviceId: rec.deviceId,
    backend: rec.backend,
    outputPath: rec.relativeOutputPath,
  }));
}

function isPhysicalIosDevice(deviceId: string): boolean {
  return !SIMULATOR_UUID_PATTERN.test(deviceId);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "session";
}

export function normalizeRecordFps(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_IOS_RECORD_FPS;
  }
  return Math.max(1, Math.min(30, Math.round(value)));
}

export function normalizeRecordScale(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_IOS_RECORD_SCALE;
  }
  const clamped = Math.max(0.1, Math.min(1, value));
  return Math.round(clamped * 100) / 100;
}

export function normalizeBackgroundRecordDurationMs(value: number | undefined): number {
  const normalized = normalizePositiveInteger(value, MAX_SCREEN_RECORDING_DURATION_MS);
  return Math.max(1_000, Math.min(MAX_SCREEN_RECORDING_DURATION_MS, normalized));
}

function spawnRecordingChild(
  command: string[],
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const spawner: ScreenRecordingSpawnFn =
    _testSpawnFn ?? ((cmd, args, opts) => spawn(cmd, args, opts));
  return spawner(command[0], command.slice(1), {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

interface SpawnedRecordingHandle {
  child: ChildProcess;
  getStdout: () => string;
  getStderr: () => string;
  isExited: () => boolean;
  getExitCode: () => number | null;
  getExitSignal: () => NodeJS.Signals | null;
  exitPromise: Promise<{ exitCode: number | null; exitSignal: NodeJS.Signals | null }>;
  onAcceptedFrameListeners: Set<() => void>;
}

interface StartupProbeOutcome {
  started: boolean;
  handle?: SpawnedRecordingHandle;
  errorMessage?: string;
  exitCode?: number | null;
  stderr?: string;
}

async function spawnAndProbeRecording(
  command: string[],
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<StartupProbeOutcome> {
  let child: ChildProcess;
  try {
    child = spawnRecordingChild(command, repoRoot, env);
  } catch (error) {
    return {
      started: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      exitCode: null,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  let stdout = "";
  let stderr = "";
  let exited = false;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  const onAcceptedFrameListeners = new Set<() => void>();

  let resolveExit!: (value: { exitCode: number | null; exitSignal: NodeJS.Signals | null }) => void;
  const exitPromise = new Promise<{ exitCode: number | null; exitSignal: NodeJS.Signals | null }>((resolve) => {
    resolveExit = resolve;
  });

  let settleStartup!: (outcome: StartupProbeOutcome) => void;
  let startupSettled = false;
  const startupPromise = new Promise<StartupProbeOutcome>((resolve) => {
    settleStartup = (outcome) => {
      if (startupSettled) return;
      startupSettled = true;
      resolve(outcome);
    };
  });

  const handle: SpawnedRecordingHandle = {
    child,
    getStdout: () => stdout,
    getStderr: () => stderr,
    isExited: () => exited,
    getExitCode: () => exitCode,
    getExitSignal: () => exitSignal,
    exitPromise,
    onAcceptedFrameListeners,
  };

  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });

  child.stderr?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    stderr += text;
    if (/accepted frames:/i.test(stderr)) {
      for (const listener of onAcceptedFrameListeners) {
        listener();
      }
      onAcceptedFrameListeners.clear();
    }
    if (!startupSettled && /recording/i.test(text)) {
      settleStartup({ started: true, handle });
    }
  });

  child.on("error", (error) => {
    exited = true;
    stderr += `${stderr ? "\n" : ""}${error.message}`;
    resolveExit({ exitCode: null, exitSignal: null });
    settleStartup({
      started: false,
      errorMessage: error.message,
      exitCode: null,
      stderr,
    });
  });

  child.on("close", (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
    resolveExit({ exitCode: code, exitSignal: signal });
    settleStartup({
      started: false,
      errorMessage: stderr.trim() || `Process exited immediately with code ${String(code)}`,
      exitCode: code,
      stderr,
    });
  });

  const probeMs = _testStartupProbeMs ?? DEFAULT_STARTUP_PROBE_MS;
  const startupTimer = setTimeout(() => {
    if (!exited) {
      settleStartup({ started: true, handle });
    }
  }, probeMs);
  unrefTimer(startupTimer);

  const outcome = await startupPromise;
  clearTimeout(startupTimer);
  return outcome;
}

function registerActiveRecording(
  params: Omit<ActiveScreenRecording, "stdout" | "stderr" | "exited" | "exitCode" | "exitSignal" | "exitPromise" | "maxDurationTimer" | "onAcceptedFrameListeners">,
  handle: SpawnedRecordingHandle,
): ActiveScreenRecording {
  const maxDurationTimer = setTimeout(() => {
    if (!handle.isExited()) {
      try {
        handle.child.kill("SIGINT");
      } catch {
        // ignore
      }
    }
  }, params.maxDurationMs);
  unrefTimer(maxDurationTimer);

  const recording: ActiveScreenRecording = {
    ...params,
    get stdout() {
      return handle.getStdout();
    },
    get stderr() {
      return handle.getStderr();
    },
    get exited() {
      return handle.isExited();
    },
    get exitCode() {
      return handle.getExitCode();
    },
    get exitSignal() {
      return handle.getExitSignal();
    },
    exitPromise: handle.exitPromise,
    maxDurationTimer,
    onAcceptedFrameListeners: handle.onAcceptedFrameListeners,
  };

  activeRecordings.set(recording.recordingId, recording);
  return recording;
}

async function waitForExitWithTimeout(
  recording: ActiveScreenRecording,
  timeoutMs: number,
): Promise<boolean> {
  if (recording.exited) {
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    recording.exitPromise.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      unrefTimer(timer);
    }),
  ]);
  if (timer) {
    clearTimeout(timer);
  }
  return result;
}

async function waitForAxeFollowWarmup(recording: ActiveScreenRecording): Promise<void> {
  const minWarmupMs = _testMinAxeWarmupMs ?? DEFAULT_AXE_FOLLOW_WARMUP_MS;
  if (minWarmupMs <= 0 || recording.backend !== "axe" || recording.exited) {
    return;
  }
  if (/accepted frames:/i.test(recording.stderr)) {
    return;
  }
  const elapsedMs = Date.now() - recording.startedAtMs;
  const remainingMs = minWarmupMs - elapsedMs;
  if (remainingMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      recording.onAcceptedFrameListeners.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, remainingMs);
    unrefTimer(timer);
    recording.onAcceptedFrameListeners.add(finish);
    void recording.exitPromise.then(finish);
  });
}

async function stopRecordingChild(recording: ActiveScreenRecording): Promise<void> {
  clearTimeout(recording.maxDurationTimer);
  if (recording.exited) {
    return;
  }

  if (recording.platform === "android") {
    await executeRunnerWithTestHooks(
      [CLI_COMMANDS.adb, "-s", recording.deviceId, "shell", "pkill", "-2", "screenrecord"],
      recording.repoRoot,
      process.env,
      { timeoutMs: 3_000 },
    ).catch(() => undefined);
  }

  try {
    recording.child.kill("SIGINT");
  } catch {
    // ignore
  }

  if (await waitForExitWithTimeout(recording, DEFAULT_STOP_GRACE_MS)) {
    return;
  }

  try {
    recording.child.kill("SIGTERM");
  } catch {
    // ignore
  }

  if (await waitForExitWithTimeout(recording, 2_000)) {
    return;
  }

  try {
    recording.child.kill("SIGKILL");
  } catch {
    // ignore
  }
  await waitForExitWithTimeout(recording, 1_000);
}

export async function startBackgroundScreenRecording(params: {
  input: RecordScreenInput;
  repoRoot: string;
  platform: Platform;
  runnerProfile: RunnerProfile;
  deviceId: string;
  relativeOutputPath: string;
  absoluteOutputPath: string;
  bitrateMbps?: number;
  startTime: number;
}): Promise<ToolResult<RecordScreenData>> {
  const {
    input,
    repoRoot,
    platform,
    runnerProfile,
    deviceId,
    relativeOutputPath,
    absoluteOutputPath,
    bitrateMbps,
    startTime,
  } = params;

  const maxDurationMs = normalizeBackgroundRecordDurationMs(input.durationMs);
  const fps = platform === "ios" ? normalizeRecordFps(input.fps) : undefined;
  const scale = platform === "ios" ? normalizeRecordScale(input.scale) : undefined;

  if (platform === "ios" && isPhysicalIosDevice(deviceId)) {
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
        outputPath: relativeOutputPath,
        durationMs: maxDurationMs,
        bitrateMbps,
        commandLabels: ["record_start_unsupported_physical_ios"],
        commands: [],
        exitCode: null,
        supportLevel: "partial",
        mode: "start",
        recordingActive: false,
        fps,
        scale,
      },
      nextSuggestions: [
        "iOS physical-device screen recording is not supported in this adapter path. Use an iOS simulator for automated MP4 capture.",
      ],
    };
  }

  const existingForDevice = [...activeRecordings.values()].find(
    (rec) => rec.deviceId === deviceId && !rec.exited,
  );
  if (existingForDevice && !input.dryRun) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        durationMs: maxDurationMs,
        bitrateMbps,
        commandLabels: [],
        commands: [],
        exitCode: null,
        supportLevel: platform === "android" ? "full" : "partial",
        mode: "start",
        recordingId: existingForDevice.recordingId,
        recordingActive: true,
        backend: existingForDevice.backend,
        fps,
        scale,
      },
      nextSuggestions: [
        `An active screen recording (${existingForDevice.recordingId}) is already running on device ${deviceId}. Call record_screen with mode='stop' first.`,
      ],
    };
  }

  const recordingId = `rec-${sanitizeSegment(input.sessionId)}-${Date.now()}-${++recordingSeq}`;

  if (platform === "ios") {
    // Do NOT pass --follow-active-display in background start/stop mode:
    // AXe v2.2 acquires an exclusive per-simulator lock for --follow-active-display,
    // which blocks concurrent axe tap/swipe/type/gesture commands ("Another AXe command
    // is using the simulator"). Plain `axe record-video` runs concurrently with `axe serve`
    // and UI actions on both single-display (iPad/iPhone) and dual-display (iPhone Duo)
    // simulators without contention.
    const resolvedScale = scale ?? DEFAULT_IOS_RECORD_SCALE;
    const axeCommand = [
      "axe",
      "record-video",
      "--udid",
      deviceId,
      "--fps",
      String(fps ?? DEFAULT_IOS_RECORD_FPS),
      "--scale",
      String(resolvedScale),
      "--output",
      absoluteOutputPath,
    ];
    const simctlCommand = [
      "xcrun",
      "simctl",
      "io",
      deviceId,
      "recordVideo",
      "--codec=h264",
      "--force",
      absoluteOutputPath,
    ];

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
          outputPath: relativeOutputPath,
          durationMs: maxDurationMs,
          bitrateMbps,
          commandLabels: ["record_start_axe"],
          commands: [axeCommand],
          exitCode: 0,
          supportLevel: "partial",
          mode: "start",
          recordingId,
          recordingActive: false,
          backend: "axe",
          fps,
          scale: resolvedScale,
        },
        nextSuggestions: [
          "Run record_screen with mode='start' without dryRun to begin background capture, then call record_screen with mode='stop' to save or discard.",
        ],
      };
    }

    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await rm(absoluteOutputPath, { force: true }).catch(() => undefined);

    const commands: string[][] = [axeCommand];
    const commandLabels: string[] = ["record_start_axe"];
    let attempts = 1;
    let selectedBackend: RecordScreenBackend = "axe";

    let probe = await spawnAndProbeRecording(axeCommand, repoRoot, process.env);
    if (!probe.started || !probe.handle) {
      attempts = 2;
      commands.push(simctlCommand);
      commandLabels.push("record_start_simctl_fallback");
      selectedBackend = "simctl";
      probe = await spawnAndProbeRecording(simctlCommand, repoRoot, process.env);
    }

    if (!probe.started || !probe.handle) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(probe.stderr ?? probe.errorMessage ?? "", probe.exitCode ?? 1),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: relativeOutputPath,
          durationMs: maxDurationMs,
          bitrateMbps,
          commandLabels,
          commands,
          exitCode: probe.exitCode ?? 1,
          supportLevel: "partial",
          mode: "start",
          recordingActive: false,
          backend: selectedBackend,
          fps,
          scale: resolvedScale,
        },
        nextSuggestions: [
          "Check simulator boot state, axe record-video availability, and xcrun simctl io recordVideo before retrying record_screen(mode='start').",
        ],
      };
    }

    registerActiveRecording(
      {
        recordingId,
        sessionId: input.sessionId,
        platform,
        deviceId,
        runnerProfile,
        repoRoot,
        backend: selectedBackend,
        supportLevel: "partial",
        relativeOutputPath,
        absoluteOutputPath,
        startedAtMs: Date.now(),
        maxDurationMs,
        bitrateMbps,
        fps,
        scale: resolvedScale,
        commands,
        commandLabels,
        child: probe.handle.child,
      },
      probe.handle,
    );

    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        durationMs: maxDurationMs,
        bitrateMbps,
        commandLabels,
        commands,
        exitCode: 0,
        supportLevel: "partial",
        mode: "start",
        recordingId,
        recordingActive: true,
        backend: selectedBackend,
        fps,
        scale: resolvedScale,
      },
      nextSuggestions: [
        `Recording active (${recordingId}) via ${selectedBackend}. Call record_screen with mode='stop' and recordingId='${recordingId}' (set discardOnStop=true to drop on pass).`,
      ],
    };
  }

  // Android background screenrecord
  const maxSeconds = Math.max(1, Math.min(180, Math.ceil(maxDurationMs / 1000)));
  const remoteOutputPath = `/sdcard/${sanitizeSegment(input.sessionId)}-${Date.now()}-${recordingSeq}.mp4`;
  const adbCommand = [
    CLI_COMMANDS.adb,
    "-s",
    deviceId,
    "shell",
    "screenrecord",
    "--time-limit",
    String(maxSeconds),
    ...(bitrateMbps ? ["--bit-rate", String(Math.floor(bitrateMbps * 1_000_000))] : []),
    remoteOutputPath,
  ];

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
        outputPath: relativeOutputPath,
        durationMs: maxDurationMs,
        bitrateMbps,
        commandLabels: ["record_start_adb"],
        commands: [adbCommand],
        exitCode: 0,
        supportLevel: "full",
        mode: "start",
        recordingId,
        recordingActive: false,
        backend: "adb",
      },
      nextSuggestions: [
        "Run record_screen with mode='start' without dryRun to begin Android background recording, then call mode='stop' to pull or discard.",
      ],
    };
  }

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const probe = await spawnAndProbeRecording(adbCommand, repoRoot, process.env);
  if (!probe.started || !probe.handle) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(probe.stderr ?? probe.errorMessage ?? "", probe.exitCode ?? 1),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        durationMs: maxDurationMs,
        bitrateMbps,
        commandLabels: ["record_start_adb"],
        commands: [adbCommand],
        exitCode: probe.exitCode ?? 1,
        supportLevel: "full",
        mode: "start",
        recordingActive: false,
        backend: "adb",
      },
      nextSuggestions: [
        "Check Android device connectivity and adb shell screenrecord support before retrying record_screen(mode='start').",
      ],
    };
  }

  registerActiveRecording(
    {
      recordingId,
      sessionId: input.sessionId,
      platform,
      deviceId,
      runnerProfile,
      repoRoot,
      backend: "adb",
      supportLevel: "full",
      relativeOutputPath,
      absoluteOutputPath,
      remoteOutputPath,
      startedAtMs: Date.now(),
      maxDurationMs,
      bitrateMbps,
      commands: [adbCommand],
      commandLabels: ["record_start_adb"],
      child: probe.handle.child,
    },
    probe.handle,
  );

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
      outputPath: relativeOutputPath,
      durationMs: maxDurationMs,
      bitrateMbps,
      commandLabels: ["record_start_adb"],
      commands: [adbCommand],
      exitCode: 0,
      supportLevel: "full",
      mode: "start",
      recordingId,
      recordingActive: true,
      backend: "adb",
    },
    nextSuggestions: [
      `Recording active (${recordingId}) via adb. Call record_screen with mode='stop' and recordingId='${recordingId}' to pull or discard.`,
    ],
  };
}

function findActiveRecordingForStop(input: RecordScreenInput): ActiveScreenRecording | undefined {
  if (input.recordingId) {
    const rec = activeRecordings.get(input.recordingId);
    if (!rec) {
      return undefined;
    }
    if (input.sessionId && rec.sessionId !== input.sessionId) {
      return undefined;
    }
    return rec;
  }

  let latest: ActiveScreenRecording | undefined;
  for (const rec of activeRecordings.values()) {
    if (rec.sessionId === input.sessionId) {
      if (!latest || rec.startedAtMs >= latest.startedAtMs) {
        latest = rec;
      }
    }
  }
  return latest;
}

export async function stopBackgroundScreenRecording(params: {
  input: RecordScreenInput;
  runnerProfile: RunnerProfile;
  platform?: Platform;
  deviceId?: string;
  startTime: number;
}): Promise<ToolResult<RecordScreenData>> {
  const { input, runnerProfile, platform, deviceId, startTime } = params;

  if (platform === "ios" && deviceId && isPhysicalIosDevice(deviceId)) {
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
        outputPath: input.outputPath ?? "",
        durationMs: 0,
        commandLabels: ["record_stop_unsupported_physical_ios"],
        commands: [],
        exitCode: null,
        supportLevel: "partial",
        mode: "stop",
        recordingId: input.recordingId,
        recordingActive: false,
      },
      nextSuggestions: [
        "iOS physical-device screen recording is not supported in this adapter path.",
      ],
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
        outputPath: input.outputPath ?? "",
        durationMs: 0,
        commandLabels: [input.discardOnStop ? "record_stop_discard" : "record_stop_save"],
        commands: [],
        exitCode: 0,
        supportLevel: platform === "android" ? "full" : "partial",
        mode: "stop",
        recordingId: input.recordingId,
        recordingActive: false,
        discarded: Boolean(input.discardOnStop),
        backend: platform === "android" ? "adb" : "axe",
      },
      nextSuggestions: [],
    };
  }

  const recording = findActiveRecordingForStop(input);
  if (!recording) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: input.outputPath ?? "",
        durationMs: 0,
        commandLabels: [],
        commands: [],
        exitCode: null,
        supportLevel: platform === "android" ? "full" : "partial",
        mode: "stop",
        recordingId: input.recordingId,
        recordingActive: false,
      },
      nextSuggestions: [
        input.recordingId
          ? `No active screen recording found for recordingId='${input.recordingId}' in session '${input.sessionId}'.`
          : `No active screen recording found for session '${input.sessionId}'. Call record_screen with mode='start' first.`,
      ],
    };
  }

  activeRecordings.delete(recording.recordingId);
  stoppingRecordings.add(recording);
  const discardOnStop = Boolean(input.discardOnStop);

  try {
    if (!discardOnStop) {
      await waitForAxeFollowWarmup(recording);
    }
    await stopRecordingChild(recording);
  } finally {
    stoppingRecordings.delete(recording);
  }
  const recordedDurationMs = Math.max(0, Date.now() - recording.startedAtMs);

  const effectiveCommands = [...recording.commands];
  const effectiveLabels = [...recording.commandLabels];

  if (discardOnStop) {
    await rm(recording.absoluteOutputPath, { force: true }).catch(() => undefined);
    if (recording.platform === "android" && recording.remoteOutputPath) {
      const cleanupCmd = [CLI_COMMANDS.adb, "-s", recording.deviceId, "shell", "rm", "-f", recording.remoteOutputPath];
      effectiveCommands.push(cleanupCmd);
      effectiveLabels.push("record_discard_cleanup");
      await executeRunnerWithTestHooks(cleanupCmd, recording.repoRoot, process.env, { timeoutMs: 5_000 }).catch(() => undefined);
    } else {
      effectiveLabels.push("record_stop_discard");
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
        runnerProfile: recording.runnerProfile,
        outputPath: recording.relativeOutputPath,
        durationMs: recordedDurationMs,
        bitrateMbps: recording.bitrateMbps,
        commandLabels: effectiveLabels,
        commands: effectiveCommands,
        exitCode: 0,
        supportLevel: recording.supportLevel,
        mode: "stop",
        recordingId: recording.recordingId,
        recordingActive: false,
        discarded: true,
        backend: recording.backend,
        fps: recording.fps,
        scale: recording.scale,
        sizeBytes: 0,
      },
      nextSuggestions: [],
    };
  }

  // Keep artifact path
  if (recording.platform === "android" && recording.remoteOutputPath) {
    const pullCmd = [CLI_COMMANDS.adb, "-s", recording.deviceId, "pull", recording.remoteOutputPath, recording.absoluteOutputPath];
    const cleanupCmd = [CLI_COMMANDS.adb, "-s", recording.deviceId, "shell", "rm", "-f", recording.remoteOutputPath];
    effectiveCommands.push(pullCmd, cleanupCmd);
    effectiveLabels.push("record_pull", "record_cleanup");
    const pullExec = await executeRunnerWithTestHooks(pullCmd, recording.repoRoot, process.env, { timeoutMs: 20_000 });
    await executeRunnerWithTestHooks(cleanupCmd, recording.repoRoot, process.env, { timeoutMs: 5_000 }).catch(() => undefined);
    if (pullExec.exitCode !== 0) {
      return {
        status: "failed",
        reasonCode: buildFailureReason(pullExec.stderr, pullExec.exitCode),
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile: recording.runnerProfile,
          outputPath: recording.relativeOutputPath,
          durationMs: recordedDurationMs,
          bitrateMbps: recording.bitrateMbps,
          commandLabels: effectiveLabels,
          commands: effectiveCommands,
          exitCode: pullExec.exitCode,
          supportLevel: recording.supportLevel,
          mode: "stop",
          recordingId: recording.recordingId,
          recordingActive: false,
          discarded: false,
          backend: recording.backend,
          sizeBytes: 0,
        },
        nextSuggestions: [
          "Android recording stopped but adb pull failed. Check device connectivity and storage permissions.",
        ],
      };
    }
  } else {
    effectiveLabels.push("record_stop_save");
  }

  const fileStat = await stat(recording.absoluteOutputPath).catch(() => null);
  const sizeBytes = fileStat?.size ?? 0;

  if (sizeBytes <= 0) {
    await rm(recording.absoluteOutputPath, { force: true }).catch(() => undefined);
    return {
      status: "failed",
      reasonCode: buildFailureReason(recording.stderr, recording.exitCode ?? 1),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile: recording.runnerProfile,
        outputPath: recording.relativeOutputPath,
        durationMs: recordedDurationMs,
        bitrateMbps: recording.bitrateMbps,
        commandLabels: effectiveLabels,
        commands: effectiveCommands,
        exitCode: recording.exitCode ?? 1,
        supportLevel: recording.supportLevel,
        mode: "stop",
        recordingId: recording.recordingId,
        recordingActive: false,
        discarded: false,
        backend: recording.backend,
        fps: recording.fps,
        scale: recording.scale,
        sizeBytes: 0,
      },
      nextSuggestions: [
        "Screen recording stopped without producing a non-empty MP4 file. Ensure the simulator/device remained active and ran long enough to emit frames.",
      ],
    };
  }

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [recording.relativeOutputPath],
    data: {
      dryRun: false,
      runnerProfile: recording.runnerProfile,
      outputPath: recording.relativeOutputPath,
      durationMs: recordedDurationMs,
      bitrateMbps: recording.bitrateMbps,
      commandLabels: effectiveLabels,
      commands: effectiveCommands,
      exitCode: 0,
      supportLevel: recording.supportLevel,
      mode: "stop",
      recordingId: recording.recordingId,
      recordingActive: false,
      discarded: false,
      backend: recording.backend,
      fps: recording.fps,
      scale: recording.scale,
      sizeBytes,
      evidence: [
        buildExecutionEvidence(
          "screen_recording",
          recording.relativeOutputPath,
          recording.supportLevel,
          `Captured ${recording.platform === "android" ? "Android" : "iOS simulator"} screen recording (${recording.backend}, ${String(sizeBytes)} bytes).`,
        ),
      ],
    },
    nextSuggestions: [],
  };
}

export async function cleanupActiveRecordingsForSession(sessionId: string): Promise<void> {
  const matching = [...activeRecordings.values()].filter((rec) => rec.sessionId === sessionId);
  for (const recording of matching) {
    activeRecordings.delete(recording.recordingId);
    stoppingRecordings.add(recording);
    try {
      await stopRecordingChild(recording);
      await rm(recording.absoluteOutputPath, { force: true }).catch(() => undefined);
      if (recording.platform === "android" && recording.remoteOutputPath) {
        await executeRunnerWithTestHooks(
          [CLI_COMMANDS.adb, "-s", recording.deviceId, "shell", "rm", "-f", recording.remoteOutputPath],
          recording.repoRoot,
          process.env,
          { timeoutMs: 3_000 },
        ).catch(() => undefined);
      }
    } catch {
      // Best-effort cleanup on session end
    } finally {
      stoppingRecordings.delete(recording);
    }
  }
}

export async function cleanupAllActiveRecordings(): Promise<void> {
  const sessionIds = new Set([...activeRecordings.values()].map((rec) => rec.sessionId));
  for (const sessionId of sessionIds) {
    await cleanupActiveRecordingsForSession(sessionId);
  }
}

export async function cleanupSessionRuntimeResources(params: {
  sessionId: string;
  platform?: Platform;
  deviceId?: string;
  releaseDeviceResources?: boolean;
}): Promise<void> {
  await cleanupActiveRecordingsForSession(params.sessionId);
  if (params.platform === "ios" && params.deviceId && params.releaseDeviceResources !== false) {
    closeAxeServeForDevice(params.deviceId);
  }
}

function forceKillAllActiveRecordingsSync(): void {
  const allRecordings = new Set<ActiveScreenRecording>([
    ...activeRecordings.values(),
    ...stoppingRecordings.values(),
  ]);
  activeRecordings.clear();
  stoppingRecordings.clear();
  for (const recording of allRecordings) {
    clearTimeout(recording.maxDurationTimer);
    try {
      if (
        (recording.child.exitCode === null || recording.child.exitCode === undefined) &&
        (recording.child.signalCode === null || recording.child.signalCode === undefined)
      ) {
        recording.child.kill("SIGKILL");
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Synchronously SIGKILL any active/stopping recording processes and persistent
 * `axe serve` workers (including workers mid-shutdown). Safe to invoke inside
 * synchronous SIGINT/SIGTERM/exit hooks.
 */
export function forceCleanupAllRuntimeResourcesSync(): void {
  forceKillAllActiveRecordingsSync();
  forceKillAllAxeServeSessionsSync();
}

process.once("exit", () => {
  forceKillAllActiveRecordingsSync();
});
