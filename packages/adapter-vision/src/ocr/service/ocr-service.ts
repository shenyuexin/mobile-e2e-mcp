import type { StateSummary } from "@mobile-e2e-mcp/contracts";
import { MacVisionOcrProvider } from "../providers/mac-vision-ocr-provider.js";
import { createOcrFallbackPolicy, exceedsOcrCandidateLimit, minimumConfidenceForOcrAction, shouldUseOcrFallback } from "../policy/fallback-policy.js";
import { resolveTextTarget } from "../resolver/resolve-text-target.js";
import type {
  OcrEvidence,
  OcrFallbackActionType,
  OcrFallbackBlockReason,
  OcrFallbackPolicy,
  OcrInput,
  OcrMatchType,
  OcrOutput,
  OcrProvider,
  OcrTextBlock,
  ResolveTextTargetInput,
  ResolveTextTargetResult,
  VerifyOcrActionInput,
  VerifyOcrActionResult,
} from "../types.js";
import { verifyOcrAction } from "../verification/verify-ocr-action.js";

export type OcrServiceStatus =
  | "blocked_by_policy"
  | "provider_error"
  | "no_match"
  | "ambiguous"
  | "candidate_limit"
  | "low_confidence"
  | "ready_to_execute"
  | "executed"
  | "verification_failed";

export interface OcrServiceOptions {
  provider?: OcrProvider;
  policy?: Partial<OcrFallbackPolicy>;
  now?: () => number;
}

export interface OcrServiceExecutionContext {
  target: OcrTextBlock;
  targetText: string;
  action: OcrFallbackActionType;
  ocr: OcrOutput;
  resolution: ResolveTextTargetResult;
  evidence: OcrEvidence;
}

export interface OcrServiceRunInput<TExecutionResult = void> extends OcrInput {
  action: OcrFallbackActionType;
  targetText: string;
  expectedText?: string | string[];
  deterministicFailed?: boolean;
  semanticFailed?: boolean;
  state?: StateSummary;
  screenshotCapturedAt?: string | number | Date;
  retryCount?: number;
  fallbackReason?: string;
  resolver?: Omit<ResolveTextTargetInput, "targetText" | "blocks">;
  executeAction?: (context: OcrServiceExecutionContext) => Promise<TExecutionResult>;
  buildVerificationInput?: (context: OcrServiceExecutionContext & { executionResult: TExecutionResult }) => Promise<VerifyOcrActionInput> | VerifyOcrActionInput;
}

export interface OcrServiceResult<TExecutionResult = void> {
  status: OcrServiceStatus;
  allowed: boolean;
  blockReasons: OcrFallbackBlockReason[];
  minimumConfidence: number;
  ocr?: OcrOutput;
  resolution?: ResolveTextTargetResult;
  matchedTarget?: OcrTextBlock;
  evidence?: OcrEvidence;
  executionResult?: TExecutionResult;
  verification?: VerifyOcrActionResult;
  error?: Error;
}

export function buildOcrEvidence(params: {
  ocr: OcrOutput;
  resolution?: ResolveTextTargetResult;
  matchedText?: string;
  fallbackReason?: string;
  verificationResult?: VerifyOcrActionResult;
}): OcrEvidence {
  return {
    resolutionStrategy: "ocr",
    provider: params.ocr.provider,
    engine: params.ocr.engine,
    model: params.ocr.model,
    durationMs: params.ocr.durationMs,
    matchedText: params.matchedText,
    candidateCount: params.resolution?.candidates.length ?? params.ocr.blocks.length,
    matchType: params.resolution?.matchType as OcrMatchType | undefined,
    ocrConfidence: params.resolution?.bestCandidate?.confidence ?? params.resolution?.confidence,
    screenshotPath: params.ocr.screenshotPath,
    fallbackReason: params.fallbackReason,
    verificationResult: params.verificationResult?.status ?? "not_run",
  };
}

export class OcrService {
  private readonly provider: OcrProvider;
  private readonly policy: OcrFallbackPolicy;
  private readonly now: () => number;

  constructor(options: OcrServiceOptions = {}) {
    this.provider = options.provider ?? new MacVisionOcrProvider();
    this.policy = createOcrFallbackPolicy(options.policy);
    this.now = options.now ?? (() => Date.now());
  }

