import {
  type ActionIntent,
  type ActionOutcomeSummary,
  type GetScreenSummaryData,
  type OcrEvidence,
  type PerformActionWithEvidenceData,
  type PerformActionWithEvidenceInput,
  type Platform,
  type ReasonCode,
  REASON_CODES,
  type ResolveInterruptionData,
  type ResolveInterruptionInput,
  type ResumeInterruptedActionData,
  type ResumeInterruptedActionInput,
  type RunnerProfile,
  type RetryDecisionTrace,
  type SessionTimelineEvent,
  type ScreenshotData,
  type ScreenshotInput,
  type StateSummary,
  type TapData,
  type TapInput,
  type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_OCR_FALLBACK_POLICY,
  MacVisionOcrProvider,
  minimumConfidenceForOcrAction,
  resolveTextTarget,
  shouldUseOcrFallback,
  type OcrFallbackActionType,
  verifyOcrAction,
} from "@mobile-e2e-mcp/adapter-vision";
import { loadSessionRecord, persistActionRecord, persistSessionState, recordBaselineEntry } from "@mobile-e2e-mcp/core";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  buildActionabilityReview,
  buildActionEvidenceDelta,
  buildActionOutcomeConfidence,
  buildCheckpointDecisionTraceForAction,
  buildPostActionVerificationTrace,
  buildRetryRecommendation,
  buildRetryRecommendations,
  classifyActionFailureCategory,
  classifyNetworkReadiness,
  classifyRetryRecommendationTier,
  classifyStepState,
  classifyTargetQuality,
  computeEvidenceConfidence,
  readResolutionSignal,
  retryBackoffClassForStep,
  shouldAttemptPostActionRefresh,
  shouldRetryStep,
  uniqueNonEmpty,
} from "./action-orchestrator-model.js";
import { getScreenSummaryWithMaestro } from "./session-state.js";
import { tapWithMaestroTool } from "./ui-tools.js";
import { resolveInterruptionWithMaestro, resumeInterruptedActionWithMaestro, buildInterruptionCheckpoint } from "./interruption-tools.js";
import { takeScreenshotWithRuntime } from "./device-runtime.js";
import { DEFAULT_RUNNER_PROFILE, resolveRepoPath } from "./harness-config.js";

interface OcrFallbackExecutionResult {
  attempted: boolean;
  used: boolean;
  status: ToolResult["status"];
  reasonCode: ReasonCode;
  artifacts: string[];
  attempts: number;
  retryCount: number;
  nextSuggestions: string[];
  ocrEvidence?: OcrEvidence;
  postStateResult?: ToolResult<GetScreenSummaryData>;
}

export interface OcrFallbackTestHooks {
  createProvider?: () => Pick<MacVisionOcrProvider, "extractTextRegions">;
  takeScreenshot?: (input: ScreenshotInput) => Promise<ToolResult<ScreenshotData>>;
  tap?: (input: TapInput) => Promise<ToolResult<TapData>>;
  getScreenSummary?: typeof getScreenSummaryWithMaestro;
  now?: () => string;
}

export interface InterruptionGuardTestHooks {
  resolveInterruption?: (input: ResolveInterruptionInput) => Promise<ToolResult<ResolveInterruptionData>>;
  resumeInterruptedAction?: (input: ResumeInterruptedActionInput) => Promise<ToolResult<ResumeInterruptedActionData>>;
}

export interface ActionOrchestratorDeps {
  executeIntentWithMaestro?: (
    params: {
      sessionId: string;
      platform: Platform;
      runnerProfile: RunnerProfile;
      harnessConfigPath?: string;
      deviceId?: string;
      appId?: string;
      dryRun?: boolean;
    },
    action: ActionIntent,
  ) => Promise<ToolResult<unknown>>;
}

let ocrFallbackTestHooks: OcrFallbackTestHooks | undefined;
let interruptionGuardTestHooks: InterruptionGuardTestHooks | undefined;

export function setOcrFallbackTestHooksForTesting(hooks: OcrFallbackTestHooks | undefined): void {
  ocrFallbackTestHooks = hooks;
}

export function resetOcrFallbackTestHooksForTesting(): void {
  ocrFallbackTestHooks = undefined;
}

export function setInterruptionGuardTestHooksForTesting(hooks: InterruptionGuardTestHooks | undefined): void {
  interruptionGuardTestHooks = hooks;
}

export function resetInterruptionGuardTestHooksForTesting(): void {
  interruptionGuardTestHooks = undefined;
}

