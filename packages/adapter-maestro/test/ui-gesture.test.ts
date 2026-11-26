import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { AxeSimulatorBackend } from "../src/ios-backend-axe.ts";
import { setExecuteRunnerForTesting } from "../src/runtime-shared.ts";
import { performGestureWithMaestroTool } from "../src/ui-action-gesture.ts";
import { normalizePerformGesture, resolveGestureCoordinates } from "../src/ui-gesture-model.ts";
import { createAndroidUiRuntimeHooks } from "../src/ui-runtime-android.ts";

test("AxeSimulatorBackend builds draw, drag, pinch, double_tap, and two_finger_tap commands", () => {
  const axe = new AxeSimulatorBackend();

  assert.deepEqual(
    axe.buildDrawCommand("SIM-UDID", {
      points: [{ x: 100, y: 200 }, { x: 240, y: 320 }, { x: 320, y: 410 }],
      durationMs: 800,
      close: true,
      preDelayMs: 100,
      postDelayMs: 250,
    }),
    ["axe", "draw", "100,200", "240,320", "320,410", "--duration", "0.8", "--close", "--pre-delay", "0.1", "--post-delay", "0.25", "--udid", "SIM-UDID"],
  );

  assert.deepEqual(
    axe.buildDragCommand("SIM-UDID", {
      start: { x: 200, y: 300 },
      end: { x: 200, y: 600 },
      durationMs: 1500,
      steps: 40,
      holdMs: 600,
    }),
    ["axe", "drag", "--start-x", "200", "--start-y", "300", "--end-x", "200", "--end-y", "600", "--duration", "1.5", "--steps", "40", "--hold", "0.6", "--udid", "SIM-UDID"],
  );

  assert.deepEqual(
    axe.buildMultiTouchGestureCommand("SIM-UDID", {
      type: "pinch",
      scale: 1.5,
      center: { x: 500, y: 600 },
      radius: 120,
      durationMs: 500,
      delta: 10,
    }),
    ["axe", "gesture", "pinch", "--scale", "1.5", "-x", "500", "-y", "600", "--radius", "120", "--duration", "0.5", "--delta", "10", "--udid", "SIM-UDID"],
  );

  assert.deepEqual(
    axe.buildMultiTouchGestureCommand("SIM-UDID", {
      type: "double_tap",
      point: { x: 120, y: 240 },
      intervalMs: 120,
    }),
    ["axe", "gesture", "double-tap", "-x", "120", "-y", "240", "--interval", "0.12", "--udid", "SIM-UDID"],
  );

  assert.deepEqual(
    axe.buildMultiTouchGestureCommand("SIM-UDID", {
      type: "two_finger_tap",
      point1: { x: 300, y: 400 },
      point2: { x: 380, y: 400 },
    }),
    ["axe", "gesture", "two-finger-tap", "-x", "300", "-y", "400", "--x2", "380", "--y2", "400", "--udid", "SIM-UDID"],
  );
});

test("normalizePerformGesture and resolveGestureCoordinates handle containerBounds and validation", () => {
  const normalized = normalizePerformGesture({
    type: "draw",
    coordinateMode: "normalized",
    containerBounds: { x: 300, y: 300, width: 600, height: 800 },
    points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.5 }],
  });
  assert.equal(typeof normalized, "object");
  if (typeof normalized === "string") throw new Error(normalized);

  const resolved = resolveGestureCoordinates(normalized);
  assert.equal(resolved.coordinateScope, "container");
  assert.deepEqual(resolved.resolvedPoints, [{ x: 450, y: 500 }, { x: 750, y: 700 }]);

  const outOfRange = normalizePerformGesture({
    type: "double_tap",
    coordinateMode: "normalized",
    point: { x: 1.2, y: 0.5 },
  });
  assert.equal(typeof outOfRange, "string");
  assert.match(String(outOfRange), /within \[0, 1\]/);

  const badPinch = normalizePerformGesture({
    type: "pinch",
    scale: 1,
  });
  assert.equal(typeof badPinch, "string");
  assert.match(String(badPinch), /scale/);
});

