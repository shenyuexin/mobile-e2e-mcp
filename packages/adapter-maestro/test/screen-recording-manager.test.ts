import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { recordScreenWithRuntime } from "../src/device-runtime.js";
import {
  cleanupActiveRecordingsForSession,
  forceCleanupAllRuntimeResourcesSync,
  listActiveRecordingsForTesting,
  resetScreenRecordingForTesting,
  setScreenRecordingSpawnForTesting,
  setScreenRecordingTimingsForTesting,
} from "../src/screen-recording-manager.js";
import {
  resetExecuteRunnerForTesting,
  setExecuteRunnerForTesting,
} from "../src/runtime-shared.js";

const SIM_UDID = "70D29C87-AE8C-4B0E-82AB-83F442AA5151";
const PHYSICAL_UDID = "00008101-000D482C1E78001E";

function createFakeRecorderChild(options: {
  outputPath?: string;
  writeBytesOnSignal?: string;
  stderrOnStart?: string;
  failImmediatelyCode?: number;
  failStderr?: string;
}): ChildProcess & { signals: string[] } {
  const child = new EventEmitter() as ChildProcess & {
    signals: string[];
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    killed: boolean;
  };
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  child.stdout = stdout;
  child.stderr = stderr;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.signals = [];
  child.kill = ((signal?: NodeJS.Signals | number) => {
    const sig = String(signal ?? "SIGTERM");
    child.signals.push(sig);
    child.killed = true;
    void (async () => {
      if (options.outputPath && options.writeBytesOnSignal) {
        await writeFile(options.outputPath, options.writeBytesOnSignal, "utf8");
      }
      child.exitCode = 0;
      child.emit("close", 0, typeof signal === "string" ? signal : null);
    })();
    return true;
  }) as ChildProcess["kill"];

  if (options.failImmediatelyCode !== undefined) {
    queueMicrotask(() => {
      if (options.failStderr) stderr.write(options.failStderr);
      child.exitCode = options.failImmediatelyCode!;
      child.emit("close", options.failImmediatelyCode, null);
    });
  } else if (options.stderrOnStart) {
    queueMicrotask(() => stderr.write(options.stderrOnStart!));
  }

  return child;
}

test("iOS simulator record_screen start/stop keeps MP4 artifact and supports discardOnStop", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "m2e-rec-ios-"));
  const keptPath = path.join(workDir, "videos/kept.mp4");
  const discardedPath = path.join(workDir, "videos/discarded.mp4");
  const spawned: Array<{ cmd: string; args: string[] }> = [];

  setScreenRecordingTimingsForTesting({ minAxeWarmupMs: 0, startupProbeMs: 50 });
  setScreenRecordingSpawnForTesting((cmd, args) => {
    spawned.push({ cmd, args });
    const outIdx = args.indexOf("--output");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
    return createFakeRecorderChild({
      outputPath: outPath,
      writeBytesOnSignal: "FAKE_MP4_DATA_123456",
      stderrOnStart: "Recording the measured active display;\n",
    });
  });

  try {
    const started = await recordScreenWithRuntime({
      sessionId: "sess-rec-ios-1",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "start",
      outputPath: keptPath,
      fps: 12,
      scale: 0.5,
    });
    assert.equal(started.status, "success");
    assert.equal(started.data.mode, "start");
    assert.equal(started.data.backend, "axe");
    assert.equal(started.data.fps, 12);
    assert.equal(started.data.scale, 0.5);
    assert.equal(started.data.recordingActive, true);
    assert.ok(started.data.recordingId);
    assert.equal(spawned[0]?.cmd, "axe");
    const scaleIdx = spawned[0]?.args.indexOf("--scale") ?? -1;
    assert.ok(scaleIdx >= 0 && spawned[0]?.args[scaleIdx + 1] === "0.5", "should pass --scale 0.5 to axe record-video");
    assert.equal(
      spawned[0]?.args.includes("--follow-active-display"),
      false,
      "background record_screen must not hold AXe's exclusive --follow-active-display lock",
    );

    // Duplicate start on same device fails cleanly
    const dup = await recordScreenWithRuntime({
      sessionId: "sess-rec-ios-1",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "start",
      outputPath: discardedPath,
    });
    assert.equal(dup.status, "failed");
    assert.equal(dup.reasonCode, REASON_CODES.configurationError);

    const stopped = await recordScreenWithRuntime({
      sessionId: "sess-rec-ios-1",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "stop",
      recordingId: started.data.recordingId,
    });
    assert.equal(stopped.status, "success");
    assert.equal(stopped.data.mode, "stop");
    assert.equal(stopped.data.discarded, false);
    assert.equal(stopped.data.backend, "axe");
    assert.equal(stopped.data.sizeBytes, 20);
    assert.deepEqual(stopped.artifacts, [keptPath]);
    assert.equal(await readFile(keptPath, "utf8"), "FAKE_MP4_DATA_123456");

    // Start + stop with discardOnStop: true deletes the file
    const started2 = await recordScreenWithRuntime({
      sessionId: "sess-rec-ios-1",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "start",
      outputPath: discardedPath,
    });
    assert.equal(started2.status, "success");

    const discarded = await recordScreenWithRuntime({
      sessionId: "sess-rec-ios-1",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "stop",
      recordingId: started2.data.recordingId,
      discardOnStop: true,
    });
    assert.equal(discarded.status, "success");
    assert.equal(discarded.data.discarded, true);
    assert.equal(discarded.data.sizeBytes, 0);
    assert.deepEqual(discarded.artifacts, []);
    await assert.rejects(() => stat(discardedPath));
  } finally {
    await cleanupActiveRecordingsForSession("sess-rec-ios-1");
    resetScreenRecordingForTesting();
  }
});