function mapIntentToOcrActionKind(action: ActionIntent): OcrFallbackActionType | undefined {
  if (action.actionType === "tap_element") return "tap";
  if (action.actionType === "wait_for_ui") return "assertText";
  return undefined;
}

function buildOcrTargetText(action: ActionIntent): string | undefined {
  return action.text?.trim() || action.contentDesc?.trim();
}

function canAttemptOcrFallback(action: ActionIntent, deterministicResult: ToolResult<unknown>): boolean {
  if (deterministicResult.status === "success") return false;
  if (action.actionType !== "tap_element" && action.actionType !== "wait_for_ui") return false;
  return Boolean(buildOcrTargetText(action));
}

async function executeOcrFallback(params: {
  input: PerformActionWithEvidenceInput;
  platform: Platform;
  runnerProfile: RunnerProfile;
  deviceId?: string;
  appId?: string;
  preStateSummary: StateSummary;
}): Promise<OcrFallbackExecutionResult> {
  if (params.input.dryRun && !ocrFallbackTestHooks?.createProvider) {
    return { attempted: false, used: false, status: "failed", reasonCode: REASON_CODES.noMatch, artifacts: [], attempts: 0, retryCount: 0, nextSuggestions: [] };
  }
  const actionKind = mapIntentToOcrActionKind(params.input.action);
  const targetText = buildOcrTargetText(params.input.action);
  if (!actionKind || !targetText) {
    return { attempted: false, used: false, status: "failed", reasonCode: REASON_CODES.noMatch, artifacts: [], attempts: 0, retryCount: 0, nextSuggestions: [] };
  }

  const policyDecision = shouldUseOcrFallback({ action: actionKind, deterministicFailed: true, semanticFailed: true, state: params.preStateSummary }, DEFAULT_OCR_FALLBACK_POLICY);
  if (!policyDecision.allowed) {
    return {
      attempted: false,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.noMatch,
      artifacts: [],
      attempts: 0,
      retryCount: 0,
      nextSuggestions: policyDecision.reasons.length > 0 ? [`OCR fallback blocked: ${policyDecision.reasons.join(", ")}.`] : [],
    };
  }

  const screenshotInput: ScreenshotInput = {
    sessionId: params.input.sessionId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    harnessConfigPath: params.input.harnessConfigPath,
    deviceId: params.deviceId,
    outputPath: path.posix.join("artifacts", "screenshots", params.input.sessionId, `${params.platform}-${params.runnerProfile}-ocr.png`),
    dryRun: params.input.dryRun,
  };
  const screenshotExecutor = ocrFallbackTestHooks?.takeScreenshot ?? takeScreenshotWithRuntime;
  const screenshotResult = await screenshotExecutor(screenshotInput);
  if (screenshotResult.status === "failed") {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: screenshotResult.reasonCode,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts,
      retryCount: 0,
      nextSuggestions: screenshotResult.nextSuggestions,
    };
  }

  const screenshotPath = path.resolve(resolveRepoPath(), screenshotResult.data.outputPath);
  const nowIsoString = ocrFallbackTestHooks?.now?.() ?? new Date().toISOString();
  const screenshotFreshDecision = shouldUseOcrFallback({ action: actionKind, deterministicFailed: true, semanticFailed: true, state: params.preStateSummary, screenshotCapturedAt: nowIsoString }, DEFAULT_OCR_FALLBACK_POLICY);
  if (!screenshotFreshDecision.allowed) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrProviderError,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts,
      retryCount: 0,
      nextSuggestions: screenshotFreshDecision.reasons.length > 0 ? [`OCR fallback blocked: ${screenshotFreshDecision.reasons.join(", ")}.`] : [],
    };
  }

  const ocrProvider = ocrFallbackTestHooks?.createProvider?.() ?? new MacVisionOcrProvider();
  let ocrOutput: Awaited<ReturnType<MacVisionOcrProvider["extractTextRegions"]>>;
  try {
    ocrOutput = await ocrProvider.extractTextRegions({ screenshotPath, platform: params.platform, languageHints: ["en-US", "zh-Hans"] });
  } catch (error) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrProviderError,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: [error instanceof Error ? error.message : "OCR provider execution failed."],
    };
  }

  let resolverResult = resolveTextTarget({ targetText, blocks: ocrOutput.blocks, maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail });
  if (!resolverResult.matched) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: resolverResult.candidates.length > 1 ? REASON_CODES.ocrAmbiguousTarget : REASON_CODES.ocrNoMatch,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: ["OCR fallback could not resolve a unique text target from the screenshot."],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        candidateCount: resolverResult.candidates.length,
        screenshotPath: screenshotResult.data.outputPath,
        fallbackReason: resolverResult.candidates.length > 1 ? REASON_CODES.ocrAmbiguousTarget : REASON_CODES.ocrNoMatch,
        postVerificationResult: "not_run",
      },
    };
  }

  const threshold = minimumConfidenceForOcrAction(actionKind, DEFAULT_OCR_FALLBACK_POLICY);
  const selectedConfidence = resolverResult.bestCandidate?.confidence ?? resolverResult.confidence;
  if (selectedConfidence < threshold) {
    return {
      attempted: true,
      used: false,
      status: "failed",
      reasonCode: REASON_CODES.ocrLowConfidence,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: ["OCR fallback found the target text but confidence did not pass the policy threshold."],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        matchedText: resolverResult.bestCandidate?.text,
        candidateCount: resolverResult.candidates.length,
        matchType: resolverResult.matchType,
        ocrConfidence: selectedConfidence,
        screenshotPath: screenshotResult.data.outputPath,
        selectedBounds: resolverResult.bestCandidate?.bounds,
        fallbackReason: REASON_CODES.ocrLowConfidence,
        postVerificationResult: "not_run",
      },
    };
  }

  if (actionKind === "assertText") {
    return {
      attempted: true,
      used: true,
      status: "success",
      reasonCode: REASON_CODES.ok,
      artifacts: screenshotResult.artifacts,
      attempts: screenshotResult.attempts + 1,
      retryCount: 0,
      nextSuggestions: [],
      ocrEvidence: {
        provider: ocrOutput.provider,
        engine: ocrOutput.engine,
        model: ocrOutput.model,
        durationMs: ocrOutput.durationMs,
        matchedText: resolverResult.bestCandidate?.text,
        candidateCount: resolverResult.candidates.length,
        matchType: resolverResult.matchType,
        ocrConfidence: selectedConfidence,
        screenshotPath: screenshotResult.data.outputPath,
        selectedBounds: resolverResult.bestCandidate?.bounds,
        postVerificationResult: "not_run",
      },
    };
  }

  let tapAttempts = 0;
  let performedTapAttempts = 0;
  let postStateResult: ToolResult<GetScreenSummaryData> | undefined;
  let verificationResult: ReturnType<typeof verifyOcrAction> | undefined;

  while (tapAttempts <= DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount && resolverResult.bestCandidate) {
    performedTapAttempts += 1;
    const tapExecutor = ocrFallbackTestHooks?.tap ?? tapWithMaestroTool;
    const tapResult = await tapExecutor({
      sessionId: params.input.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.input.harnessConfigPath,
      deviceId: params.deviceId,
      x: Math.round((resolverResult.bestCandidate.bounds.left + resolverResult.bestCandidate.bounds.right) / 2),
      y: Math.round((resolverResult.bestCandidate.bounds.top + resolverResult.bestCandidate.bounds.bottom) / 2),
      dryRun: params.input.dryRun,
    });
    if (tapResult.status === "failed") {
      return {
        attempted: true,
        used: false,
        status: tapResult.status,
        reasonCode: tapResult.reasonCode,
        artifacts: screenshotResult.artifacts,
        attempts: screenshotResult.attempts + tapResult.attempts,
        retryCount: Math.max(0, performedTapAttempts - 1),
        nextSuggestions: tapResult.nextSuggestions,
      };
    }

    const screenSummaryExecutor = ocrFallbackTestHooks?.getScreenSummary ?? getScreenSummaryWithMaestro;
    postStateResult = await screenSummaryExecutor({
      sessionId: params.input.sessionId,
      platform: params.platform,
      runnerProfile: params.runnerProfile,
      harnessConfigPath: params.input.harnessConfigPath,
      deviceId: params.deviceId,
      appId: params.appId,
      includeDebugSignals: params.input.includeDebugSignals ?? true,
      dryRun: params.input.dryRun,
    });
    verificationResult = verifyOcrAction({
      targetText,
      preState: params.preStateSummary,
      postState: postStateResult.data.screenSummary,
    });
    if (verificationResult.verified) {
      return {
        attempted: true,
        used: true,
        status: "success",
        reasonCode: REASON_CODES.ok,
        artifacts: Array.from(new Set([...screenshotResult.artifacts, ...postStateResult.artifacts])),
        attempts: screenshotResult.attempts + tapResult.attempts + postStateResult.attempts,
        retryCount: Math.max(0, performedTapAttempts - 1),
        nextSuggestions: [],
        postStateResult,
        ocrEvidence: {
          provider: ocrOutput.provider,
          engine: ocrOutput.engine,
          model: ocrOutput.model,
          durationMs: ocrOutput.durationMs,
          matchedText: resolverResult.bestCandidate.text,
          candidateCount: resolverResult.candidates.length,
          matchType: resolverResult.matchType,
          ocrConfidence: selectedConfidence,
          screenshotPath: screenshotResult.data.outputPath,
          selectedBounds: resolverResult.bestCandidate.bounds,
          postVerificationResult: "passed",
        },
      };
    }
    tapAttempts += 1;
    if (tapAttempts <= DEFAULT_OCR_FALLBACK_POLICY.maxRetryCount) {
      resolverResult = resolveTextTarget({ targetText, blocks: ocrOutput.blocks, fuzzy: false, maxCandidatesBeforeFail: DEFAULT_OCR_FALLBACK_POLICY.maxCandidatesBeforeFail });
    }
  }

  return {
    attempted: true,
    used: false,
    status: "failed",
    reasonCode: REASON_CODES.ocrPostVerifyFailed,
    artifacts: Array.from(new Set([...screenshotResult.artifacts, ...(postStateResult?.artifacts ?? [])])),
    attempts: screenshotResult.attempts + (postStateResult?.attempts ?? 0) + 1,
    retryCount: Math.max(0, performedTapAttempts - 1),
    nextSuggestions: [verificationResult?.summary ?? "OCR fallback tap did not produce the expected post-action state."],
    postStateResult,
    ocrEvidence: {
      provider: ocrOutput.provider,
      engine: ocrOutput.engine,
      model: ocrOutput.model,
      durationMs: ocrOutput.durationMs,
      matchedText: resolverResult.bestCandidate?.text,
      candidateCount: resolverResult.candidates.length,
      matchType: resolverResult.matchType,
      ocrConfidence: selectedConfidence,
      screenshotPath: screenshotResult.data.outputPath,
      selectedBounds: resolverResult.bestCandidate?.bounds,
      fallbackReason: REASON_CODES.ocrPostVerifyFailed,
      postVerificationResult: "failed",
    },
  };
}