test("Android gesture hooks distinguish partial support vs unsupported multi-touch", () => {
  const hooks = createAndroidUiRuntimeHooks();
  const dragPlan = hooks.buildGestureCommands?.("emulator-5554", {
    type: "drag",
    coordinateMode: "absolute",
    start: { x: 100, y: 200 },
    end: { x: 300, y: 400 },
    durationMs: 500,
  });
  assert.equal(dragPlan?.supported, true);
  assert.deepEqual(dragPlan?.supported ? dragPlan.commands : [], [
    ["adb", "-s", "emulator-5554", "shell", "input", "swipe", "100", "200", "300", "400", "500"],
  ]);

  const pinchPlan = hooks.buildGestureCommands?.("emulator-5554", {
    type: "pinch",
    coordinateMode: "absolute",
    scale: 2,
    durationMs: 600,
  });
  assert.equal(pinchPlan?.supported, false);
});

test("performGestureWithMaestroTool returns dry-run preview and rejects unsupported ops cleanly", async () => {
  const iosPreview = await performGestureWithMaestroTool({
    sessionId: "gesture-ios-preview",
    platform: "ios",
    deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
    dryRun: true,
    gesture: {
      type: "pinch",
      scale: 1.4,
      coordinateMode: "normalized",
      containerBounds: { x: 200, y: 200, width: 400, height: 600 },
      radius: 100,
      durationMs: 500,
    },
  });
  assert.equal(iosPreview.status, "success");
  assert.equal(iosPreview.data.backendId, "axe");
  assert.equal(iosPreview.data.coordinateScope, "container");
  assert.deepEqual(iosPreview.data.resolvedPoints, [{ x: 400, y: 500 }]);
  assert.deepEqual(iosPreview.data.commandHistory[0], [
    "axe", "gesture", "pinch", "--scale", "1.4", "-x", "400", "-y", "500", "--radius", "100", "--duration", "0.5", "--udid", "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
  ]);

  const androidMultiPointDraw = await performGestureWithMaestroTool({
    sessionId: "gesture-android-unsupported",
    platform: "android",
    deviceId: "emulator-5554",
    dryRun: true,
    gesture: {
      type: "draw",
      points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }],
    },
  });
  assert.equal(androidMultiPointDraw.status, "failed");
  assert.equal(androidMultiPointDraw.reasonCode, REASON_CODES.unsupportedOperation);
});

