import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  DEFAULT_OCR_FALLBACK_POLICY,
  MacVisionOcrProvider,
  OcrProviderExecutionError,
  OcrService,
  minimumConfidenceForOcrAction,
  normalizeOcrText,
  resolveTextTarget,
  shouldUseOcrFallback,
  verifyOcrAction,
} from "../src/index.ts";

test("normalizeOcrText collapses whitespace and case", () => {
  assert.equal(normalizeOcrText("  Sign   In  "), "sign in");
});

test("resolveTextTarget matches exact text", () => {
  const result = resolveTextTarget({
    targetText: "Sign In",
    blocks: [{ text: "Sign In", confidence: 0.91, bounds: { left: 1, top: 1, right: 10, bottom: 10 } }],
  });
  assert.equal(result.matched, true);
});

test("shouldUseOcrFallback enforces deterministic-first", () => {
  const decision = shouldUseOcrFallback({
    action: "tap",
    deterministicFailed: true,
    semanticFailed: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.minimumConfidence, DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap);
});

test("minimumConfidenceForOcrAction returns tap threshold", () => {
  assert.equal(minimumConfidenceForOcrAction("tap"), DEFAULT_OCR_FALLBACK_POLICY.minConfidenceForTap);
});

test("verifyOcrAction succeeds when state changes", () => {
  const result = verifyOcrAction({
    preState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Login" },
    postState: { appPhase: "ready", readiness: "ready", blockingSignals: [], screenTitle: "Home" },
  });
  assert.equal(result.verified, true);
});

test("MacVisionOcrProvider normalizes injected execution output", async () => {
  const provider = new MacVisionOcrProvider({
    execute: async () => ({ durationMs: 2, observations: [{ text: "Hello", confidence: 0.88, bounds: { left: 1, top: 2, right: 30, bottom: 40 } }] }),
  });
  const result = await provider.extractTextRegions({ screenshotPath: "/tmp/test.png", platform: "ios" });
  assert.equal(result.blocks[0]?.text, "Hello");
});

test("MacVisionOcrProvider maps executor failures", async () => {
  const provider = new MacVisionOcrProvider({
    execute: async () => { throw new OcrProviderExecutionError("execution_failed", "Vision failed", undefined, REASON_CODES.ocrProviderError); },
  });
  await assert.rejects(provider.extractTextRegions({ screenshotPath: "/tmp/test.png", platform: "ios" }));
});

test("OcrService exposes execution API", () => {
  const service = new OcrService({ defaultProvider: { name: "mac-vision", provider: { providerName: "mac-vision", engineName: "apple-vision", extractTextRegions: async () => ({ provider: "mac-vision", engine: "apple-vision", durationMs: 1, screenshotPath: "x", blocks: [] }) } } });
  assert.equal(typeof service.executeTextAction, "function");
});