function isInterruptionGuardPassed(status: ResolveInterruptionData["status"] | undefined): boolean {
  return status === "resolved" || status === "not_needed";
}

export async function performActionWithEvidenceWithMaestro(
  input: PerformActionWithEvidenceInput,
  deps: ActionOrchestratorDeps = {},
): Promise<ToolResult<PerformActionWithEvidenceData>> {
  const startTime = Date.now();
  const actionId = `action-${randomUUID()}`;
  const repoRoot = resolveRepoPath();
  const sessionRecord = await loadSessionRecord(repoRoot, input.sessionId);
  const platform = input.platform ?? sessionRecord?.session.platform;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: false,
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.1,
          outcome: "unknown",
        },
        evidenceDelta: { uiDiffSummary: "Action was not executed because platform could not be resolved." },
        lowLevelStatus: "failed",
        lowLevelReasonCode: REASON_CODES.configurationError,
      },
      nextSuggestions: ["Provide platform explicitly or start a session before calling perform_action_with_evidence."],
    };
  }

  const executeIntent = deps.executeIntentWithMaestro;
  if (!executeIntent) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        sessionRecordFound: Boolean(sessionRecord),
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.1,
          outcome: "unknown",
        },
        evidenceDelta: { uiDiffSummary: "Action executor is not configured." },
        lowLevelStatus: "failed",
        lowLevelReasonCode: REASON_CODES.configurationError,
      },
      nextSuggestions: ["Action executor is unavailable in current runtime context."],
    };
  }

  const runnerProfile = input.runnerProfile ?? sessionRecord?.session.profile ?? DEFAULT_RUNNER_PROFILE;
  const resolveInterruptionExecutor = interruptionGuardTestHooks?.resolveInterruption ?? resolveInterruptionWithMaestro;
  const resumeInterruptionExecutor = interruptionGuardTestHooks?.resumeInterruptedAction
    ?? ((resumeInput: ResumeInterruptedActionInput) => resumeInterruptedActionWithMaestro(resumeInput, { executeIntentWithMaestro: executeIntent }));

  const preActionInterruption = await resolveInterruptionExecutor({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    actionId,
    checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
    dryRun: input.dryRun,
  });
  if (!isInterruptionGuardPassed(preActionInterruption.data.status)) {
    const guardReasonCode = preActionInterruption.reasonCode === REASON_CODES.ok ? REASON_CODES.interruptionResolutionFailed : preActionInterruption.reasonCode;
    return {
      status: "failed",
      reasonCode: guardReasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: preActionInterruption.artifacts,
      data: {
        sessionRecordFound: Boolean(sessionRecord),
        outcome: {
          actionId,
          actionType: input.action.actionType,
          resolutionStrategy: "deterministic",
          stateChanged: false,
          fallbackUsed: false,
          retryCount: 0,
          confidence: 0.2,
          failureCategory: "blocked",
          outcome: "failed",
        },
        evidenceDelta: {
          uiDiffSummary: `Action was blocked by unresolved interruption (${preActionInterruption.data.status}).`,
        },
        lowLevelStatus: "failed",
        lowLevelReasonCode: guardReasonCode,
        preActionInterruption: preActionInterruption.data,
      },
      nextSuggestions: preActionInterruption.nextSuggestions.length > 0
        ? preActionInterruption.nextSuggestions
        : ["Resolve interruption manually or adjust policy/signature rules before retrying the action."],
    };
  }

  const preStateResult = await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: input.includeDebugSignals ?? true,
    dryRun: input.dryRun,
  });
  const lowLevelResult = await executeIntent({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    dryRun: input.dryRun,
  }, input.action);

  const preStateSummary = preStateResult.data.screenSummary;
  const ocrFallbackResult = canAttemptOcrFallback(input.action, lowLevelResult)
    ? await executeOcrFallback({
      input,
      platform,
      runnerProfile,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      preStateSummary,
    })
    : undefined;

  let actionStatus = ocrFallbackResult?.attempted ? ocrFallbackResult.status : lowLevelResult.status;
  let actionReasonCode = ocrFallbackResult?.attempted ? ocrFallbackResult.reasonCode : lowLevelResult.reasonCode;
  const fallbackUsed = Boolean(ocrFallbackResult?.used);
  const postStateResult = ocrFallbackResult?.postStateResult ?? await getScreenSummaryWithMaestro({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    includeDebugSignals: input.includeDebugSignals ?? true,
    dryRun: input.dryRun,
  });

  let postStateSummary = postStateResult.data.screenSummary;
  let stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
  const targetResolution = readResolutionSignal(lowLevelResult.data);
  let evidenceDelta = buildActionEvidenceDelta({
    preState: preStateSummary,
    postState: postStateSummary,
    preLogSummary: preStateResult.data.logSummary,
    postLogSummary: postStateResult.data.logSummary,
    preCrashSummary: preStateResult.data.crashSummary,
    postCrashSummary: postStateResult.data.crashSummary,
  });
  let failureCategory = classifyActionFailureCategory({
    finalStatus: actionStatus,
    finalReasonCode: actionReasonCode,
    preStateSummary,
    postStateSummary,
    lowLevelResult,
    stateChanged,
    targetResolution,
  });
  let stepState = classifyStepState({
    finalStatus: actionStatus,
    stateChanged,
    postState: postStateSummary,
    failureCategory,
  });
  let evidenceConfidence = computeEvidenceConfidence({
    stateChanged,
    preState: preStateSummary,
    postState: postStateSummary,
    evidenceDelta,
  });
  const maxRetryAttempts = stepState === "recoverable_waiting" || stepState === "partial_progress" ? 3 : stepState === "degraded_but_continue_safe" ? 2 : 1;
  let retryAttemptIndex = 1;
  let retryStopReason: string | undefined;

  while (shouldRetryStep({ stepState, evidenceConfidence, attemptIndex: retryAttemptIndex, maxAttempts: maxRetryAttempts })) {
    const retryPostStateResult = await getScreenSummaryWithMaestro({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      includeDebugSignals: input.includeDebugSignals ?? true,
      dryRun: input.dryRun,
    });
    retryAttemptIndex += 1;
    postStateSummary = retryPostStateResult.data.screenSummary;
    stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
    evidenceDelta = buildActionEvidenceDelta({
      preState: preStateSummary,
      postState: postStateSummary,
      preLogSummary: preStateResult.data.logSummary,
      postLogSummary: retryPostStateResult.data.logSummary,
      preCrashSummary: preStateResult.data.crashSummary,
      postCrashSummary: retryPostStateResult.data.crashSummary,
    });
    failureCategory = classifyActionFailureCategory({
      finalStatus: actionStatus,
      finalReasonCode: actionReasonCode,
      preStateSummary,
      postStateSummary,
      lowLevelResult,
      stateChanged,
      targetResolution,
    });
    stepState = classifyStepState({
      finalStatus: actionStatus,
      stateChanged,
      postState: postStateSummary,
      failureCategory,
    });
    evidenceConfidence = computeEvidenceConfidence({
      stateChanged,
      preState: preStateSummary,
      postState: postStateSummary,
      evidenceDelta,
    });
    if (stateChanged || stepState === "checkpoint_candidate") {
      break;
    }
  }

  if (!stateChanged && retryAttemptIndex >= maxRetryAttempts && (stepState === "recoverable_waiting" || stepState === "partial_progress" || stepState === "degraded_but_continue_safe")) {
    retryStopReason = "retry_budget_exhausted_without_state_change";
    actionStatus = "failed";
    actionReasonCode = postStateSummary.readiness === "waiting_network"
      ? REASON_CODES.networkWaitRetryExhausted
      : REASON_CODES.retryExhaustedNoStateChange;
  }

  if (postStateSummary.readiness === "backend_failed_terminal") {
    actionStatus = "failed";
    actionReasonCode = REASON_CODES.networkBackendTerminal;
    stepState = "terminal_stop";
    retryStopReason = "backend_terminal_stop_early";
  }
  if (postStateSummary.readiness === "offline_terminal") {
    actionStatus = "failed";
    actionReasonCode = REASON_CODES.networkOfflineTerminal;
    stepState = "terminal_stop";
    retryStopReason = "offline_terminal_stop_early";
  }

  const retryDecisionTrace: RetryDecisionTrace = {
    stepState,
    evidenceConfidence,
    retryAllowed: shouldRetryStep({ stepState, evidenceConfidence, attemptIndex: retryAttemptIndex, maxAttempts: maxRetryAttempts }),
    maxAttempts: maxRetryAttempts,
    attemptIndex: retryAttemptIndex,
    backoffClass: retryBackoffClassForStep(stepState),
    stateChangeRequired: true,
    stopReason: retryStopReason,
  };

  const postActionVerificationTrace = buildPostActionVerificationTrace({
    stepState,
    stateChanged,
    preState: preStateSummary,
    postState: postStateSummary,
    attempts: retryAttemptIndex,
  });
  const checkpointDecisionTrace = buildCheckpointDecisionTraceForAction({
    actionId,
    stepState,
    failureCategory,
    stateChanged,
  });

  let postActionRefreshAttempted = false;
  let refreshedPostStateSummary: StateSummary | undefined;
  if (shouldAttemptPostActionRefresh({ failureCategory, finalStatus: actionStatus, stateChanged })) {
    postActionRefreshAttempted = true;
    const refreshedPostStateResult = await getScreenSummaryWithMaestro({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      includeDebugSignals: input.includeDebugSignals ?? true,
      dryRun: input.dryRun,
    });
    refreshedPostStateSummary = refreshedPostStateResult.data.screenSummary;
    if (JSON.stringify(postStateSummary) !== JSON.stringify(refreshedPostStateSummary)) {
      postStateSummary = refreshedPostStateSummary;
      stateChanged = JSON.stringify(preStateSummary) !== JSON.stringify(postStateSummary);
      evidenceDelta = buildActionEvidenceDelta({
        preState: preStateSummary,
        postState: postStateSummary,
        preLogSummary: preStateResult.data.logSummary,
        postLogSummary: refreshedPostStateResult.data.logSummary,
        preCrashSummary: preStateResult.data.crashSummary,
        postCrashSummary: refreshedPostStateResult.data.crashSummary,
      });
      failureCategory = classifyActionFailureCategory({
        finalStatus: actionStatus,
        finalReasonCode: actionReasonCode,
        preStateSummary,
        postStateSummary,
        lowLevelResult,
        stateChanged,
        targetResolution,
      });
    }
  }

  const outcome: ActionOutcomeSummary = {
    actionId,
    actionType: input.action.actionType,
    resolutionStrategy: fallbackUsed ? "ocr" : "deterministic",
    preState: preStateSummary,
    postState: postStateSummary,
    stateChanged,
    fallbackUsed,
    retryCount: (ocrFallbackResult?.retryCount ?? 0) + Math.max(0, retryAttemptIndex - 1),
    stepState,
    evidenceConfidence,
    networkReadinessClass: classifyNetworkReadiness(postStateSummary),
    postconditionMet: postActionVerificationTrace.postconditionMet,
    targetQuality: classifyTargetQuality({ failureCategory, finalStatus: actionStatus, fallbackUsed, stateChanged }),
    failureCategory,
    confidence: ocrFallbackResult?.ocrEvidence?.ocrConfidence ?? buildActionOutcomeConfidence(actionStatus, stateChanged),
    ocrEvidence: ocrFallbackResult?.ocrEvidence,
    outcome: actionStatus === "success" ? "success" : actionStatus === "partial" ? "partial" : "failed",
  };

  const evidence = [...(preStateResult.data.evidence ?? []), ...(postStateResult.data.evidence ?? [])];
  const artifacts = Array.from(new Set([
    ...preStateResult.artifacts,
    ...lowLevelResult.artifacts,
    ...(ocrFallbackResult?.artifacts ?? []),
    ...postStateResult.artifacts,
  ]));
  const actionEvent: SessionTimelineEvent = {
    eventId: actionId,
    timestamp: new Date().toISOString(),
    type: "action_outcome_recorded",
    detail: evidenceDelta.uiDiffSummary,
    eventType: "action_outcome",
    actionId,
    layer: "action",
    summary: `${input.action.actionType} -> ${outcome.outcome}`,
    artifactRefs: artifacts,
    stateSummary: postStateSummary,
    evidenceCompleteness: {
      level: artifacts.length >= 3 ? "complete" : artifacts.length > 0 ? "partial" : "missing",
      capturedKinds: evidence.map((item) => item.kind),
      missingEvidence: artifacts.length > 0 ? [] : ["pre/post evidence was not captured"],
    },
  };

  const persistedSessionState = sessionRecord
    ? await persistSessionState(repoRoot, input.sessionId, postStateSummary, actionEvent, artifacts)
    : undefined;
  const retryTimelineMarkers = uniqueNonEmpty([
    `step_state:${stepState}`,
    `evidence_confidence:${evidenceConfidence}`,
    retryStopReason,
  ], 6);
  if (sessionRecord && retryTimelineMarkers.length > 0) {
    await persistSessionState(repoRoot, input.sessionId, postStateSummary, {
      timestamp: new Date().toISOString(),
      type: "action_retry_decision",
      eventType: "retry_decision",
      actionId,
      layer: "action",
      detail: retryTimelineMarkers.join("; "),
      summary: retryDecisionTrace.retryAllowed ? "retry_allowed" : "retry_stopped",
      artifactRefs: artifacts,
      stateSummary: postStateSummary,
    }, artifacts);
  }
  if (outcome.outcome === "success") {
    await recordBaselineEntry(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      actionType: outcome.actionType,
      screenId: outcome.postState?.screenId ?? outcome.preState?.screenId,
      updatedAt: new Date().toISOString(),
    });
  }

  const actionabilityReview = buildActionabilityReview({
    preStateSummary,
    postStateSummary,
    latestKnownState: sessionRecord?.session.latestStateSummary,
    lowLevelStatus: actionStatus,
    lowLevelReasonCode: actionReasonCode,
    targetResolution,
    stateChanged,
  });
  if (postActionRefreshAttempted) {
    const refreshSignal = refreshedPostStateSummary && JSON.stringify(postStateResult.data.screenSummary) !== JSON.stringify(refreshedPostStateSummary)
      ? "post_action_refresh_detected_additional_state_change"
      : "post_action_refresh_no_additional_change";
    actionabilityReview.unshift(refreshSignal);
    if (refreshSignal === "post_action_refresh_no_additional_change") {
      actionabilityReview.unshift("refresh_signal:noop");
      actionabilityReview.unshift(actionabilityReview.some((item) => item.startsWith("stale_state_candidate:"))
        ? "retry_tier_code:refresh_context_stale_state"
        : "retry_tier_code:refresh_context_noop");
    }
  }

  const retryRecommendationTier = classifyRetryRecommendationTier({
    finalStatus: actionStatus,
    stateChanged,
    postActionRefreshAttempted,
    actionabilityReview,
    failureCategory,
    ocrFallbackSuggestions: ocrFallbackResult?.nextSuggestions,
  });
  const retryRecommendation = buildRetryRecommendation({
    tier: retryRecommendationTier ?? "none",
    failureCategory,
    actionabilityReview,
  });

  const persistedAction = await persistActionRecord(repoRoot, {
    actionId,
    sessionId: input.sessionId,
    intent: input.action,
    outcome,
    retryRecommendationTier,
    retryRecommendation,
    retryDecisionTrace,
    postActionVerificationTrace,
    checkpointDecisionTrace,
    actionabilityReview,
    evidenceDelta,
    evidence,
    lowLevelStatus: actionStatus,
    lowLevelReasonCode: actionReasonCode,
    updatedAt: new Date().toISOString(),
  });
  let allArtifacts = persistedAction.relativePath ? [persistedAction.relativePath, ...artifacts] : artifacts;

  const postActionInterruption = await resolveInterruptionExecutor({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
    appId: input.appId ?? sessionRecord?.session.appId,
    actionId,
    checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
    dryRun: input.dryRun,
  });

  let finalToolStatus = actionStatus;
  let finalToolReasonCode = actionReasonCode;
  let finalOutcome = outcome;
  const finalActionabilityReview = [...actionabilityReview];
  let finalLowLevelStatus = actionStatus;
  let finalLowLevelReasonCode = actionReasonCode;

  allArtifacts = Array.from(new Set([...allArtifacts, ...postActionInterruption.artifacts]));

  if (!isInterruptionGuardPassed(postActionInterruption.data.status)) {
    finalToolStatus = "failed";
    finalToolReasonCode = postActionInterruption.reasonCode === REASON_CODES.ok
      ? REASON_CODES.interruptionResolutionFailed
      : postActionInterruption.reasonCode;
    finalLowLevelStatus = "failed";
    finalLowLevelReasonCode = finalToolReasonCode;
    finalOutcome = {
      ...finalOutcome,
      outcome: "failed",
      failureCategory: "blocked",
      confidence: Math.min(finalOutcome.confidence ?? 0.5, 0.4),
    };
    finalActionabilityReview.unshift(`post_interruption_status:${postActionInterruption.data.status}`);
  } else if (postActionInterruption.data.status === "resolved") {
    const resumed = await resumeInterruptionExecutor({
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId: input.deviceId ?? sessionRecord?.session.deviceId,
      appId: input.appId ?? sessionRecord?.session.appId,
      checkpoint: buildInterruptionCheckpoint(input.sessionId, platform, actionId, input.action),
      dryRun: input.dryRun,
    });
    allArtifacts = Array.from(new Set([...allArtifacts, ...resumed.artifacts]));
    if (!resumed.data.resumed) {
      finalToolStatus = "failed";
      finalToolReasonCode = resumed.reasonCode === REASON_CODES.ok
        ? REASON_CODES.interruptionRecoveryStateDrift
        : resumed.reasonCode;
      finalLowLevelStatus = "failed";
      finalLowLevelReasonCode = finalToolReasonCode;
      finalOutcome = {
        ...finalOutcome,
        outcome: "failed",
        failureCategory: "blocked",
      };
      finalActionabilityReview.unshift("post_interruption_resume_failed");
    }
  }

  if (finalToolStatus !== actionStatus || finalToolReasonCode !== actionReasonCode) {
    const persistedAfterInterruption = await persistActionRecord(repoRoot, {
      actionId,
      sessionId: input.sessionId,
      intent: input.action,
      outcome: finalOutcome,
      retryRecommendationTier,
      retryRecommendation,
      retryDecisionTrace,
      postActionVerificationTrace,
      checkpointDecisionTrace,
      actionabilityReview: finalActionabilityReview,
      evidenceDelta,
      evidence,
      lowLevelStatus: finalLowLevelStatus,
      lowLevelReasonCode: finalLowLevelReasonCode,
      updatedAt: new Date().toISOString(),
    });
    if (persistedAfterInterruption.relativePath) {
      allArtifacts = Array.from(new Set([persistedAfterInterruption.relativePath, ...allArtifacts]));
    }
  }

  return {
    status: finalToolStatus,
    reasonCode: finalToolReasonCode,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: allArtifacts,
    data: {
      sessionRecordFound: Boolean(sessionRecord),
      outcome: finalOutcome,
      evidenceDelta,
      preStateSummary,
      postStateSummary,
      postActionRefreshAttempted: postActionRefreshAttempted || undefined,
      retryRecommendationTier,
      retryRecommendation,
      retryDecisionTrace,
      postActionVerificationTrace,
      checkpointDecisionTrace,
      timelineDecisionMarkers: uniqueNonEmpty([
        ...retryTimelineMarkers,
        postActionInterruption.data.status !== "not_needed" ? `post_interruption:${postActionInterruption.data.status}` : undefined,
      ], 8),
      actionabilityReview: finalActionabilityReview,
      lowLevelStatus: finalLowLevelStatus,
      lowLevelReasonCode: finalLowLevelReasonCode,
      evidence,
      sessionAuditPath: persistedSessionState?.auditPath,
      preActionInterruption: preActionInterruption.data,
      postActionInterruption: postActionInterruption.data,
    },
    nextSuggestions: buildRetryRecommendations({
      finalStatus: finalToolStatus,
      stateChanged,
      postActionRefreshAttempted,
      actionabilityReview: finalActionabilityReview,
      failureCategory: finalOutcome.failureCategory,
      ocrFallbackSuggestions: ocrFallbackResult?.nextSuggestions,
    }),
  };
}