test("sequence gesture coalesces draw/sleep into axe batch and isolates drag/pinch on iOS", async () => {
  const axe = new AxeSimulatorBackend();
  const drawSeq = axe.buildBatchGestureCommands("SIM-UDID", [
    { type: "draw", points: [{ x: 100, y: 200 }, { x: 200, y: 300 }], durationMs: 400 },
    { type: "sleep", durationMs: 150 },
    { type: "draw", points: [{ x: 150, y: 250 }, { x: 260, y: 340 }], durationMs: 400 },
    { type: "sleep", durationMs: 180 },
    { type: "pinch", scale: 1.4, center: { x: 300, y: 400 }, durationMs: 500 },
  ]);
  assert.deepEqual(drawSeq.commands, [
    [
      "axe", "batch", "--udid", "SIM-UDID",
      "--step", "draw 100,200 200,300 --duration 0.4",
      "--step", "sleep 0.15",
      "--step", "draw 150,250 260,340 --duration 0.4",
    ],
    [
      "axe", "gesture", "pinch", "--scale", "1.4", "-x", "300", "-y", "400", "--duration", "0.5", "--udid", "SIM-UDID",
    ],
  ]);
  assert.deepEqual(drawSeq.stepDelaysMs, [180, 0]);

  const mixed = axe.buildBatchGestureCommands("SIM-UDID", [
    { type: "draw", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], durationMs: 300 },
    { type: "drag", start: { x: 50, y: 50 }, end: { x: 150, y: 50 }, durationMs: 500 },
    { type: "sleep", durationMs: 160 },
    { type: "draw", points: [{ x: 30, y: 30 }, { x: 40, y: 40 }], durationMs: 300 },
  ]);
  assert.equal(mixed.commands.length, 3);
  assert.equal(mixed.commands[0]?.[1], "batch");
  assert.equal(mixed.commands[1]?.[1], "drag");
  assert.equal(mixed.commands[2]?.[1], "batch");
  assert.deepEqual(mixed.stepDelaysMs, [0, 160, 0]);

  const preview = await performGestureWithMaestroTool({
    sessionId: "gesture-ios-sequence",
    platform: "ios",
    deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
    dryRun: true,
    gesture: {
      type: "sequence",
      coordinateMode: "normalized",
      containerBounds: { x: 100, y: 100, width: 400, height: 400 },
      steps: [
        { type: "draw", points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }], durationMs: 300 },
        { type: "sleep", durationMs: 200 },
        { type: "pinch", scale: 1.25, durationMs: 400 },
      ],
    },
  });
  assert.equal(preview.status, "success");
  assert.equal(preview.data.gestureType, "sequence");
  assert.equal(preview.data.stepCount, 3);
  assert.equal(preview.data.coordinateScope, "container");
  assert.equal(preview.data.commandHistory.length, 2);
  assert.equal(preview.data.commandHistory[0]?.[1], "batch");
  assert.equal(preview.data.commandHistory[1]?.[1], "gesture");
  assert.deepEqual(preview.data.resolvedPoints, [
    { x: 200, y: 200 },
    { x: 400, y: 200 },
    { x: 300, y: 300 },
  ]);
});

test("sequence gesture validates limits and handles Android partial support cleanly", async () => {
  assert.match(String(normalizePerformGesture({ type: "sequence", steps: [] })), /1 to 64 steps/);
  assert.match(
    String(normalizePerformGesture({ type: "sequence", steps: [{ type: "sleep", durationMs: 100 }] })),
    /at least 1 non-sleep/,
  );
  assert.match(
    String(normalizePerformGesture({
      type: "sequence",
      steps: [{ type: "sequence", steps: [{ type: "sleep", durationMs: 100 }] } as never],
    })),
    /Nested sequence/,
  );

  const hooks = createAndroidUiRuntimeHooks();
  const normalizedAndroid = normalizePerformGesture({
    type: "sequence",
    coordinateMode: "absolute",
    steps: [
      { type: "drag", start: { x: 10, y: 20 }, end: { x: 100, y: 20 }, durationMs: 300 },
      { type: "sleep", durationMs: 120 },
      { type: "double_tap", point: { x: 50, y: 60 }, intervalMs: 80 },
    ],
  });
  assert.equal(typeof normalizedAndroid, "object");
  if (typeof normalizedAndroid === "string") throw new Error(normalizedAndroid);
  const resolvedAndroid = resolveGestureCoordinates(normalizedAndroid);
  const androidPlan = hooks.buildGestureCommands?.("emulator-5554", resolvedAndroid.resolved);
  assert.equal(androidPlan?.supported, true);
  if (androidPlan?.supported) {
    assert.equal(androidPlan.commands.length, 3);
    assert.deepEqual(androidPlan.stepDelaysMs, [120, 80, 0]);
    assert.equal(androidPlan.supportLevel, "partial");
  }

  const androidPinchSeq = await performGestureWithMaestroTool({
    sessionId: "gesture-android-seq-unsupported",
    platform: "android",
    deviceId: "emulator-5554",
    dryRun: true,
    gesture: {
      type: "sequence",
      steps: [
        { type: "drag", start: { x: 10, y: 20 }, end: { x: 100, y: 20 } },
        { type: "pinch", scale: 1.5 },
      ],
    },
  });
  assert.equal(androidPinchSeq.status, "failed");
  assert.equal(androidPinchSeq.reasonCode, REASON_CODES.unsupportedOperation);
});

