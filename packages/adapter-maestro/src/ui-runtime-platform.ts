import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
import type { InspectUiNode, Platform, QueryUiSelector, ReasonCode, UiPoint } from "@mobile-e2e-mcp/contracts";
import type { CommandExecution } from "./runtime-shared.js";
import { createAndroidUiRuntimeHooks } from "./ui-runtime-android.js";
import { createIosUiRuntimeHooks } from "./ui-runtime-ios.js";
import type { ResolvedPerformGesture } from "./ui-gesture-model.js";

export type UiGestureCommandPlan =
  | {
      supported: true;
      commands: string[][];
      interCommandDelayMs?: number;
      supportLevel: "full" | "partial";
      backendId?: string;
      caveat?: string;
    }
  | {
      supported: false;
      reason: string;
      suggestion: string;
      backendId?: string;
    };

export type UiRuntimeProbeAction = "inspect_ui" | "tap" | "type_text";

export interface UiResolvedPointVerificationResult {
  verified: boolean;
  command: string[];
  exitCode: number | null;
  reasonCode?: ReasonCode;
  diagnosticHint?: string;
}

export interface UiResolvedPointVerificationParams {
  repoRoot: string;
  deviceId: string;
  resolvedNode: InspectUiNode;
  resolvedQuery: QueryUiSelector;
  resolvedPoint: UiPoint;
  runtimeHooks: UiRuntimePlatformHooks;
}

export interface UiTypedPostconditionVerificationParams extends UiResolvedPointVerificationParams {
  typedValue: string;
}

export type UiKeyboardVisibility = "visible" | "hidden" | "unknown";

export interface UiKeyboardStateProbe {
  checked: boolean;
  platform: Platform;
  visibility: UiKeyboardVisibility;
  reason: string;
  imeType?: string;
  command: string[];
  exitCode: number | null;
}

export interface UiRuntimePlatformHooks {
  platform: Platform;
  requiresProbe: boolean;
  probeFailureReasonCode: ReasonCode;
  buildTapCommand: (deviceId: string, x: number, y: number) => string[];
  buildBackPressedCommand: (deviceId: string) => string[];
  buildDescribePointCommand?: (deviceId: string, x: number, y: number) => string[];
  verifyResolvedPoint?: (params: UiResolvedPointVerificationParams) => Promise<UiResolvedPointVerificationResult>;
  verifyTypedPostcondition?: (params: UiTypedPostconditionVerificationParams) => Promise<UiResolvedPointVerificationResult>;
  settleAfterFocus?: (params: { repoRoot: string; deviceId: string; settleDelayMs?: number }) => Promise<void>;
  probeKeyboardState?: (params: { repoRoot: string; deviceId: string }) => Promise<UiKeyboardStateProbe>;
  settleBeforeKeyboardRecheck?: () => Promise<void>;
  buildTypeTextCommand: (deviceId: string, text: string) => string[];
  buildSwipeCommand: (deviceId: string, swipe: { start: { x: number; y: number }; end: { x: number; y: number }; durationMs: number; delta?: number; preDelaySec?: number; postDelaySec?: number }) => string[];
  buildGestureCommands?: (deviceId: string, gesture: ResolvedPerformGesture) => UiGestureCommandPlan;
  buildHierarchyCapturePreviewCommand: (deviceId: string) => string[];
  probeRuntimeAvailability?: (repoRoot: string) => Promise<CommandExecution | undefined>;
  probeUnavailableSuggestion: (action: UiRuntimeProbeAction) => string;
  tapDryRunSuggestion: string;
  tapFailureSuggestion: string;
  typeTextDryRunSuggestion: string;
  typeTextFailureSuggestion: string;
}

const UI_RUNTIME_HOOKS: Record<Platform, UiRuntimePlatformHooks> = {
  android: createAndroidUiRuntimeHooks(),
  ios: createIosUiRuntimeHooks(),
};

export function resolveUiRuntimePlatformHooks(platform: Platform): UiRuntimePlatformHooks {
  return UI_RUNTIME_HOOKS[platform];
}