  async executeTextAction<TExecutionResult = void>(input: OcrServiceRunInput<TExecutionResult>): Promise<OcrServiceResult<TExecutionResult>> {
    const minimumConfidence = minimumConfidenceForOcrAction(input.action, this.policy);
    const policyDecision = shouldUseOcrFallback({
      action: input.action,
      deterministicFailed: input.deterministicFailed,
      semanticFailed: input.semanticFailed,
      screenshotCapturedAt: input.screenshotCapturedAt,
      state: input.state,
      retryCount: input.retryCount,
      nowMs: this.now(),
    }, this.policy);

    if (!policyDecision.allowed) {
      return {
        status: "blocked_by_policy",
        allowed: false,
        blockReasons: policyDecision.reasons,
        minimumConfidence,
      };
    }

    let ocr: OcrOutput;
    try {
      ocr = await this.provider.extractTextRegions(input);
    } catch (error) {
      return {
        status: "provider_error",
        allowed: false,
        blockReasons: [],
        minimumConfidence,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    const resolution = resolveTextTarget({
      targetText: input.targetText,
      blocks: ocr.blocks,
      ...(input.resolver ?? {}),
    });
    const evidence = buildOcrEvidence({
      ocr,
      resolution,
      matchedText: resolution.bestCandidate?.text,
      fallbackReason: input.fallbackReason,
    });

    if (resolution.status === "no_match" || resolution.status === "invalid_input") {
      return {
        status: "no_match",
        allowed: false,
        blockReasons: [],
        minimumConfidence,
        ocr,
        resolution,
        evidence,
      };
    }

    if (resolution.status === "ambiguous") {
      return {
        status: "ambiguous",
        allowed: false,
        blockReasons: [],
        minimumConfidence,
        ocr,
        resolution,
        evidence,
      };
    }

    if (exceedsOcrCandidateLimit(resolution.candidates.length, this.policy)) {
      return {
        status: "candidate_limit",
        allowed: false,
        blockReasons: ["too_many_candidates"],
        minimumConfidence,
        ocr,
        resolution,
        evidence,
      };
    }

    const selectedConfidence = resolution.bestCandidate?.confidence ?? resolution.confidence;
    if (selectedConfidence < minimumConfidence) {
      return {
        status: "low_confidence",
        allowed: false,
        blockReasons: ["low_confidence"],
        minimumConfidence,
        ocr,
        resolution,
        evidence,
      };
    }

    const target = resolution.bestCandidate;
    if (!target) {
      return {
        status: "no_match",
        allowed: false,
        blockReasons: [],
        minimumConfidence,
        ocr,
        resolution,
        evidence,
      };
    }

    const executionContext: OcrServiceExecutionContext = {
      target,
      targetText: input.targetText,
      action: input.action,
      ocr,
      resolution,
      evidence,
    };

    if (!input.executeAction) {
      return {
        status: "ready_to_execute",
        allowed: true,
        blockReasons: [],
        minimumConfidence,
        ocr,
        resolution,
        matchedTarget: target,
        evidence,
      };
    }

    const executionResult = await input.executeAction(executionContext);
    if (!input.buildVerificationInput) {
      return {
        status: "executed",
        allowed: true,
        blockReasons: [],
        minimumConfidence,
        ocr,
        resolution,
        matchedTarget: target,
        evidence,
        executionResult,
      };
    }

    const verificationInput = await input.buildVerificationInput({
      ...executionContext,
      executionResult,
    });
    const verification = verifyOcrAction({
      ...verificationInput,
      targetText: verificationInput.targetText ?? input.targetText,
      expectedText: verificationInput.expectedText ?? input.expectedText,
    });
    const verifiedEvidence = buildOcrEvidence({
      ocr,
      resolution,
      matchedText: target.text,
      fallbackReason: input.fallbackReason,
      verificationResult: verification,
    });

    return {
      status: verification.verified ? "executed" : "verification_failed",
      allowed: verification.verified,
      blockReasons: [],
      minimumConfidence,
      ocr,
      resolution,
      matchedTarget: target,
      evidence: verifiedEvidence,
      executionResult,
      verification,
    };
  }
}
