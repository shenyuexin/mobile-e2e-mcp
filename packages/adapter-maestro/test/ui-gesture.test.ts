import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { AxeSimulatorBackend } from "../src/ios-backend-axe.ts";
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
