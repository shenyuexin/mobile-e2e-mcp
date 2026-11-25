import type { AuditUiSurfaceData, AuditUiSurfaceInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import { inspectUiWithMaestroTool } from "./ui-inspection-tools.js";
import { parseAndroidUiHierarchyNodes, parseIosInspectNodes } from "./ui-model.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { auditUiNodes, buildUiAuditNextSuggestions } from "./ui-audit-model.js";
import { buildMissingPlatformSuggestion } from "./ui-tool-shared.js";

export interface AuditUiSurfaceToolDeps {
  inspectUi?: typeof inspectUiWithMaestroTool;
}

export async function auditUiSurfaceWithMaestroTool(
  input: AuditUiSurfaceInput,
  deps: AuditUiSurfaceToolDeps = {},
): Promise<ToolResult<AuditUiSurfaceData>> {
  const startTime = Date.now();
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const surfaceName = input.surfaceName ?? "current_surface";

  if (!input.platform) {
    const emptyAudit = auditUiNodes(input.nodes ?? [], {
      platform: "ios",
      surfaceName,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      minTouchTargetPt: input.minTouchTargetPt,
      severeTouchTargetPt: input.severeTouchTargetPt,
      maxOverlapRatio: input.maxOverlapRatio,
      minVisibleRatio: input.minVisibleRatio,
      i18nKeyPrefixes: input.i18nKeyPrefixes,
    });
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
        outputPath: input.outputPath,
        command: [],
        exitCode: null,
        supportLevel: "partial",
        ...emptyAudit,
      },
      nextSuggestions: [buildMissingPlatformSuggestion("audit_ui_surface")],
    };
  }

  const platform = input.platform;

  if (input.nodes) {
    const audit = auditUiNodes(input.nodes, {
      platform,
      surfaceName,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      minTouchTargetPt: input.minTouchTargetPt,
      severeTouchTargetPt: input.severeTouchTargetPt,
      maxOverlapRatio: input.maxOverlapRatio,
      minVisibleRatio: input.minVisibleRatio,
      i18nKeyPrefixes: input.i18nKeyPrefixes,
    });
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: input.outputPath,
        command: [],
        exitCode: 0,
        supportLevel: "full",
        ...audit,
      },
      nextSuggestions: buildUiAuditNextSuggestions(audit),
    };
  }

  if (input.dryRun) {
    const repoRoot = resolveRepoPath();
    const selection = await loadHarnessSelection(
      repoRoot,
      platform,
      runnerProfile,
      input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
    );
    const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
    const previewCommand = resolveUiRuntimePlatformHooks(platform).buildHierarchyCapturePreviewCommand(deviceId);
    const emptyAudit = auditUiNodes([], {
      platform,
      surfaceName,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      minTouchTargetPt: input.minTouchTargetPt,
      severeTouchTargetPt: input.severeTouchTargetPt,
      maxOverlapRatio: input.maxOverlapRatio,
      minVisibleRatio: input.minVisibleRatio,
      i18nKeyPrefixes: input.i18nKeyPrefixes,
    });
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
        outputPath: input.outputPath,
        command: previewCommand,
        exitCode: 0,
        supportLevel: "full",
        ...emptyAudit,
      },
      nextSuggestions: ["Run audit_ui_surface without dryRun (or pass nodes) to evaluate touch targets, overlaps, and accessibility IDs."],
    };
  }

  const runInspect = deps.inspectUi ?? inspectUiWithMaestroTool;
  const inspectResult = await runInspect({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId,
    outputPath: input.outputPath,
  });

  if (inspectResult.status !== "success" || !inspectResult.data.content) {
    const emptyAudit = auditUiNodes([], {
      platform,
      surfaceName,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      minTouchTargetPt: input.minTouchTargetPt,
      severeTouchTargetPt: input.severeTouchTargetPt,
      maxOverlapRatio: input.maxOverlapRatio,
      minVisibleRatio: input.minVisibleRatio,
      i18nKeyPrefixes: input.i18nKeyPrefixes,
    });
    return {
      status: inspectResult.status === "success" ? "partial" : inspectResult.status,
      reasonCode: inspectResult.status === "success" ? REASON_CODES.noMatch : inspectResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: inspectResult.attempts,
      artifacts: inspectResult.artifacts,
      data: {
        dryRun: false,
        runnerProfile: inspectResult.data.runnerProfile,
        outputPath: inspectResult.data.outputPath,
        command: inspectResult.data.command,
        exitCode: inspectResult.data.exitCode,
        supportLevel: inspectResult.data.supportLevel,
        ...emptyAudit,
      },
      nextSuggestions: inspectResult.nextSuggestions,
    };
  }

  const parsedNodes =
    platform === "ios"
      ? parseIosInspectNodes(inspectResult.data.content)
      : parseAndroidUiHierarchyNodes(inspectResult.data.content);

  const audit = auditUiNodes(parsedNodes, {
    platform,
    surfaceName,
    screenWidth: input.screenWidth,
    screenHeight: input.screenHeight,
    minTouchTargetPt: input.minTouchTargetPt,
    severeTouchTargetPt: input.severeTouchTargetPt,
    maxOverlapRatio: input.maxOverlapRatio,
    minVisibleRatio: input.minVisibleRatio,
    i18nKeyPrefixes: input.i18nKeyPrefixes,
  });

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: inspectResult.attempts,
    artifacts: inspectResult.artifacts,
    data: {
      dryRun: false,
      runnerProfile: inspectResult.data.runnerProfile,
      outputPath: inspectResult.data.outputPath,
      command: inspectResult.data.command,
      exitCode: inspectResult.data.exitCode,
      supportLevel: "full",
      ...audit,
    },
    nextSuggestions: buildUiAuditNextSuggestions(audit),
  };
}
