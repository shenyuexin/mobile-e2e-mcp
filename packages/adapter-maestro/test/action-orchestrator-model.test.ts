import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildActionEvidenceDelta,
  buildRetryRecommendation,
  buildRetryRecommendations,
  classifyActionFailureCategory,
  classifyRetryRecommendationTier,
  classifyStepState,
  computeEvidenceConfidence,
  readResolutionSignal,
  shouldRetryStep,
} from "../src/action-orchestrator-model.ts";

test("classifyStepState marks blocked failures as replay recommended", () => {
  const stepState = classifyStepState({
    finalStatus: "failed",
    stateChanged: false,
    postState: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
    },
    failureCategory: "blocked",
  });

  assert.equal(stepState, "replay_recommended");
});

test("computeEvidenceConfidence is strong when screen identity changes", () => {
  const confidence = computeEvidenceConfidence({
    stateChanged: true,
    preState: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
      screenId: "shipping",
    },
    postState: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
      screenId: "confirmation",
    },
    evidenceDelta: {
      uiDiffSummary: "screen shipping -> confirmation",
    },
  });

  assert.equal(confidence, "strong");
});

test("classifyActionFailureCategory treats obscured targets as blocked", () => {
  const category = classifyActionFailureCategory({
    finalStatus: "partial",
    finalReasonCode: REASON_CODES.actionFocusFailed,
    preStateSummary: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
    },
    postStateSummary: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
    },
    lowLevelResult: {
      status: "partial",
      reasonCode: REASON_CODES.actionFocusFailed,
      sessionId: "session",
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data: {},
      nextSuggestions: [],
    },
    stateChanged: false,
    targetResolution: {
      status: "resolved",
      obscuredByHigherRanked: true,
    },
  });

  assert.equal(category, "blocked");
});

test("retry recommendation tier prefers refresh_context after noop refresh", () => {
  const tier = classifyRetryRecommendationTier({
    finalStatus: "partial",
    stateChanged: false,
    postActionRefreshAttempted: true,
    actionabilityReview: [
      "refresh_signal:noop",
      "retry_tier_code:refresh_context_noop",
      "post_action_refresh_no_additional_change",
    ],
    failureCategory: "no_state_change",
  });

  assert.equal(tier, "refresh_context");
});

test("buildRetryRecommendation includes selector guidance for refine_selector tier", () => {
  const recommendation = buildRetryRecommendation({
    tier: "refine_selector",
    failureCategory: "selector_ambiguous",
    actionabilityReview: [
      "target_suggested_selector:{\"resourceId\":\"primary_cta\"}",
      "target_score_delta:2",
      "target_visibility:visible,clickable",
    ],
  });

  assert.equal(recommendation.tier, "refine_selector");
  assert.equal(recommendation.reason.includes("Multiple candidates matched"), true);
  assert.equal(recommendation.suggestedAction.includes("primary_cta"), true);
});

test("buildRetryRecommendations preserves selector refinement guidance", () => {
  const suggestions = buildRetryRecommendations({
    finalStatus: "failed",
    stateChanged: false,
    postActionRefreshAttempted: false,
    actionabilityReview: [
      "target_resolution:ambiguous",
      "target_suggested_selector:{\"resourceId\":\"primary_cta\"}",
    ],
    failureCategory: "selector_ambiguous",
  });

  assert.equal(suggestions[0]?.includes("refining the selector"), true);
  assert.equal(suggestions[1]?.includes("primary_cta"), true);
});

test("buildActionEvidenceDelta reports new runtime signals and readiness change", () => {
  const delta = buildActionEvidenceDelta({
    preState: {
      appPhase: "ready",
      readiness: "waiting_network",
      blockingSignals: [],
      screenTitle: "Shipping",
    },
    postState: {
      appPhase: "ready",
      readiness: "ready",
      blockingSignals: [],
      screenTitle: "Confirmation",
    },
    preLogSummary: {
      totalLines: 1,
      matchedLines: 1,
      sampleLines: ["timeout"],
      topSignals: [{ category: "timeout", count: 1, sample: "timeout" }],
    },
    postLogSummary: {
      totalLines: 2,
      matchedLines: 2,
      sampleLines: ["timeout", "thanks rendered"],
      topSignals: [
        { category: "timeout", count: 1, sample: "timeout" },
        { category: "other", count: 1, sample: "thanks rendered" },
      ],
    },
  });

  assert.equal(delta.uiDiffSummary?.includes("screen Shipping -> Confirmation"), true);
  assert.equal(delta.logDeltaSummary?.includes("thanks rendered"), true);
  assert.equal(delta.networkDeltaSummary, "Network/readiness changed: waiting_network -> ready");
});

test("readResolutionSignal extracts ambiguity and visibility hints", () => {
  const signal = readResolutionSignal({
    resolution: {
      status: "ambiguous",
      matchCount: 2,
      bestCandidate: {
        obscuredByHigherRanked: true,
        visibilityHeuristics: ["heavy_overlap:0.8", "low_viewport_visibility:0.2"],
      },
      ambiguityDiff: {
        scoreDelta: 3,
        suggestedSelectors: [{ resourceId: "primary_cta" }],
      },
    },
  });

  assert.equal(signal?.status, "ambiguous");
  assert.equal(signal?.matchCount, 2);
  assert.equal(signal?.obscuredByHigherRanked, true);
  assert.equal(signal?.scoreDelta, 3);
  assert.equal(signal?.suggestedSelector?.includes("primary_cta"), true);
  assert.equal(signal?.visibilityHeuristics?.[0], "heavy_overlap:0.8");
});

test("shouldRetryStep stops low-confidence retries after the second attempt", () => {
  assert.equal(
    shouldRetryStep({
      stepState: "recoverable_waiting",
      evidenceConfidence: "none",
      attemptIndex: 2,
      maxAttempts: 3,
    }),
    false,
  );
});