test("performGestureWithMaestroTool retries transient AXe Input stopped once and exposes failed subcommand stderr and index", async () => {
  try {
    let transientCalls = 0;
    setExecuteRunnerForTesting(async () => {
      transientCalls += 1;
      if (transientCalls === 1) {
        return { exitCode: 1, stdout: "", stderr: "Error: Input stopped unexpectedly" };
      }
      return { exitCode: 0, stdout: "ok", stderr: "" };
    });

    const recovered = await performGestureWithMaestroTool({
      sessionId: "gesture-retry-recover",
      platform: "ios",
      deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
      settleDelayMs: 0,
      gesture: {
        type: "draw",
        coordinateMode: "absolute",
        points: [{ x: 100, y: 200 }, { x: 200, y: 240 }],
        durationMs: 200,
      },
    });
    assert.equal(recovered.status, "success");
    assert.equal(recovered.reasonCode, REASON_CODES.ok);
    assert.equal(recovered.attempts, 2);
    assert.equal(recovered.data.commandHistory.length, 2);
    assert.equal(recovered.data.failedCommandIndex, undefined);
    assert.equal(recovered.data.stderrSummary, undefined);

    let repeatedCalls = 0;
    setExecuteRunnerForTesting(async () => {
      repeatedCalls += 1;
      return { exitCode: 1, stdout: "", stderr: "Error: Input stopped persistently" };
    });

    const cappedRetry = await performGestureWithMaestroTool({
      sessionId: "gesture-retry-cap",
      platform: "ios",
      deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
      settleDelayMs: 0,
      gesture: {
        type: "draw",
        coordinateMode: "absolute",
        points: [{ x: 100, y: 200 }, { x: 200, y: 240 }],
        durationMs: 200,
      },
    });
    assert.equal(repeatedCalls, 2);
    assert.equal(cappedRetry.status, "failed");
    assert.equal(cappedRetry.attempts, 2);
    assert.equal(cappedRetry.data.failedCommandIndex, 0);
    assert.equal(cappedRetry.data.stderrSummary, "Error: Input stopped persistently");
    assert.match(cappedRetry.nextSuggestions[0] ?? "", /command 1\/1 \(axe draw\)/);
    assert.match(cappedRetry.nextSuggestions[0] ?? "", /Input stopped persistently/);

    let seqCalls = 0;
    setExecuteRunnerForTesting(async () => {
      seqCalls += 1;
      if (seqCalls === 1) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "Error: Step 1 failed\n  [gesture] pinch rejected" };
    });

    const seqFailed = await performGestureWithMaestroTool({
      sessionId: "gesture-seq-stderr",
      platform: "ios",
      deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
      settleDelayMs: 0,
      gesture: {
        type: "sequence",
        coordinateMode: "absolute",
        steps: [
          { type: "draw", points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], durationMs: 200 },
          { type: "pinch", scale: 1.4, center: { x: 300, y: 400 }, durationMs: 200 },
          { type: "drag", start: { x: 50, y: 60 }, end: { x: 150, y: 160 }, durationMs: 200 },
        ],
      },
    });
    assert.equal(seqCalls, 2);
    assert.equal(seqFailed.status, "failed");
    assert.equal(seqFailed.attempts, 1);
    assert.equal(seqFailed.data.commandHistory.length, 2);
    assert.equal(seqFailed.data.failedCommandIndex, 1);
    assert.equal(seqFailed.data.stderrSummary, "Error: Step 1 failed [gesture] pinch rejected");
    assert.match(seqFailed.nextSuggestions[0] ?? "", /command 2\/3 \(axe gesture pinch\)/);
    assert.match(seqFailed.nextSuggestions[0] ?? "", /exitCode=1/);
    assert.match(seqFailed.nextSuggestions[0] ?? "", /Error: Step 1 failed \[gesture\] pinch rejected/);
  } finally {
    setExecuteRunnerForTesting(null);
  }
});
