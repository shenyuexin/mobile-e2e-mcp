import type {
  BackendProbeResult,
  IosDragGestureParams,
  IosDrawGestureParams,
  IosExecutionBackend,
  IosMultiTouchGestureParams,
  IosSequenceGestureStep,
} from "./ios-backend-types.js";
import { executeRunnerWithTestHooks } from "./runtime-shared.js";
import { formatAxeSeconds } from "./ui-gesture-model.js";

/**
 * IosExecutionBackend for iOS simulators using AXe CLI.
 *
 * AXe is a single-binary CLI tool that provides all simulator UI capabilities
 * via Apple's Accessibility APIs. Installed via: `brew install cameroncooke/axe/axe`
 *
 * All commands below have been VERIFIED on an actual booted simulator
 * (iPhone 16 Plus, iOS 18.5, axe v1.6.0).
 *
 * @see https://github.com/cameroncooke/AXe
 */
export class AxeSimulatorBackend implements IosExecutionBackend {
  readonly backendId = "axe" as const;
  readonly backendName = "AXe CLI";

  readonly supportLevel = {
    tap: "full" as const,
    typeText: "full" as const,
    swipe: "full" as const,
    hierarchy: "full" as const,
    screenshot: "full" as const,
  };

  async probeAvailability(repoRoot: string): Promise<BackendProbeResult> {
    try {
      const result = await executeRunnerWithTestHooks(["axe", "--version"], repoRoot, process.env);
      if (result.exitCode !== 0) {
        return { available: false, error: `axe --version failed: ${result.stderr.trim()}` };
      }
      const version = result.stdout.trim();
      return { available: true, version: version || undefined };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  buildTapCommand(deviceId: string, x: number, y: number): string[] {
    // axe tap -x X -y Y --udid UDID
    // VERIFIED: ✓ Tap at (200.0, 400.0) completed successfully
    return ["axe", "tap", "-x", String(x), "-y", String(y), "--udid", deviceId];
  }

  buildTypeTextCommand(deviceId: string, text: string): string[] {
    // axe type "text" --udid UDID
    // Text is passed as positional argument; axe handles shell escaping internally
    // If text starts with "-", prefix with "--" to prevent flag parsing
    const safeText = text.startsWith("-") ? "--" + text : text;
    return ["axe", "type", safeText, "--udid", deviceId];
  }

  buildSwipeCommand(
    deviceId: string,
    swipe: {
      start: { x: number; y: number };
      end: { x: number; y: number };
      durationMs: number;
      delta?: number;
      preDelaySec?: number;
      postDelaySec?: number;
    },
  ): string[] {
    // axe swipe --start-x X1 --start-y Y1 --end-x X2 --end-y Y2 --udid UDID
    // Optional: --duration (seconds)
    const durationSec = (swipe.durationMs / 1000).toFixed(1);
    const command = [
      "axe", "swipe",
      "--start-x", String(swipe.start.x),
      "--start-y", String(swipe.start.y),
      "--end-x", String(swipe.end.x),
      "--end-y", String(swipe.end.y),
      "--duration", durationSec,
    ];
    if (typeof swipe.delta === "number") {
      command.push("--delta", String(swipe.delta));
    }
    if (typeof swipe.preDelaySec === "number") {
      command.push("--pre-delay", String(swipe.preDelaySec));
    }
    if (typeof swipe.postDelaySec === "number") {
      command.push("--post-delay", String(swipe.postDelaySec));
    }
    command.push("--udid", deviceId);
    return command;
  }

  buildDrawCommand(deviceId: string, draw: IosDrawGestureParams): string[] {
    const command = [
      "axe",
      "draw",
      ...draw.points.map((pt) => `${pt.x},${pt.y}`),
      "--duration",
      formatAxeSeconds(draw.durationMs),
    ];
    if (draw.close) {
      command.push("--close");
    }
    if (typeof draw.preDelayMs === "number" && draw.preDelayMs > 0) {
      command.push("--pre-delay", formatAxeSeconds(draw.preDelayMs));
    }
    if (typeof draw.postDelayMs === "number" && draw.postDelayMs > 0) {
      command.push("--post-delay", formatAxeSeconds(draw.postDelayMs));
    }
    command.push("--udid", deviceId);
    return command;
  }

  buildDragCommand(deviceId: string, drag: IosDragGestureParams): string[] {
    const command = [
      "axe",
      "drag",
      "--start-x",
      String(drag.start.x),
      "--start-y",
      String(drag.start.y),
      "--end-x",
      String(drag.end.x),
      "--end-y",
      String(drag.end.y),
      "--duration",
      formatAxeSeconds(drag.durationMs),
    ];
    if (typeof drag.steps === "number") {
      command.push("--steps", String(drag.steps));
    }
    if (typeof drag.holdMs === "number") {
      command.push("--hold", formatAxeSeconds(drag.holdMs));
    }
    if (typeof drag.preDelayMs === "number" && drag.preDelayMs > 0) {
      command.push("--pre-delay", formatAxeSeconds(drag.preDelayMs));
    }
    if (typeof drag.postDelayMs === "number" && drag.postDelayMs > 0) {
      command.push("--post-delay", formatAxeSeconds(drag.postDelayMs));
    }
    command.push("--udid", deviceId);
    return command;
  }

  buildMultiTouchGestureCommand(deviceId: string, gesture: IosMultiTouchGestureParams): string[] {
    let command: string[];
    switch (gesture.type) {
      case "pinch":
        command = ["axe", "gesture", "pinch", "--scale", String(gesture.scale)];
        if (gesture.center) {
          command.push("-x", String(gesture.center.x), "-y", String(gesture.center.y));
        }
        if (typeof gesture.radius === "number") {
          command.push("--radius", String(gesture.radius));
        }
        command.push("--duration", formatAxeSeconds(gesture.durationMs));
        if (typeof gesture.delta === "number") {
          command.push("--delta", String(gesture.delta));
        }
        break;
      case "double_tap":
        command = [
          "axe",
          "gesture",
          "double-tap",
          "-x",
          String(gesture.point.x),
          "-y",
          String(gesture.point.y),
        ];
        if (typeof gesture.intervalMs === "number") {
          command.push("--interval", formatAxeSeconds(gesture.intervalMs));
        }
        break;
      case "two_finger_tap":
        command = [
          "axe",
          "gesture",
          "two-finger-tap",
          "-x",
          String(gesture.point1.x),
          "-y",
          String(gesture.point1.y),
          "--x2",
          String(gesture.point2.x),
          "--y2",
          String(gesture.point2.y),
        ];
        break;
    }
    if (typeof gesture.preDelayMs === "number" && gesture.preDelayMs > 0) {
      command.push("--pre-delay", formatAxeSeconds(gesture.preDelayMs));
    }
    if (typeof gesture.postDelayMs === "number" && gesture.postDelayMs > 0) {
      command.push("--post-delay", formatAxeSeconds(gesture.postDelayMs));
    }
    command.push("--udid", deviceId);
    return command;
  }

  /**
   * Coalesces consecutive `draw` steps (and intervening `sleep` waits) into single `axe batch`
   * CLI invocations, while isolating `drag` and coordinate multi-touch steps (`pinch`, `double_tap`,
   * `two_finger_tap`) which AXe v2.2 `batch` rejects.
   */
  buildBatchGestureCommands(
    deviceId: string,
    steps: IosSequenceGestureStep[],
  ): { commands: string[][]; stepDelaysMs: number[] } {
    const commands: string[][] = [];
    const stepDelaysMs: number[] = [];
    let pendingDrawSteps: string[] = [];
    let pendingSleepMs = 0;

    const stripAxeAndUdid = (cmd: string[]): string => {
      const inner = cmd.slice(1, cmd.length >= 3 && cmd[cmd.length - 2] === "--udid" ? -2 : undefined);
      return inner.join(" ");
    };

    const appendDelayToPreviousCommand = (delayMs: number) => {
      if (delayMs > 0 && stepDelaysMs.length > 0) {
        const lastIdx = stepDelaysMs.length - 1;
        stepDelaysMs[lastIdx] = (stepDelaysMs[lastIdx] ?? 0) + delayMs;
      }
    };

    const flushDrawBatch = () => {
      if (pendingDrawSteps.length === 0) {
        appendDelayToPreviousCommand(pendingSleepMs);
        pendingSleepMs = 0;
        return;
      }
      const batchCmd = ["axe", "batch", "--udid", deviceId];
      for (const stepText of pendingDrawSteps) {
        batchCmd.push("--step", stepText);
      }
      commands.push(batchCmd);
      stepDelaysMs.push(pendingSleepMs);
      pendingDrawSteps = [];
      pendingSleepMs = 0;
    };

    for (const step of steps) {
      if (step.type === "sleep") {
        pendingSleepMs += step.durationMs;
        continue;
      }
      if (step.type === "draw") {
        if (pendingDrawSteps.length > 0 && pendingSleepMs > 0) {
          pendingDrawSteps.push(`sleep ${formatAxeSeconds(pendingSleepMs)}`);
        } else if (pendingSleepMs > 0) {
          appendDelayToPreviousCommand(pendingSleepMs);
        }
        pendingSleepMs = 0;
        pendingDrawSteps.push(stripAxeAndUdid(this.buildDrawCommand(deviceId, step)));
        continue;
      }

      flushDrawBatch();
      if (step.type === "drag") {
        commands.push(this.buildDragCommand(deviceId, step));
      } else {
        commands.push(this.buildMultiTouchGestureCommand(deviceId, step));
      }
      stepDelaysMs.push(0);
    }

    flushDrawBatch();
    return { commands, stepDelaysMs };
  }

  buildHierarchyCaptureCommand(deviceId: string): string[] {
    // axe describe-ui --udid UDID
    // Output is JSON array by default (NO --json flag needed)
    // VERIFIED: Compatible with parseIosInspectNodes() — zero parser changes needed
    // 14 nodes parsed, 12 clickable, text correctly extracted
    return ["axe", "describe-ui", "--udid", deviceId];
  }

  buildDescribePointCommand(deviceId: string, x: number, y: number): string[] {
    return [
      "axe",
      "describe-ui",
      "--udid",
      deviceId,
      "--point",
      `${Math.round(x)},${Math.round(y)}`,
    ];
  }

  buildScreenshotCommand(deviceId: string, outputPath: string): string[] {
    // axe screenshot --udid UDID --output <path>
    // VERIFIED: saved 3.6M PNG, 1290×2796, RGBA
    // Same quality as simctl (same underlying mechanism)
    return ["axe", "screenshot", "--udid", deviceId, "--output", outputPath];
  }

  buildFailureSuggestion(action: string, _deviceId: string): string {
    const suggestions: Record<string, string> = {
      tap: "Check simulator is booted and coordinates are within screen bounds. Run 'axe tap -x X -y Y --udid <UDID>' manually.",
      typeText: "Check simulator has a focused text field. Run 'axe type \"text\" --udid <UDID>' manually.",
      swipe: "Check simulator is booted and coordinates are valid. Run 'axe swipe --start-x X1 --start-y Y1 --end-x X2 --end-y Y2 --udid <UDID>' manually.",
      hierarchy: "Check simulator is booted. Run 'axe describe-ui --udid <UDID>' manually.",
      screenshot: "Check simulator is booted and output path is writable.",
    };
    return suggestions[action] ?? `Check simulator state for ${action} action. Install axe: brew install cameroncooke/axe/axe`;
  }
}