test("iOS simulator record_screen start falls back to simctl when axe record-video fails startup", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "m2e-rec-ios-fb-"));
  const outPath = path.join(workDir, "videos/fallback.mp4");

  setScreenRecordingTimingsForTesting({ minAxeWarmupMs: 0, startupProbeMs: 50 });
  setScreenRecordingSpawnForTesting((cmd, args) => {
    if (cmd === "axe") {
      return createFakeRecorderChild({
        failImmediatelyCode: 127,
        failStderr: "axe: command not found",
      });
    }
    return createFakeRecorderChild({
      outputPath: args[args.length - 1],
      writeBytesOnSignal: "SIMCTL_MP4_BYTES",
      stderrOnStart: "Recording started\n",
    });
  });

  try {
    const started = await recordScreenWithRuntime({
      sessionId: "sess-rec-fb",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "start",
      outputPath: outPath,
    });
    assert.equal(started.status, "success");
    assert.equal(started.attempts, 2);
    assert.equal(started.data.backend, "simctl");
    assert.deepEqual(started.data.commandLabels, ["record_start_axe", "record_start_simctl_fallback"]);

    const stopped = await recordScreenWithRuntime({
      sessionId: "sess-rec-fb",
      platform: "ios",
      mode: "stop",
    });
    assert.equal(stopped.status, "success");
    assert.equal(stopped.data.backend, "simctl");
    assert.equal(stopped.data.sizeBytes, 16);
  } finally {
    await cleanupActiveRecordingsForSession("sess-rec-fb");
    resetScreenRecordingForTesting();
  }
});

