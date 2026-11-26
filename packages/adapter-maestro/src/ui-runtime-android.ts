import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import { CLI_COMMANDS } from "./constants/cli-commands.js";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import type { UiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { buildAndroidUiDumpCommands } from "./ui-runtime.js";

export function createAndroidUiRuntimeHooks(): UiRuntimePlatformHooks {
  return {
    platform: "android",
    requiresProbe: false,
    probeFailureReasonCode: REASON_CODES.configurationError,
    buildTapCommand: (deviceId, x, y) => [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", ACTION_TYPES.tap, String(x), String(y)],
    buildBackPressedCommand: (deviceId) => [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", "keyevent", "4"],
    buildTypeTextCommand: (deviceId, text) => [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", "text", text.replaceAll(" ", "%s")],
    buildSwipeCommand: (deviceId, swipe) => [
      CLI_COMMANDS.adb,
      "-s",
      deviceId,
      "shell",
      "input",
      ACTION_TYPES.swipe,
      String(swipe.start.x),
      String(swipe.start.y),
      String(swipe.end.x),
      String(swipe.end.y),
      String(swipe.durationMs),
    ],
    buildGestureCommands: (deviceId, gesture) => {
      if (gesture.type === "drag") {
        const hasCaveat = gesture.holdMs !== undefined || gesture.steps !== undefined;
        return {
          supported: true,
          commands: [
            [
              CLI_COMMANDS.adb,
              "-s",
              deviceId,
              "shell",
              "input",
              ACTION_TYPES.swipe,
              String(Math.round(gesture.start.x)),
              String(Math.round(gesture.start.y)),
              String(Math.round(gesture.end.x)),
              String(Math.round(gesture.end.y)),
              String(gesture.durationMs),
            ],
          ],
          supportLevel: hasCaveat ? "partial" : "full",
          backendId: "adb",
          ...(hasCaveat ? { caveat: "Android adb swipe ignores holdMs/steps parameters." } : {}),
        };
      }
      if (gesture.type === "draw" && gesture.points.length === 2 && !gesture.close) {
        return {
          supported: true,
          commands: [
            [
              CLI_COMMANDS.adb,
              "-s",
              deviceId,
              "shell",
              "input",
              ACTION_TYPES.swipe,
              String(Math.round(gesture.points[0].x)),
              String(Math.round(gesture.points[0].y)),
              String(Math.round(gesture.points[1].x)),
              String(Math.round(gesture.points[1].y)),
              String(gesture.durationMs),
            ],
          ],
          supportLevel: "partial",
          backendId: "adb",
          caveat: "2-point Android draw executes via adb input swipe.",
        };
      }
      if (gesture.type === "double_tap") {
        const x = String(Math.round(gesture.point.x));
        const y = String(Math.round(gesture.point.y));
        const tapCmd = [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", ACTION_TYPES.tap, x, y];
        return {
          supported: true,
          commands: [tapCmd, [...tapCmd]],
          interCommandDelayMs: gesture.intervalMs,
          supportLevel: "partial",
          backendId: "adb",
          caveat: "Android double_tap dispatches two sequential adb input tap commands.",
        };
      }
      return {
        supported: false,
        backendId: "adb",
        reason: `Android adb input does not natively support '${gesture.type}' (${gesture.type === "draw" ? `${gesture.points.length} points` : "multi-touch"}).`,
        suggestion: "Use drag, 2-point draw, or double_tap on Android; multi-point draw, pinch, and two_finger_tap require iOS simulator with AXe.",
      };
    },
    buildHierarchyCapturePreviewCommand: (deviceId) => {
      const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
      return [...dumpCommand, ...readCommand];
    },
    probeUnavailableSuggestion: () => "Android UI runtime is unavailable. Check adb availability and selected device state.",
    tapDryRunSuggestion: "Run tap without dryRun to perform the actual Android coordinate tap.",
    tapFailureSuggestion: "Check Android device state and coordinates before retrying tap.",
    typeTextDryRunSuggestion: "Run type_text without dryRun to perform Android text entry.",
    typeTextFailureSuggestion: "Check Android device state and focused input field before retrying type_text.",
  };
}
