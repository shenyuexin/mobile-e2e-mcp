import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import { CLI_COMMANDS } from "./constants/cli-commands.js";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { executeRunnerWithTestHooks } from "./runtime-shared.js";
import type { UiKeyboardStateProbe, UiKeyboardVisibility, UiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { buildAndroidUiDumpCommands } from "./ui-runtime.js";

const ANDROID_KEYBOARD_PROBE_TIMEOUT_MS = 3000;

export function buildAndroidKeyboardStateCommand(deviceId: string): string[] {
  return [CLI_COMMANDS.adb, "-s", deviceId, "shell", "dumpsys", "input_method"];
}

export function classifyAndroidKeyboardState(inputMethodDump: string): {
  visibility: UiKeyboardVisibility;
  reason: string;
} {
  const normalized = inputMethodDump.toLowerCase();
  if (
    /\bminputshown\s*=\s*true\b/i.test(inputMethodDump) ||
    /\bmisinputviewshown\s*=\s*true\b/i.test(inputMethodDump) ||
    /\binputshown\s*=\s*true\b/i.test(inputMethodDump) ||
    /\bimewindowvis\s*=\s*0x[1-9a-f]/i.test(inputMethodDump)
  ) {
    return { visibility: "visible", reason: "input_method_visible" };
  }
  if (
    /\bminputshown\s*=\s*false\b/i.test(inputMethodDump) ||
    /\bmisinputviewshown\s*=\s*false\b/i.test(inputMethodDump) ||
    /\binputshown\s*=\s*false\b/i.test(inputMethodDump) ||
    /\bimewindowvis\s*=\s*0x0\b/i.test(inputMethodDump)
  ) {
    return { visibility: "hidden", reason: "input_method_hidden" };
  }
  if (normalized.includes("input method") || normalized.includes("ime")) {
    return { visibility: "unknown", reason: "input_method_state_ambiguous" };
  }
  return { visibility: "unknown", reason: "input_method_state_unavailable" };
}

export function extractAndroidImeType(inputMethodDump: string): string | undefined {
  const match = /\bmCurId=([^\s]+)/i.exec(inputMethodDump);
  return match?.[1]?.trim() || undefined;
}

export async function probeAndroidKeyboardState(params: {
  repoRoot: string;
  deviceId: string;
}): Promise<UiKeyboardStateProbe> {
  const command = buildAndroidKeyboardStateCommand(params.deviceId);
  const execution = await executeRunnerWithTestHooks(
    command,
    params.repoRoot,
    process.env,
    { timeoutMs: ANDROID_KEYBOARD_PROBE_TIMEOUT_MS },
  );
  const classification =
    execution.exitCode === 0
      ? classifyAndroidKeyboardState(execution.stdout)
      : { visibility: "unknown" as const, reason: "input_method_probe_failed" };
  const imeType = execution.exitCode === 0 ? extractAndroidImeType(execution.stdout) : undefined;
  return {
    checked: true,
    platform: "android",
    command,
    exitCode: execution.exitCode,
    ...(imeType ? { imeType } : {}),
    ...classification,
  };
}

export async function settleBeforeAndroidKeyboardRecheck(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

export function createAndroidUiRuntimeHooks(): UiRuntimePlatformHooks {
  return {
    platform: "android",
    requiresProbe: false,
    probeFailureReasonCode: REASON_CODES.configurationError,
    probeKeyboardState: probeAndroidKeyboardState,
    settleBeforeKeyboardRecheck: settleBeforeAndroidKeyboardRecheck,
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
      const buildAtomicPlan = (
        atomic: Exclude<typeof gesture, { type: "sequence" }>,
      ): ReturnType<NonNullable<UiRuntimePlatformHooks["buildGestureCommands"]>> => {
        if (atomic.type === "drag") {
          const hasCaveat = atomic.holdMs !== undefined || atomic.steps !== undefined;
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
                String(Math.round(atomic.start.x)),
                String(Math.round(atomic.start.y)),
                String(Math.round(atomic.end.x)),
                String(Math.round(atomic.end.y)),
                String(atomic.durationMs),
              ],
            ],
            supportLevel: hasCaveat ? "partial" : "full",
            backendId: "adb",
            ...(hasCaveat ? { caveat: "Android adb swipe ignores holdMs/steps parameters." } : {}),
          };
        }
        if (atomic.type === "draw" && atomic.points.length === 2 && !atomic.close) {
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
                String(Math.round(atomic.points[0].x)),
                String(Math.round(atomic.points[0].y)),
                String(Math.round(atomic.points[1].x)),
                String(Math.round(atomic.points[1].y)),
                String(atomic.durationMs),
              ],
            ],
            supportLevel: "partial",
            backendId: "adb",
            caveat: "2-point Android draw executes via adb input swipe.",
          };
        }
        if (atomic.type === "double_tap") {
          const x = String(Math.round(atomic.point.x));
          const y = String(Math.round(atomic.point.y));
          const tapCmd = [CLI_COMMANDS.adb, "-s", deviceId, "shell", "input", ACTION_TYPES.tap, x, y];
          return {
            supported: true,
            commands: [tapCmd, [...tapCmd]],
            interCommandDelayMs: atomic.intervalMs,
            supportLevel: "partial",
            backendId: "adb",
            caveat: "Android double_tap dispatches two sequential adb input tap commands.",
          };
        }
        return {
          supported: false,
          backendId: "adb",
          reason: `Android adb input does not natively support '${atomic.type}' (${atomic.type === "draw" ? `${atomic.points.length} points` : "multi-touch"}).`,
          suggestion: "Use drag, 2-point draw, or double_tap on Android; multi-point draw, pinch, and two_finger_tap require iOS simulator with AXe.",
        };
      };

      if (gesture.type !== "sequence") {
        return buildAtomicPlan(gesture);
      }

      const commands: string[][] = [];
      const stepDelaysMs: number[] = [];
      const caveats: string[] = [];

      for (const step of gesture.steps) {
        if (step.type === "sleep") {
          if (commands.length > 0) {
            const prevIdx = commands.length - 1;
            stepDelaysMs[prevIdx] = (stepDelaysMs[prevIdx] ?? 0) + step.durationMs;
          }
          continue;
        }
        const subPlan = buildAtomicPlan(step);
        if (!subPlan.supported) {
          return subPlan;
        }
        for (let i = 0; i < subPlan.commands.length; i += 1) {
          commands.push(subPlan.commands[i]!);
          const delayAfterCmd = i < subPlan.commands.length - 1 ? (subPlan.interCommandDelayMs ?? 0) : 0;
          stepDelaysMs.push(delayAfterCmd);
        }
        if (subPlan.caveat && !caveats.includes(subPlan.caveat)) {
          caveats.push(subPlan.caveat);
        }
      }

      return {
        supported: true,
        commands,
        stepDelaysMs,
        commandTimeoutMs: Math.max(30000, gesture.durationMs + 15000),
        supportLevel: "partial",
        backendId: "adb",
        ...(caveats.length > 0 ? { caveat: caveats.join(" ") } : {}),
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
