import type { ActionIntent, RawRecordedEvent, RecordedStep, RecordedStepConfidence } from "@mobile-e2e-mcp/contracts";

export interface RecordingMappingOptions {
  defaultAppId?: string;
  includeAutoWaitStep?: boolean;
  dedupeTapWindowMs?: number;
}

export interface RecordingMappingResult {
  steps: RecordedStep[];
  warnings: string[];
}

export interface RenderedRecordedFlow {
  yaml: string;
  warnings: string[];
  confidenceSummary: {
    high: number;
    medium: number;
    low: number;
  };
}

function parseTimestampMillis(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveTargetFromIntent(intent: ActionIntent | undefined): { id?: string; text?: string } | undefined {
  if (!intent) {
    return undefined;
  }
  if (intent.resourceId) return { id: intent.resourceId };
  if (intent.text) return { text: intent.text };
  if (intent.contentDesc) return { text: intent.contentDesc };
  return undefined;
}

function escapeYaml(value: string): string {
  return value.replaceAll('"', '\\"');
}

function shouldAutoInsertWaitStep(actionType: RecordedStep["actionType"]): boolean {
  return actionType === "tap_element" || actionType === "type_into_element" || actionType === "launch_app" || actionType === "tap";
}

function toStep(
  stepNumber: number,
  event: RawRecordedEvent,
  actionType: RecordedStep["actionType"],
  confidence: RecordedStepConfidence,
  reason: string,
  actionIntent?: ActionIntent,
): RecordedStep {
  return {
    stepNumber,
    eventId: event.eventId,
    timestamp: event.timestamp,
    actionType,
    actionIntent,
    x: event.x,
    y: event.y,
    confidence,
    reason,
    warnings: confidence === "low" ? ["Low confidence semantic mapping."] : [],
  };
}

export function mapRawEventsToRecordedSteps(
  recordSessionId: string,
  events: RawRecordedEvent[],
  options: RecordingMappingOptions = {},
): RecordingMappingResult {
  const includeAutoWaitStep = options.includeAutoWaitStep ?? true;
  const dedupeTapWindowMs = options.dedupeTapWindowMs ?? 300;
  const warnings: string[] = [];
  const sorted = events.slice().sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const steps: RecordedStep[] = [];
  let stepNumber = 0;
  let lastTap: { x?: number; y?: number; timestampMs: number } | undefined;

  for (const event of sorted) {
    let mappedStep: RecordedStep | undefined;

    if (event.eventType === "tap") {
      const timestampMs = parseTimestampMillis(event.timestamp);
      if (
        lastTap
        && event.x !== undefined
        && event.y !== undefined
        && lastTap.x === event.x
        && lastTap.y === event.y
        && timestampMs - lastTap.timestampMs <= dedupeTapWindowMs
      ) {
        warnings.push(`Deduplicated noisy tap event '${event.eventId}'.`);
        continue;
      }
      lastTap = { x: event.x, y: event.y, timestampMs };

      stepNumber += 1;
      if (event.x === undefined || event.y === undefined) {
        mappedStep = toStep(stepNumber, event, "tap", "low", "Tap recorded without stable coordinates; degraded to coordinate tap fallback.");
      } else if (event.uiSnapshotRef) {
        mappedStep = toStep(
          stepNumber,
          event,
          "tap_element",
          "medium",
          "Tap mapped to tap_element using snapshot reference.",
          { actionType: "tap_element", text: event.uiSnapshotRef },
        );
      } else {
        mappedStep = toStep(stepNumber, event, "tap", "medium", "Tap mapped as coordinate fallback due to missing selector context.");
      }
    } else if (event.eventType === "type") {
      if (!event.textDelta || event.textDelta.trim().length === 0) {
        warnings.push(`Type event '${event.eventId}' skipped due to empty textDelta.`);
        continue;
      }
      stepNumber += 1;
      mappedStep = toStep(
        stepNumber,
        event,
        "type_into_element",
        event.uiSnapshotRef ? "medium" : "low",
        "Input event mapped to type_into_element from textDelta.",
        {
          actionType: "type_into_element",
          text: event.uiSnapshotRef,
          value: event.textDelta,
        },
      );
    } else if (event.eventType === "app_switch" || event.eventType === "home") {
      stepNumber += 1;
      const appId = event.foregroundApp ?? options.defaultAppId;
      mappedStep = toStep(
        stepNumber,
        event,
        "launch_app",
        appId ? "medium" : "low",
        "Foreground app transition mapped to launch_app.",
        {
          actionType: "launch_app",
          appId,
        },
      );
    } else if (event.eventType === "back") {
      stepNumber += 1;
      mappedStep = toStep(
        stepNumber,
        event,
        "wait_for_ui",
        "low",
        "Back key event mapped to wait_for_ui stabilization step.",
        {
          actionType: "wait_for_ui",
          text: event.uiSnapshotRef,
          timeoutMs: 3000,
        },
      );
    } else {
      warnings.push(`Event '${event.eventId}' with type '${event.eventType}' is not mapped in MVP.`);
      continue;
    }

    steps.push(mappedStep);
    if (includeAutoWaitStep && shouldAutoInsertWaitStep(mappedStep.actionType)) {
      stepNumber += 1;
      steps.push({
        stepNumber,
        eventId: `${recordSessionId}-auto-wait-${stepNumber}`,
        timestamp: mappedStep.timestamp,
        actionType: "wait_for_ui",
        actionIntent: {
          actionType: "wait_for_ui",
          timeoutMs: 3000,
          text: mappedStep.actionIntent?.text,
        },
        confidence: "medium",
        reason: "Auto-inserted wait_for_ui after actionable step to stabilize replay.",
        warnings: [],
      });
    }
  }

  return { steps, warnings };
}

export function renderRecordedStepsAsFlow(params: {
  appId: string;
  includeLaunchStep: boolean;
  steps: RecordedStep[];
}): RenderedRecordedFlow {
  const lines: string[] = [`appId: "${escapeYaml(params.appId)}"`, "---"];
  const warnings: string[] = [];
  const confidenceSummary = { high: 0, medium: 0, low: 0 };

  if (params.includeLaunchStep) {
    lines.push("- launchApp:");
    lines.push(`    appId: "${escapeYaml(params.appId)}"`);
    lines.push("    clearState: false");
  }

  for (const step of params.steps) {
    confidenceSummary[step.confidence] += 1;
    if (step.actionType === "launch_app") {
      const appId = step.actionIntent?.appId ?? params.appId;
      lines.push("- launchApp:");
      lines.push(`    appId: "${escapeYaml(appId)}"`);
      lines.push("    clearState: false");
      continue;
    }

    if (step.actionType === "tap_element") {
      const target = resolveTargetFromIntent(step.actionIntent);
      if (target?.id || target?.text) {
        lines.push("- tapOn:");
        if (target.id) lines.push(`    id: "${escapeYaml(target.id)}"`);
        if (target.text) lines.push(`    text: "${escapeYaml(target.text)}"`);
        continue;
      }
      if (step.x !== undefined && step.y !== undefined) {
        lines.push("- tapOn:");
        lines.push(`    point: "${String(step.x)},${String(step.y)}"`);
        warnings.push(`Step ${String(step.stepNumber)} tap_element exported as coordinate fallback.`);
        continue;
      }
      warnings.push(`Step ${String(step.stepNumber)} tap_element skipped due to missing selector and coordinates.`);
      continue;
    }

    if (step.actionType === "tap") {
      if (step.x === undefined || step.y === undefined) {
        warnings.push(`Step ${String(step.stepNumber)} tap skipped due to missing coordinates.`);
        continue;
      }
      lines.push("- tapOn:");
      lines.push(`    point: "${String(step.x)},${String(step.y)}"`);
      continue;
    }

    if (step.actionType === "type_into_element") {
      const value = step.actionIntent?.value ?? "";
      const target = resolveTargetFromIntent(step.actionIntent);
      if (target?.id || target?.text) {
        lines.push("- tapOn:");
        if (target.id) lines.push(`    id: "${escapeYaml(target.id)}"`);
        if (target.text) lines.push(`    text: "${escapeYaml(target.text)}"`);
      }
      lines.push(`- inputText: "${escapeYaml(value)}"`);
      continue;
    }

    if (step.actionType === "wait_for_ui") {
      const target = resolveTargetFromIntent(step.actionIntent);
      if (!target?.id && !target?.text) {
        warnings.push(`Step ${String(step.stepNumber)} wait_for_ui has no target and was skipped.`);
        continue;
      }
      lines.push("- assertVisible:");
      if (target.id) lines.push(`    id: "${escapeYaml(target.id)}"`);
      if (target.text) lines.push(`    text: "${escapeYaml(target.text)}"`);
      continue;
    }

    warnings.push(`Step ${String(step.stepNumber)} action '${step.actionType}' not exportable in MVP.`);
  }

  return {
    yaml: `${lines.join("\n")}\n`,
    warnings,
    confidenceSummary,
  };
}