test("Android record_screen start/stop pulls video on keep and skips pull on discard", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "m2e-rec-android-"));
  const outPath = path.join(workDir, "videos/android.mp4");
  const executedAdb: string[][] = [];

  setScreenRecordingTimingsForTesting({ startupProbeMs: 40 });
  setScreenRecordingSpawnForTesting(() =>
    createFakeRecorderChild({
      stderrOnStart: "",
    }),
  );
  setExecuteRunnerForTesting(async (command) => {
    executedAdb.push(command);
    if (command.includes("pull")) {
      await writeFile(command[command.length - 1], "ANDROID_MP4", "utf8");
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  try {
    const start1 = await recordScreenWithRuntime({
      sessionId: "sess-rec-and",
      platform: "android",
      deviceId: "emulator-5554",
      mode: "start",
      outputPath: outPath,
    });
    assert.equal(start1.status, "success");
    assert.equal(start1.data.backend, "adb");

    const stop1 = await recordScreenWithRuntime({
      sessionId: "sess-rec-and",
      platform: "android",
      deviceId: "emulator-5554",
      mode: "stop",
      recordingId: start1.data.recordingId,
    });
    assert.equal(stop1.status, "success");
    assert.equal(stop1.data.sizeBytes, 11);
    assert.ok(executedAdb.some((c) => c.includes("pull")));
    assert.ok(executedAdb.some((c) => c.includes("rm")));

    executedAdb.length = 0;
    const start2 = await recordScreenWithRuntime({
      sessionId: "sess-rec-and",
      platform: "android",
      deviceId: "emulator-5554",
      mode: "start",
      outputPath: path.join(workDir, "videos/android-drop.mp4"),
    });
    assert.equal(start2.status, "success");

    const stop2 = await recordScreenWithRuntime({
      sessionId: "sess-rec-and",
      platform: "android",
      deviceId: "emulator-5554",
      mode: "stop",
      recordingId: start2.data.recordingId,
      discardOnStop: true,
    });
    assert.equal(stop2.status, "success");
    assert.equal(stop2.data.discarded, true);
    assert.equal(executedAdb.some((c) => c.includes("pull")), false);
    assert.equal(executedAdb.some((c) => c.includes("rm")), true);
  } finally {
    await cleanupActiveRecordingsForSession("sess-rec-and");
    resetScreenRecordingForTesting();
    resetExecuteRunnerForTesting();
  }
});

test("iOS physical device returns UNSUPPORTED_OPERATION and cleanupActiveRecordingsForSession clears leaks", async () => {
  const physStart = await recordScreenWithRuntime({
    sessionId: "sess-phys",
    platform: "ios",
    deviceId: PHYSICAL_UDID,
    mode: "start",
  });
  assert.equal(physStart.status, "failed");
  assert.equal(physStart.reasonCode, REASON_CODES.unsupportedOperation);

  const physFixed = await recordScreenWithRuntime({
    sessionId: "sess-phys",
    platform: "ios",
    deviceId: PHYSICAL_UDID,
    mode: "fixed",
    durationMs: 2000,
  });
  assert.equal(physFixed.status, "failed");
  assert.equal(physFixed.reasonCode, REASON_CODES.unsupportedOperation);

  // Verify leaked recording cleanup
  const workDir = await mkdtemp(path.join(tmpdir(), "m2e-rec-leak-"));
  const leakPath = path.join(workDir, "leak.mp4");
  setScreenRecordingTimingsForTesting({ minAxeWarmupMs: 0, startupProbeMs: 40 });
  setScreenRecordingSpawnForTesting((_cmd, args) => {
    const outIdx = args.indexOf("--output");
    return createFakeRecorderChild({
      outputPath: outIdx >= 0 ? args[outIdx + 1] : undefined,
      writeBytesOnSignal: "PARTIAL",
      stderrOnStart: "Recording started\n",
    });
  });
  try {
    const started = await recordScreenWithRuntime({
      sessionId: "sess-leak-clean",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "start",
      outputPath: leakPath,
    });
    assert.equal(started.status, "success");
    assert.equal(listActiveRecordingsForTesting().length, 1);

    await cleanupActiveRecordingsForSession("sess-leak-clean");
    assert.equal(listActiveRecordingsForTesting().length, 0);
    await assert.rejects(() => stat(leakPath));
  } finally {
    resetScreenRecordingForTesting();
  }
});

test("forceCleanupAllRuntimeResourcesSync synchronously SIGKILLs active recordings", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "m2e-rec-sigkill-"));
  const activePath = path.join(workDir, "active.mp4");
  let spawnedChild: (ChildProcess & { signals: string[] }) | undefined;
  setScreenRecordingTimingsForTesting({ minAxeWarmupMs: 0, startupProbeMs: 40 });
  setScreenRecordingSpawnForTesting((_cmd, args) => {
    const outIdx = args.indexOf("--output");
    spawnedChild = createFakeRecorderChild({
      outputPath: outIdx >= 0 ? args[outIdx + 1] : undefined,
      stderrOnStart: "Recording started\n",
    });
    return spawnedChild;
  });
  try {
    const started = await recordScreenWithRuntime({
      sessionId: "sess-sync-kill",
      platform: "ios",
      deviceId: SIM_UDID,
      mode: "start",
      outputPath: activePath,
    });
    assert.equal(started.status, "success");
    assert.equal(listActiveRecordingsForTesting().length, 1);

    forceCleanupAllRuntimeResourcesSync();
    assert.equal(listActiveRecordingsForTesting().length, 0);
    assert.deepEqual(spawnedChild?.signals, ["SIGKILL"]);
  } finally {
    resetScreenRecordingForTesting();
  }
});
