import type { StateSummary } from "@mobile-e2e-mcp/contracts";
import {
  coerceScreenshotTimestamp,
  type OcrFallbackActionType,
  type OcrFallbackContext,
  type OcrFallbackDecision,
  type OcrFallbackPolicy,
} from "../types.js";

export const DEFAULT_OCR_FALLBACK_POLICY: OcrFallbackPolicy = {
  enabled: true,
  allowedActions: ["tap", "assertText"],
  blockedActions: ["delete", "purchase", "confirmPayment"],
  minConfidenceForAssert: 0.7,
  minConfidenceForTap: 0.82,
  minConfidenceForRiskyAction: 0.93,
  maxCandidatesBeforeFail: 5,
  screenshotMaxAgeMs: 5000,
  maxRetryCount: 1,
  loadingTextPatterns: ["loading", "please wait", "signing in", "fetching", "refreshing", "syncing", "submitting"],
  transitionTextPatterns: ["opening", "closing", "redirecting", "navigating", "transition", "animating"],
  loadingBlockingSignals: ["loading", "loading_indicator", "progress", "spinner", "busy"],
  transitionBlockingSignals: ["transition", "navigation_transition", "animating", "launching"],
};

function includesPattern(value: string, patterns: string[]): boolean {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function collectStateTexts(state: StateSummary | undefined): string[] {
  if (!state) {
    return [];
  }
  return [
    state.screenId,
    state.screenTitle,
    state.routeName,
    ...(state.blockingSignals ?? []),
    ...(state.candidateActions ?? []),
    ...(state.topVisibleTexts ?? []),
    ...(state.recentFailures ?? []),
  ].filter((value): value is string => Boolean(value));
}

export function createOcrFallbackPolicy(overrides: Partial<OcrFallbackPolicy> = {}): OcrFallbackPolicy {
  return {
    ...DEFAULT_OCR_FALLBACK_POLICY,
    ...overrides,
    allowedActions: overrides.allowedActions ?? DEFAULT_OCR_FALLBACK_POLICY.allowedActions,
    blockedActions: overrides.blockedActions ?? DEFAULT_OCR_FALLBACK_POLICY.blockedActions,
    loadingTextPatterns: overrides.loadingTextPatterns ?? DEFAULT_OCR_FALLBACK_POLICY.loadingTextPatterns,
    transitionTextPatterns: overrides.transitionTextPatterns ?? DEFAULT_OCR_FALLBACK_POLICY.transitionTextPatterns,
    loadingBlockingSignals: overrides.loadingBlockingSignals ?? DEFAULT_OCR_FALLBACK_POLICY.loadingBlockingSignals,
    transitionBlockingSignals: overrides.transitionBlockingSignals ?? DEFAULT_OCR_FALLBACK_POLICY.transitionBlockingSignals,
  };
}

export function minimumConfidenceForOcrAction(action: OcrFallbackActionType, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): number {
  if (action === "assertText") {
    return policy.minConfidenceForAssert;
  }
  if (action === "tap" || action === "longPress") {
    return policy.minConfidenceForTap;
  }
  return policy.minConfidenceForRiskyAction;
}

export function isScreenshotFresh(
  screenshotCapturedAt: string | number | Date | undefined,
  policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY,
  nowMs = Date.now(),
): boolean {
  const capturedAtMs = coerceScreenshotTimestamp(screenshotCapturedAt);
  if (capturedAtMs === undefined) {
    return true;
  }
  return nowMs - capturedAtMs <= policy.screenshotMaxAgeMs;
}

export function hasLoadingBlockers(state: StateSummary | undefined, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): boolean {
  if (!state) {
    return false;
  }
  if (state.appPhase === "loading" || state.readiness === "waiting_network" || state.readiness === "waiting_ui") {
    return true;
  }
  return collectStateTexts(state).some((value) => includesPattern(value, [...policy.loadingTextPatterns, ...policy.loadingBlockingSignals]));
}

export function hasTransitionBlockers(state: StateSummary | undefined, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): boolean {
  if (!state) {
    return false;
  }
  if (state.appPhase === "launching") {
    return true;
  }
  return collectStateTexts(state).some((value) => includesPattern(value, [...policy.transitionTextPatterns, ...policy.transitionBlockingSignals]));
}

export function isActionAllowedByOcrPolicy(action: OcrFallbackActionType, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): boolean {
  return !policy.blockedActions.includes(action) && policy.allowedActions.includes(action);
}

export function exceedsOcrCandidateLimit(candidateCount: number | undefined, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): boolean {
  return candidateCount !== undefined && candidateCount > policy.maxCandidatesBeforeFail;
}

export function hasRemainingOcrRetries(retryCount: number | undefined, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): boolean {
  return (retryCount ?? 0) < policy.maxRetryCount;
}

export function shouldUseOcrFallback(context: OcrFallbackContext, policy: OcrFallbackPolicy = DEFAULT_OCR_FALLBACK_POLICY): OcrFallbackDecision {
  const reasons: OcrFallbackDecision["reasons"] = [];
  const minimumConfidence = minimumConfidenceForOcrAction(context.action, policy);

  if (!policy.enabled) {
    reasons.push("disabled");
  }
  if (!(context.deterministicFailed ?? true)) {
    reasons.push("deterministic_not_failed");
  }
  if (!(context.semanticFailed ?? true)) {
    reasons.push("semantic_not_failed");
  }
  if (!policy.allowedActions.includes(context.action)) {
    reasons.push("action_not_allowed");
  }
  if (policy.blockedActions.includes(context.action)) {
    reasons.push("action_blocked");
  }
  if (!isScreenshotFresh(context.screenshotCapturedAt, policy, context.nowMs ?? Date.now())) {
    reasons.push("screenshot_stale");
  }
  if (hasLoadingBlockers(context.state, policy)) {
    reasons.push("loading");
  }
  if (hasTransitionBlockers(context.state, policy)) {
    reasons.push("transition");
  }
  if (exceedsOcrCandidateLimit(context.candidateCount, policy)) {
    reasons.push("too_many_candidates");
  }
  if ((context.retryCount ?? 0) > policy.maxRetryCount) {
    reasons.push("retry_limit");
  }
  if (context.confidence !== undefined && context.confidence < minimumConfidence) {
    reasons.push("low_confidence");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    minimumConfidence,
    candidateLimit: policy.maxCandidatesBeforeFail,
    retryLimit: policy.maxRetryCount,
  };
}
