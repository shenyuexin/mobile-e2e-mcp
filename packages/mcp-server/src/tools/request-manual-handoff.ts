import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { appendSessionTimelineEvent, persistSessionState } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type RequestManualHandoffData, type RequestManualHandoffInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

function defaultSummary(reason: RequestManualHandoffInput["reason"]): string {
  switch (reason) {
    case "otp_required":
      return "A one-time verification code step requires a human operator.";
    case "captcha_required":
      return "A captcha or human verification challenge requires manual completion.";
    case "consent_required":
      return "A consent gate requires explicit user acknowledgement before continuing.";
    case "protected_page":
      return "A protected page boundary was detected and requires human review before continuing.";
    case "secure_input_required":
      return "A secure input surface requires direct operator entry.";
    default:
      return "A manual operator handoff is required before automation can continue safely.";
  }
}

function defaultActions(reason: RequestManualHandoffInput["reason"]): string[] {
  switch (reason) {
    case "otp_required":
      return [
        "Read the one-time code from the trusted channel and enter it directly on-device.",
        "Avoid copying the one-time code into automation logs or artifacts.",
      ];
    case "captcha_required":
      return [
        "Complete the challenge manually on the device.",
        "Resume automation only after the challenge surface is fully dismissed.",
      ];
    case "consent_required":
      return [
        "Review the consent text and explicitly acknowledge it if appropriate for the environment.",
      ];
    case "secure_input_required":
      return [
        "Enter the sensitive value directly on-device without exposing it to automation.",
      ];
    default:
      return [
        "Complete the blocking step directly on the device, then resume the active session.",
      ];
  }
}

function defaultResumeHints(reason: RequestManualHandoffInput["reason"]): string[] {
  switch (reason) {
    case "otp_required":
    case "captcha_required":
      return [
        "Run get_screen_summary or get_session_state after the manual step to verify the protected page is cleared.",
      ];
    default:
      return [
        "Verify the next stable screen before continuing write actions.",
      ];
  }
}

export async function requestManualHandoff(input: RequestManualHandoffInput): Promise<ToolResult<RequestManualHandoffData>> {
  const repoRoot = resolveRepoPath();
  const recordedAt = new Date().toISOString();
  const handoffId = `handoff-${Date.now()}`;
  const summary = input.summary?.trim() || defaultSummary(input.reason);
  const blocking = input.blocking ?? true;
  const suggestedOperatorActions = input.suggestedOperatorActions?.filter(Boolean) ?? defaultActions(input.reason);
  const resumeHints = input.resumeHints?.filter(Boolean) ?? defaultResumeHints(input.reason);
  const operatorPrompt = [
    summary,
    ...suggestedOperatorActions.map((action) => `Operator: ${action}`),
    ...resumeHints.map((hint) => `Resume: ${hint}`),
  ].join(" ");
  const stateSummary = input.stateSummary
    ? {
      ...input.stateSummary,
      manualHandoff: {
        required: true,
        reason: input.reason,
        summary,
        suggestedOperatorActions,
        resumeHints,
      },
    }
    : undefined;

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: input.artifactRefs ?? [],
      data: {
        requested: true,
        handoffId,
        reason: input.reason,
        blocking,
        recordedAt,
        operatorPrompt,
        stateSummary,
      },
      nextSuggestions: [
        "Run request_manual_handoff without dryRun to persist the operator checkpoint into the active session timeline.",
      ],
    };
  }

  const timelineEvent = {
    eventId: handoffId,
    timestamp: recordedAt,
    type: "manual_handoff_requested",
    detail: summary,
    eventType: "manual_handoff",
    layer: "session" as const,
    summary: blocking ? `Blocking handoff: ${input.reason}` : `Handoff: ${input.reason}`,
    artifactRefs: input.artifactRefs ?? [],
    stateSummary,
  };

  const persisted = stateSummary
    ? await persistSessionState(
      repoRoot,
      input.sessionId,
      stateSummary,
      timelineEvent,
      input.artifactRefs ?? [],
    )
    : await appendSessionTimelineEvent(
      repoRoot,
      input.sessionId,
      timelineEvent,
      input.artifactRefs ?? [],
    );

  const artifacts = [
    ...(persisted.relativePath ? [persisted.relativePath] : []),
    ...(persisted.auditPath ? [persisted.auditPath] : []),
    ...(input.artifactRefs ?? []),
  ];

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts,
    data: {
      requested: true,
      handoffId,
      reason: input.reason,
      blocking,
      recordedAt,
      operatorPrompt,
      stateSummary,
    },
    nextSuggestions: [
      ...suggestedOperatorActions,
      ...resumeHints,
    ].slice(0, 5),
  };
}
